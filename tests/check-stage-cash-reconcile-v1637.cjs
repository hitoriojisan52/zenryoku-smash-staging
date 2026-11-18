#!/usr/bin/env node
'use strict';
// In-memory payment-independent cash audit tests. Does not modify Google data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const CASH=require('../cash-reconcile.js'),html=read('live.html'),ui=read('live.js'),
 gas=read('gas-staging/コード.gs'),worker=read('cloudflare-worker/worker.js');
let n=0;function ok(condition,message){assert.ok(condition,message);n++;}
function fails(fn,code){assert.throws(fn,e=>code?e.smCode===code:!!e);n++;}
new Function(ui);new Function(gas);ok(true,'GAS and client JS compile');
ok(CASH.DENOMINATIONS.join(',')==='10000,5000,1000,500,100,50,10,5,1',
 'nine legacy Japanese denominations exactly (no 2000-yen note)');
const all=Object.fromEntries(CASH.DENOMINATIONS.map(v=>[v,1]));
ok(CASH.cashTotal(all)===16666,'nine legacy denominations total');
ok(CASH.cashTotal({10000:'2',500:1})===20500,'partial amounts and blank are calculated');
for(const value of ['1.5','-1','10000','1e2','1,000','a'])fails(()=>CASH.parseCount(value));
ok(!CASH.validDate('2026-02-29')&&CASH.validDate('2024-02-29'),'calendar validation preserved');

const start=gas.indexOf('var SM_CASH_DENOMINATIONS_='),end=gas.indexOf('function overview_(',start);
ok(start>=0&&end>start,'cash audit routines are present in staged GAS');
const cashSource=gas.slice(start,end);
for(const forbidden of ['writeLedger_(', 'setPayment_(', 'balanceRecalc_(', "getRange(2,1,arr.length,16)"]){
 ok(!cashSource.includes(forbidden),'cash audit does not modify financial ledger: '+forbidden);
}
ok(gas.includes("'現金確認記録':['practiceId','auditDate'"),'dedicated cash record schema exists');
ok(gas.includes("['overview','ledger.list','cash.get']"),'cash read requires existing duty authorization');
ok(gas.includes("'ledger.change','cash.save'"),'cash save uses existing script lock and operation audit');
ok(worker.includes("'/api/cash/get':'cash.get'")&&worker.includes("'/api/cash/save':'cash.save'"),
 'Worker forwards auth-checked routes');
const ledger={rowId:'P-TEST-20261116',date:'2026-11-16',balance:3500,status:'confirmed',income:0,version:8};
let rows=[],physical=[],writes=0,reads=0;
const cashSheet={
 getRange:(row,col,height,width)=>({setValues:values=>{ok(row===2&&col===1&&height===1&&width===9,'cash update targets 9 fields');physical[0]=values[0];writes++;}}),
 appendRow:record=>{physical.push([...record]);writes++;}
};
const mockSheet=(ss,name)=>{ok(name==='現金確認記録','cash records always use dedicated sheet');return cashSheet};
const mockRows=(ss,name)=>{ok(name==='現金確認記録','only cash tab is accessed');reads++;return physical.map(row=>row.slice());};
const fail_=(code,message)=>{const e=new Error(message);e.smCode=code;throw e};
const funcs=new Function('fail_','practice_','entries_','sheetRows_','sheet_','str_','dateAllowed_',
 'expectVersion_','now_',cashSource+'\nreturn {cashGet_,cashSave_,cashCounts_};')(
 fail_,
 (ss,id)=>{if(id!=='TEST-20261116')fail_('NOT_FOUND','日程がありません');return {date:'2026-11-16'};},
 ()=>[{...ledger}],
 mockRows,mockSheet,v=>String(v??''),
 d=>{if(d>'2026-11-18')fail_('BAD_REQUEST','未来日')},
 (actual,expected)=>{if(actual!==expected)fail_('CONFLICT','バージョン競合')},
 ()=> '2026-11-18 12:00:00'
);
const id='TEST-20261116',member={memberId:'M-TEST'},initial=funcs.cashGet_({},member,{practiceId:id}).data;
ok(initial.found&&initial.version===0&&initial.bookBalance===3500,'unsaved record returns zero-denomination snapshot with ledger balance');
ok(CASH.DENOMINATIONS.every(v=>initial.counts[v]===0),'default counts are all zero');
const initialLedger=JSON.stringify(ledger);
const entered={...initial.counts,1000:3,500:1};
const saved=funcs.cashSave_({},member,{practiceId:id,counts:entered,expectedVersion:0}).data;
ok(saved.actual===3500&&saved.difference===0&&saved.version===1,'save cash counts and computed difference');
ok(writes===1&&physical[0][0]===id&&physical[0][2]===JSON.stringify(entered),
 'exactly one append to dedicated cash sheet');
ok(JSON.stringify(ledger)===initialLedger,'cash save cannot affect financial ledger');
const again=funcs.cashGet_({},member,{practiceId:id}).data;
ok(again.version===1&&again.counts[1000]===3&&again.savedBookBalance===3500,'saved count reloaded with version');
fails(()=>funcs.cashSave_({},member,{practiceId:id,counts:entered,expectedVersion:0}),'CONFLICT');
const changed={...again.counts,1000:1};
const second=funcs.cashSave_({},member,{practiceId:id,counts:changed,expectedVersion:1}).data;
ok(second.version===2&&second.actual===1500&&second.difference===-2000,'update uses version 2 and correctly recomputes deficit');
ok(writes===2&&physical.length===1,'cash update does not append duplicate records');
for(const bad of [{...entered,1000:-1},{...entered,500:2.5},{...entered,2000:1},{1000:1}]){
 fails(()=>funcs.cashSave_({},member,{practiceId:id,counts:bad,expectedVersion:2}),'BAD_REQUEST');
}
for(const target of ['cashDialog','cashDateDisplay','cashBook','cashActual','cashDifference',
 'cashDenominations','cashReset','cashSave','cashClose','cashResetDialog','cashSaveDialog']){
 ok(html.includes('id="'+target+'"'),'legacy control present: '+target);
}
ok(!html.includes('id="cashDate"'),'cash check uses selected home day, not separate date picker');
ok(html.includes('cash-reconcile.js?v=1637b')&&html.includes('live.js?v=1637b'),
 'new legacy parity files cache busted');
for(const label of ['現金確認','枚数をリセット','リセットする','いいえ','保存する']){
 ok(html.includes(label),'legacy button text preserved: '+label);
}
for(const snippet of ["await call('/api/cash/get',{practiceId})","await call('/api/cash/save'",
 "dialog('cashResetDialog')","dialog('cashSaveDialog')","CASH_LABELS[denom]+'を1枚増やす'"]){
 ok(ui.includes(snippet),'client behavior: '+snippet);
}
ok(!ui.slice(ui.indexOf('// v0.16.37b: legacy v7 surface'),ui.indexOf('function bind(){')).includes("call('/api/ledger/change'"),
 'cash controller never mutates financial ledger');
console.log('PASS '+n+'/'+n+' legacy cash counter and independent server-side audit snapshots');
