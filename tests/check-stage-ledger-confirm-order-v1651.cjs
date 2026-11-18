#!/usr/bin/env node
'use strict';
// Legacy v15 business invariant: confirm ledger lines strictly from oldest
// to newest. Exercise actual GAS helper, month API and server mutation logic.
// No network calls, no Sheets writes, no production account.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const gas=fs.readFileSync(path.join(root,'gas-staging/コード.gs'),'utf8');
const js=fs.readFileSync(path.join(root,'live.js'),'utf8');
const html=fs.readFileSync(path.join(root,'live.html'),'utf8');
let n=0;
function ok(v,m){assert.ok(v,m);n++;}
function reject(fn,code,m){
 assert.throws(fn,e=>!!e&&e.smCode===code,m);n++;
}
new Function(gas);new Function(js);n+=2;
const fail_=(code,message)=>{const e=new Error(message);e.smCode=code;throw e;};
const today_=()=> '2026-11-19';
const str_=v=>String(v??'').trim();
const helperStart=gas.indexOf('function ledgerChronologyCompare_(');
const helperEnd=gas.indexOf('function balanceRecalc_(',helperStart);
ok(helperStart>=0&&helperEnd>helperStart,'chronological helper resides in actual GAS source');
const helpers=new Function('today_','fail_',
 gas.slice(helperStart,helperEnd)+
 '\nreturn {ledgerChronologyCompare_,ledgerPriorPending_,ledgerCanConfirm_};'
)(today_,fail_);
const {ledgerChronologyCompare_:compare,ledgerPriorPending_:prior,
 ledgerCanConfirm_:canConfirm}=helpers;
const row=(rowId,date,kind,status,version=1)=>({
 rowId,date,kind,status,version,practiceId:kind==='practice'?'PR-1':'',
 income:0,expense:0,balance:1000,label:rowId,confirmedBy:'',adjustment:0
});
const baseline=[
 row('P-LATE','2026-11-20','practice','open'), // intentionally unsorted
 row('R-SAME','2026-11-10','reimbursement','open'),
 row('R-OCT','2026-10-15','reimbursement','open'),
 row('OPENING','2026-10-01','opening','confirmed'),
 row('P-NOV','2026-11-10','practice','open'),
 row('R-FUTURE','2026-12-01','reimbursement','open')
];
let stored=baseline.map(x=>({...x})),writes=0;
const entries_=()=>stored.map(x=>({...x}));
const sorted=()=>stored.slice().sort(compare);
ok(sorted().map(x=>x.rowId).join(',')===
 'OPENING,R-OCT,P-NOV,R-SAME,P-LATE,R-FUTURE',
 'same-date priority and ledger chronology are deterministic');
ok(!canConfirm(stored,stored.find(x=>x.rowId==='P-NOV')),
 'November practice blocked by an unconfirmed October reimbursement');
ok(prior(stored,stored.find(x=>x.rowId==='P-NOV')).rowId==='R-OCT',
 'first pending earlier line is identified even across months');
ok(!canConfirm(stored,stored.find(x=>x.rowId==='OPENING')),
 'opening balance is never a confirmable ledger row');
const mmStart=gas.indexOf('function monthLedger_(');
const mmEnd=gas.indexOf('\n\n/**',mmStart);
ok(mmStart>=0&&mmEnd>mmStart,'month ledger API code can be isolated');
const monthLedger=new Function('entries_','today_','str_','fail_',
 'ledgerChronologyCompare_',gas.slice(mmStart,mmEnd)+
 '\nreturn monthLedger_;'
)(entries_,today_,str_,fail_,compare);
let november=monthLedger({}, {role:'admin'}, {month:'2026-11'}).data;
ok(november.rows.length===3&&
 november.rows.find(x=>x.rowId==='P-NOV').canConfirm===false,
 'month API sees previous-month open row despite that row being hidden');
ok(november.rows.find(x=>x.rowId==='R-SAME').canConfirm===false,
 'same-day reimbursement is blocked behind preceding practice');
ok(november.rows.find(x=>x.rowId==='P-LATE').canConfirm===false,
 'later day stays locked behind first open ledger row');
