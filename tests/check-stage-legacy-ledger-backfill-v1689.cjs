#!/usr/bin/env node
'use strict';
/* Offline regression using the REAL GAS calculation and missing-ledger helpers.
 * In-memory rows only: never connects to GAS, LINE, or Google Sheets.
 * Checks the published 11/21 edge case and mandatory chronological safety.
 */
const assert=require('node:assert/strict'),fs=require('node:fs');
const gas=fs.readFileSync('gas-staging/コード.gs','utf8');
function between(start,end){
 const a=gas.indexOf(start),b=gas.indexOf(end,a);
 assert.ok(a>=0&&b>a,'actual GAS section must be found: '+start);
 return gas.slice(a,b);
}
const fail_=(code,message)=>{const err=new Error(message);err.code=code;throw err;};
const iso_=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const jpy_=(v,allowNegative)=>{const n=Number(v);if(!Number.isSafeInteger(n)||(!allowNegative&&n<0))fail_('BAD_REQUEST','bad JPY');return n;};
const balanceRecalc_=new Function('iso_','jpy_','fail_',
 between('function balanceRecalc_(','function writeLedger_(')+'\nreturn balanceRecalc_;')(
 iso_,jpy_,fail_);
const ID21='PR-106c7859-8240-46f7-860a-bb75c6883618';
const practice=(date,id)=>({date,practiceId:id,place:'検証用体育館',hours:4,startTime:'09:00'});
const dates=[
 practice('2026-11-16','TEST-20261116'),
 practice('2026-11-19','PR-67161e90-cddc-4bff-a8fb-e8ee47a4df44'),
 practice('2026-11-21',ID21),
 practice('2026-11-25','PR-c652c3df-0dba-4d9f-b58b-58197c2f5452'),
 practice('2026-11-28','PR-3a50d251-6d39-4b2f-b3a7-401e95e5bf00')
];
const rec=(date,rowId,kind,status,balance,income=0,expense=0,practiceId='')=>({
 date,rowId,kind,status,balance,income,expense,practiceId,version:1,label:'架空データ',
 confirmedBy:status==='confirmed'?'架空担当':'',item:'',adjustment:0
});
const sourceLedger=[
 rec('2026-11-15','OPENING','opening','confirmed',0),
 rec('2026-11-16','P-TEST-20261116','practice','confirmed',0,0,0,dates[0].practiceId),
 rec('2026-11-19','P-'+dates[1].practiceId,'practice','confirmed',0,0,0,dates[1].practiceId),
 rec('2026-11-19','R-0001','reimbursement','confirmed',-5000,0,5000),
 rec('2026-11-19','R-0002','reimbursement','open',-10200,0,5200),
 rec('2026-11-19','O-0001','other','open',-200,10000,0),
 rec('2026-11-25','P-'+dates[3].practiceId,'practice','open',-200,0,0,dates[3].practiceId),
 rec('2026-11-28','P-'+dates[4].practiceId,'practice','open',-200,0,0,dates[4].practiceId)
];
const clone=v=>JSON.parse(JSON.stringify(v));
let day='2026-11-20',writes=0,audits=[],finance=clone(sourceLedger);
const today_=()=>day;
const practices_=()=>dates;
const practiceIncome_=(_ss,id,adj,p)=>{assert.equal(id,ID21);assert.equal(adj,0);assert.equal(p.practiceId,ID21);return 0;};
const writeLedger_=(_ss,rows)=>{writes++;finance=clone(rows);};
const audit_=(_ss,opId,operation,member,target,result)=>audits.push({opId,operation,target,result});
const real=new Function('today_','practices_','balanceRecalc_','writeLedger_','practiceIncome_','audit_',
 between('function collectionState_(','function requireCollection_(')+
 '\nreturn {collectionState_,ensureCollectionLedger_};')(
 today_,practices_,balanceRecalc_,writeLedger_,practiceIncome_,audit_);
const actor={memberId:'M-TEST-DUTY'},ss={};
const eligible=()=>real.collectionState_(ss,dates[2],finance,dates);
const backfill=()=>real.ensureCollectionLedger_(ss,actor,dates[2],finance,dates);
assert.equal(eligible().future,true);
assert.equal(eligible().previousUnconfirmed,false);
const original=clone(finance);
assert.equal(backfill(),finance,'future schedule must not be mutated by overview');
assert.equal(writes,0);
assert.deepEqual(finance,original,'no early changes to any finance row');
day='2026-11-21';
assert.equal(eligible().canStart,true,'prior published meeting is confirmed');
const confirmedOriginal=clone(finance.filter(r=>r.status==='confirmed'));
const returned=backfill();
assert.equal(writes,1,'backfill writes once after the practice date is reached');
assert.equal(audits.length,1,'backfill is audited once');
assert.equal(audits[0].opId,'AUTO-PRACTICE-'+ID21);
assert.equal(audits[0].operation,'ledger.auto');
assert.equal(audits[0].target,ID21);
const generated=returned.filter(r=>r.rowId==='P-'+ID21);
assert.equal(generated.length,1,'fixed P-id generated exactly once');
assert.equal(generated[0].date,'2026-11-21');
assert.equal(generated[0].kind,'practice');
assert.equal(generated[0].status,'open','never preconfirm newly created ledger');
assert.equal(generated[0].balance,-200,'zero-collection backfill preserves rolling amount');
for(const previous of confirmedOriginal){
 const now=finance.find(r=>r.rowId===previous.rowId);
 assert.ok(now,'no previous finalized row may disappear');
 assert.equal(now.balance,previous.balance,'a confirmed balance cannot change: '+previous.rowId);
 assert.equal(now.status,previous.status,'previous finalization cannot change');
}
for(const otherDate of [dates[3],dates[4]]){
 const row=finance.find(r=>r.rowId==='P-'+otherDate.practiceId);
 assert.equal(row.balance,-200,'future provisional balances preserved');
 assert.equal(row.status,'open');
}
const again=backfill();
assert.equal(writes,1,'reopening on the same date must be idempotent');
assert.equal(audits.length,1,'no duplicate audit');
assert.equal(again.filter(r=>r.rowId==='P-'+ID21).length,1);
finance=clone(sourceLedger);finance.find(r=>r.rowId==='P-'+dates[1].practiceId).status='open';
writes=0;audits=[];
assert.equal(eligible().previousUnconfirmed,true);
backfill();
assert.equal(writes,0,'previous unconfirmed meeting prohibits recovery');
assert.equal(audits.length,0,'no audit after denied recovery');
finance=clone(sourceLedger).filter(r=>r.practiceId!==dates[1].practiceId);
writes=0;audits=[];
assert.equal(eligible().previousUnconfirmed,true);
backfill();
assert.equal(writes,0,'missing previous published meeting ledger prohibits recovery');
assert.equal(audits.length,0);
assert.ok(gas.includes("if(['overview','ledger.list','cash.get','schedule.list','schedule.delete.preview','participant.list'].indexOf(op)>=0)return withLock_(function()"),
 'overview still executes inside the existing ScriptLock');
assert.ok(gas.includes('Publication immediately creates ONE matching financial ledger row'),
 'newly confirmed schedules must create the accounting row immediately');
console.log('PASS v1689 legacy 11/21 publication gap: future restraint, day-of single audit backfill, chronology and confirmed balances');
