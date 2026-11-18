#!/usr/bin/env node
'use strict';
// Static stage-only safety checks + pure accounting tests. Does not call remote APIs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const model=require('../cash-reconcile.js'),html=read('live.html'),ui=read('live.js');
let tests=0;
function ok(value,message){assert.ok(value,message);tests++;}
function throws(fn,contains){assert.throws(fn,e=>String(e.message).includes(contains));tests++;}
const {DENOMINATIONS,parseCount,cashTotal,asOfDate,reconcile,validDate}=model;
ok(DENOMINATIONS.join(',')==='10000,5000,2000,1000,500,100,50,10,5,1',
  'all Japanese yen denominations including 2000-yen notes');
ok(validDate('2024-02-29')&&!validDate('2026-02-29'),'actual calendar validation');
ok(!validDate('2026-13-01')&&!validDate('2026/11/16'),'invalid date formats');
ok(parseCount('')===0&&parseCount('0')===0&&parseCount('9999')===9999,'blank and permitted zero/upper bound');
for(const raw of ['-1','1.5','1e4','10000','01','two','NaN','1,000']){
 throws(()=>parseCount(raw),'枚数');
}
ok(cashTotal({10000:'1',5000:'1',2000:'1',1000:'1',500:'1',100:'1',50:'1',10:'1',5:'1',1:'1'})===18666,
  'every denomination contributes accurately');
ok(cashTotal({1000:'2',500:'1'})===2500,'blanks are zero');
throws(()=>cashTotal({1000:'-2'}),'枚数');
throws(()=>cashTotal(null),'金種');
const sheet={month:'2026-11',carried:7000,rows:[
 {date:'2026-11-16',rowId:'A',balance:7200,status:'confirmed'},
 {date:'2026-11-16',rowId:'B',balance:7500,status:'confirmed'},
 {date:'2026-11-18',rowId:'C',balance:7800,status:'open'}
]};
const confirmed=asOfDate(sheet,'2026-11-16');
ok(confirmed.found&&confirmed.balance===7500&&confirmed.rows===2,'same-day last posted balance');
ok(!confirmed.provisional,'confirmed-only as-of date');
const inexact=reconcile(sheet,'2026-11-16',{5000:1,1000:2,500:1});
ok(inexact.actual===7500&&inexact.difference===0&&inexact.match,'matching cash and book');
const short=reconcile(sheet,'2026-11-16',{5000:1,1000:2});
ok(short.difference===-500&&!short.match,'shortfall is actual minus book');
const excess=reconcile(sheet,'2026-11-16',{10000:1});
ok(excess.difference===2500,'surplus is positive');
ok(asOfDate(sheet,'2026-11-18').provisional,'open ledger rows produce provisional warning');
const noRow=reconcile(sheet,'2026-11-17',{10000:1});
ok(!noRow.found&&noRow.difference===null&&!noRow.match,'missing target-date row must NOT silently use carried/previous balance');
ok(asOfDate({month:'2026-11',carried:9999,rows:[]},'2026-11-15').balance===null,
  'carried-only month is not a dated cash-check row');
throws(()=>asOfDate(sheet,'2026-10-16'),'日付');
throws(()=>asOfDate({...sheet,rows:[{date:'2026-11-16',balance:'7500',status:'confirmed'}]},'2026-11-16'),
  '帳簿残金');
for(const id of ['cashDialog','cashDate','cashRefresh','cashStatus','cashBook',
 'cashDenominations','cashActual','cashDifference','cashReset','cashClose']){
 ok(html.includes('id="'+id+'"'),'cash UI component exists: '+id);
}
ok(html.includes('cash-reconcile.js?v=1637a'),'pure model cache-busted and loaded');
ok(html.indexOf('cash-reconcile.js?v=1637a')<html.indexOf('live.js?v=1637a'),
 'pure model loads before controller module');
ok(ui.includes("await call('/api/ledger',{month:date.slice(0,7)})"),
  'cash feature reuses existing authenticated month-ledger read API');
ok(!ui.slice(ui.indexOf('const CASH=window.SMCashReconcile;'),ui.indexOf('function bind(){')).includes("call('/api/ledger/change'"),
  'cash UI does not mutate ledger');
ok(!ui.slice(ui.indexOf('const CASH=window.SMCashReconcile;'),ui.indexOf('function bind(){')).includes("call('/api/payment'"),
  'cash UI does not mutate collection');
ok(ui.includes('cashLedger=null;renderCash();')&&ui.includes('if(result?.month!==date.slice(0,7)'),
  'date changes fail closed without stale prior ledger');
ok(ui.includes("for(const id of ['manageSchedules','managePeople'])$(id).disabled=true"),
  'only cash menu enabled, unrelated unfinished features remain disabled');
new Function(ui);ok(true,'live.js syntax is valid');
console.log('PASS '+tests+'/'+tests+' optional cash confirmation, calendar and ledger safety');