const oct=monthLedger({}, {role:'admin'}, {month:'2026-10'}).data;
ok(oct.rows.find(x=>x.rowId==='R-OCT').canConfirm===true,
 'earliest unconfirmed row is the only eligible confirm button');
const target=f=>stored.find(x=>x.rowId===f);
const row_=(list,id)=>{const r=list.filter(x=>x.rowId===id);
 if(r.length!==1)fail_('NOT_FOUND','ledger missing');return r[0];};
const expectVersion_=(v,expected)=>{if(v!==expected)fail_('CONFLICT','stale version');};
const unlockable_=r=>{if(r.status==='confirmed')fail_('LOCKED','already confirmed');};
const dateAllowed_=date=>{if(date>today_())fail_('BAD_REQUEST','future row');};
const balanceRecalc_=list=>list.sort(compare);
const writeLedger_=(_ss,rows)=>{writes++;stored=rows.map(x=>({...x}));};
const mutateStart=gas.indexOf('function mutateLedger_(');
const mutateEnd=gas.indexOf('\n/**\n * Cash audit',mutateStart);
ok(mutateStart>=0&&mutateEnd>mutateStart,'actual ledger change handler can be isolated');
const mutateLedger=new Function('entries_','row_','expectVersion_',
 'unlockable_','dateAllowed_','ledgerPriorPending_','balanceRecalc_',
 'writeLedger_','str_','fail_',gas.slice(mutateStart,mutateEnd)+
 '\nreturn mutateLedger_;'
)(entries_,row_,expectVersion_,unlockable_,dateAllowed_,prior,balanceRecalc_,
 writeLedger_,str_,fail_);
const submit=id=>mutateLedger({}, {name:'確認担当者',role:'duty'},{
 action:'confirm',rowId:id,expectedVersion:target(id).version
});
reject(()=>submit('P-NOV'),'LOCKED',
 'GAS rejects later confirmation even if a direct API request bypasses the UI');
ok(writes===0&&target('P-NOV').status==='open',
 'rejected confirmation makes no ledger write or status change');
const first=submit('R-OCT');
ok(first.data.action==='confirm'&&target('R-OCT').status==='confirmed'&&writes===1,
 'oldest line can be confirmed successfully');
november=monthLedger({}, {role:'duty'}, {month:'2026-11'}).data;
ok(november.rows.find(x=>x.rowId==='P-NOV').canConfirm===true,
 'next November practice becomes enabled immediately after October confirmation');
ok(november.rows.find(x=>x.rowId==='R-SAME').canConfirm===false,
 'same-day next row stays disabled until earlier practice is confirmed');
reject(()=>submit('R-SAME'),'LOCKED',
 'server rejects skipping same-day prior row');
const second=submit('P-NOV');
ok(second.data.action==='confirm'&&target('P-NOV').status==='confirmed',
 'same-date practice may be finalized after earlier month clears');
november=monthLedger({}, {role:'duty'}, {month:'2026-11'}).data;
ok(november.rows.find(x=>x.rowId==='R-SAME').canConfirm===true,
 'next same-day reimbursement now becomes eligible');
ok(november.rows.find(x=>x.rowId==='P-LATE').canConfirm===false,
 'later day still disabled until same-day item confirms');
reject(()=>submit('R-FUTURE'),'BAD_REQUEST','future date remains impossible to confirm');
ok(monthLedger({}, {role:'admin'}, {month:'2026-12'}).data.rows[0].canConfirm===false,
 'future month row always disabled regardless of chronology');
ok(js.includes("const canConfirm=!future&&!confirmed&&r.canConfirm===true"),
 'v15 ledger button remains present but disabled from authoritative GAS result');
ok(js.includes("S.overview?.practice?.date>today()||ledger?.canConfirm!==true")&&
 js.includes("homeLocked||practice.date>today()||ledger?.canConfirm!==true"),
 'homepage confirm and payment-sync control preserve the same chronological restriction');
ok(js.includes("if(act==='confirm'&&row.canConfirm!==true)return;"),
 'UI cannot open stale confirmation popup for a disabled ledger row');
ok(html.includes('id="ledgerBody"')&&
 js.includes("const slots=[['修正','edit',canEdit]"),
 'v15 fixed operation slots and ledger body remain intact');
console.log('PASS '+n+'/'+n+' chronological confirmation, month boundary and unchanged v15 controls');
