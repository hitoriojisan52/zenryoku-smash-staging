#!/usr/bin/env node
'use strict';
// Real GAS function execution against a deterministic fake workbook.
// Financial mutations are NEVER sent to Apps Script, LINE or Sheets.
// A single fresh immutable ledger snapshot is used per ScriptLock-protected
// request; mutable cloned rows still go through the original balance and
// confirmed-ledger validations before the first write.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../gas-staging/コード.gs'),'utf8');
function block(start,end){
 const i=src.indexOf(start),j=src.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'GAS function boundary '+start);
 return src.slice(i,j);
}
const fail_=(code,message)=>{const err=new Error(message);err.smCode=code;throw err;};
const str_=v=>String(v??'').trim(),norm_=str_,today_=()=>dateNow;
const iso_=s=>/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const jpy_=(value,allowNegative)=>{
 const n=Number(value);
 if(value===''||value===null||value===undefined||!Number.isSafeInteger(n)||(!allowNegative&&n<0))
  fail_('BAD_REQUEST','invalid yen');
 return n;
};
let dateNow='2026-11-21';
const ledgerFns=new Function('fail_','iso_','jpy_','today_',
 block('function ledgerChronologyCompare_(a,b){','function writeLedger_(ss,rows){')+
 '\nreturn {ledgerChronologyCompare_,ledgerPriorPending_,ledgerLaterConfirmed_,balanceRecalc_};')(
 fail_,iso_,jpy_,today_);
const {ledgerPriorPending_,ledgerLaterConfirmed_,balanceRecalc_}=ledgerFns;
const row=(date,rowId,kind,income,expense,balance,status='open',version=1)=>({
 date,rowId,kind,income,expense,balance,status,version,
 label:rowId,confirmedBy:'',practiceId:kind==='practice'?rowId.slice(2):'',
 adjustment:0,item:'',payee:'',receiptFileId:'',createdBy:'M-TEST'
});
const clone=rows=>rows.map(r=>({...r}));
const opening=()=>row('2026-11-01','OPENING','opening',0,0,0,'confirmed');
let stored=[],reads=0,writes=0,beforeWrite=null;
function entries_(){reads++;return clone(stored);}
function writeLedger_(_ss,rows){
 writes++; beforeWrite=clone(stored);
 stored=clone(rows);
}
const row_=(rows,id)=>{
 const matches=rows.filter(r=>r.rowId===id);
 if(matches.length!==1)fail_('NOT_FOUND','row missing');
 return matches[0];
};
const unlockable_=r=>{if(r.status==='confirmed')fail_('LOCKED','confirmed');};
const expectVersion_=(v,expected)=>{if(Number(expected)!==v)fail_('CONFLICT','stale version');};
const dateAllowed_=date=>{if(!iso_(date)||date>today_())fail_('BAD_REQUEST','invalid date');};
const changeMoney_=new Function('str_','practice_','entries_','requireCollection_',
 'row_','unlockable_','expectVersion_','jpy_','practiceIncome_','balanceRecalc_','writeLedger_',
 block('function changeMoney_(ss,member,payload,kind){','function setPayment_(ss,member,payload,profile){')+
 '\nreturn changeMoney_;')(
 str_,(_ss,id)=>({practiceId:id,date:'2026-11-21',hours:4}),
 entries_,(_ss,p,rows)=>{assert.ok(rows.some(r=>r.rowId==='P-'+p.practiceId),'collection uses ledger snapshot');},
 row_,unlockable_,expectVersion_,jpy_,(_ss,id,adjustment)=>1800+Number(adjustment),
 balanceRecalc_,writeLedger_);
stored=[opening(),row('2026-11-21','P-21','practice',1800,0,1800,'open',2),
 row('2026-11-22','O-LATER','other',0,100,1700,'open',1)];
reads=0;writes=0;
const r=changeMoney_({}, {memberId:'M-A'},
 {practiceId:'21',value:1000,expectedVersion:2},'adjustment');
assert.equal(reads,1,'adjustment must have one ledger read, not two');
assert.equal(writes,1);
assert.equal(r.data.income,2800);
assert.equal(r.data.adjustment,1000);
assert.equal(r.data.ledgerVersion,3);
assert.equal(r.data.balance,2800);
assert.equal(stored[2].balance,2700,'future open rows recalculate unchanged');
assert.equal(beforeWrite[1].income,1800,'immutable baseline cannot be mutated');
assert.equal(beforeWrite[1].balance,1800);
assert.equal(beforeWrite[1].version,2);
assert.equal(stored[1].income,2800);
assert.equal(stored[2].version,2,'downstream balance change bumps version');
reads=0;writes=0;
const expense=changeMoney_({}, {memberId:'M-A'},
 {practiceId:'21',value:300,expectedVersion:3},'expense');
assert.equal(reads,1,'expense must have one ledger read');
assert.equal(writes,1);
assert.equal(expense.data.expense,300);
assert.equal(expense.data.balance,2500);
assert.equal(stored[2].balance,2400,'expense recalculates later running balance');
const intact=clone(stored);
reads=0;writes=0;
assert.throws(()=>changeMoney_({}, {memberId:'M-A'},
 {practiceId:'21',value:9,expectedVersion:3},'adjustment'),
 e=>e.smCode==='CONFLICT','optimistic version mismatch still blocks stale save');
assert.equal(reads,1);assert.equal(writes,0);
assert.deepEqual(stored,intact,'stale write never commits');
stored[2].status='confirmed';const locked=clone(stored);
reads=0;writes=0;
assert.throws(()=>changeMoney_({}, {memberId:'M-A'},
 {practiceId:'21',value:2000,expectedVersion:4},'adjustment'),
 e=>e.smCode==='CONFLICT','confirmed later balance cannot change');
assert.equal(reads,1);assert.equal(writes,0);
assert.deepEqual(stored,locked,'confirmed ledger values remain unchanged on conflict');
stored[1].status='confirmed';
reads=0;writes=0;
assert.throws(()=>changeMoney_({}, {memberId:'M-A'},
 {practiceId:'21',value:1500,expectedVersion:4},'adjustment'),
 e=>e.smCode==='LOCKED','a finalized practice cannot be edited');
assert.equal(reads,1);assert.equal(writes,0);

const mutateLedger_=new Function('str_','norm_','dateAllowed_','jpy_','fail_',
 'entries_','row_','expectVersion_','unlockable_','ledgerPriorPending_',
 'ledgerLaterConfirmed_','balanceRecalc_','writeLedger_',
 block('function mutateLedger_(ss,member,payload){','var SM_CASH_DENOMINATIONS_=')+
 '\nreturn mutateLedger_;')(
 str_,norm_,dateAllowed_,jpy_,fail_,entries_,row_,expectVersion_,unlockable_,
 ledgerPriorPending_,ledgerLaterConfirmed_,balanceRecalc_,writeLedger_);
const actor={memberId:'M-ADMIN',name:'検証担当',role:'admin'};
stored=[opening(),row('2026-11-19','R-TEST','reimbursement',0,200,-200),
 row('2026-11-19','O-TEST','other',1000,0,800),
 row('2026-11-21','P-21','practice',1800,0,2600)];
function mutateOnce(payload){
 reads=0;writes=0;
 const out=mutateLedger_({},actor,payload);
 assert.equal(reads,1,'ledger.change '+payload.action+' uses one fresh ledger snapshot');
 assert.equal(writes,1,'ledger.change '+payload.action+' writes one complete authoritative ledger');
 return out;
}
reads=0;writes=0;
assert.throws(()=>mutateLedger_({},actor,
 {action:'confirm',rowId:'P-21',expectedVersion:1}),
 e=>e.smCode==='LOCKED','prior open rows must be confirmed first');
assert.equal(reads,1);assert.equal(writes,0,'failure never writes');
mutateOnce({action:'confirm',rowId:'R-TEST',expectedVersion:1});
assert.equal(stored[1].status,'confirmed');
mutateOnce({action:'confirm',rowId:'O-TEST',expectedVersion:1});
mutateOnce({action:'confirm',rowId:'P-21',expectedVersion:1});
assert.equal(stored[3].status,'confirmed');
assert.equal(stored[3].confirmedBy,actor.name);
assert.equal(stored[3].balance,2600);
reads=0;writes=0;
assert.throws(()=>mutateLedger_({},actor,
 {action:'unlock',rowId:'R-TEST',expectedVersion:2}),
 e=>e.smCode==='LOCKED','cannot undo older confirmed row while a later row is confirmed');
assert.equal(reads,1);assert.equal(writes,0);
mutateOnce({action:'unlock',rowId:'P-21',expectedVersion:2});
assert.equal(stored[3].status,'open');
assert.equal(stored[3].confirmedBy,'');
const baseline=clone(stored);
reads=0;writes=0;
assert.throws(()=>mutateLedger_({},actor,
 {action:'add',kind:'reimbursement',rowId:'R-BACKDATE123',
  date:'2026-11-18',item:'テスト',payee:'検証',amount:100}),
 e=>e.smCode==='LOCKED','backdating a reimbursement behind confirmed rows must remain blocked');
assert.equal(reads,1);assert.equal(writes,0);assert.deepEqual(stored,baseline);
reads=0;writes=0;
assert.throws(()=>mutateLedger_({},actor,
 {action:'edit',rowId:'P-21',expectedVersion:3,date:'2026-11-21'}),
 e=>e.smCode==='FORBIDDEN','the collection practice row cannot be edited here');
assert.equal(reads,1);assert.equal(writes,0);
mutateOnce({action:'add',kind:'other',rowId:'O-EXTRA123',date:'2026-11-21',
 label:'新規収支',income:200,expense:0});
assert.equal(stored.find(r=>r.rowId==='O-EXTRA123').balance,2800);
mutateOnce({action:'edit',rowId:'O-EXTRA123',expectedVersion:1,
 date:'2026-11-21',label:'費用修正',income:300,expense:50});
const changed=stored.find(r=>r.rowId==='O-EXTRA123');
assert.equal(changed.balance,2850);assert.equal(changed.version,2);
mutateOnce({action:'delete',rowId:'O-EXTRA123',expectedVersion:2});
assert.ok(!stored.some(r=>r.rowId==='O-EXTRA123'));
assert.equal(stored.at(-1).balance,2600);

// Every read of a normal sheet uses ONE last-row metadata request.
// No cross-request cache, no omission of headers, empty-sheet unchanged.
const sheetRows_=new Function('SM','fail_',
 block('function sheetRows_(ss,name){','function sheet_(ss,name){')+
 '\nreturn sheetRows_;')({headers:{testSheet:['A','B','C']}},fail_);
let lastReads=0,rangeReads=0;
const ss={getSheetByName:name=>{
 assert.equal(name,'testSheet');return {
  getLastRow(){lastReads++;return 3;},
  getRange(r,c,h,w){rangeReads++;assert.deepEqual([r,c,h,w],[2,1,2,3]);return {
   getValues:()=>[[1,2,3],[4,5,6]]
  };}};
}};
assert.deepEqual(sheetRows_(ss,'testSheet'),[[1,2,3],[4,5,6]]);
assert.equal(lastReads,1,'getLastRow is called once, not twice');
assert.equal(rangeReads,1);
lastReads=0;rangeReads=0;
const emptySS={getSheetByName:()=>({
 getLastRow(){lastReads++;return 1;},
 getRange(){rangeReads++;throw Error('must not read empty range');}
})};
assert.deepEqual(sheetRows_(emptySS,'testSheet'),[]);
assert.equal(lastReads,1);assert.equal(rangeReads,0);
assert.throws(()=>sheetRows_({getSheetByName:()=>null},'testSheet'),
 e=>e.smCode==='SETUP','missing master sheet still fails closed');

// A live month ledger must preserve *all* deletion evidence including
// historical rows; only the unused audit ID column A is removed (B:F).
const deletedPracticeLedgerIds_=new Function('sheet_','str_',
 block('function deletedPracticeLedgerIds_(ss,existing){','function monthLedger_(ss,member,payload){')+
 '\nreturn deletedPracticeLedgerIds_;')(
 (_ss,name)=>{assert.equal(name,'操作履歴');return auditSheet;},str_);
const j=payload=>JSON.stringify({ok:true,data:payload});
const auditRows=[
 ['other','M-1','2026-11-20','P-FOO',j({action:'delete',rowId:'P-IGNORED'})],
 ['ledger.change','M-1','2026-11-20','P-DELETED',j({action:'delete',rowId:'P-DELETED'})],
 ['ledger.change','M-1','2026-11-20','P-EXISTS',j({action:'delete',rowId:'P-EXISTS'})],
 ['ledger.change','M-1','2026-11-20','P-FOO',j({action:'confirm',rowId:'P-FOO'})],
 ['ledger.change','M-1','2026-11-20','P-BAD','{malformed JSON'],
 ['ledger.change','M-1','2026-11-20','P-DELETED',j({action:'delete',rowId:'P-DELETED'})]
];
let auditColumns=null;
const auditSheet={
 getLastRow:()=>auditRows.length+1,
 getRange(r,c,h,w){auditColumns=[r,c,h,w];return {getValues:()=>auditRows};}
};
assert.deepEqual(deletedPracticeLedgerIds_({},[{rowId:'P-EXISTS'}]),['DELETED']);
assert.deepEqual(auditColumns,[2,2,auditRows.length,5],
 'deleted row IDs are derived from audit B:F, not A:F');
console.log('PASS v1694: 1 ledger read per safe financial write, exact legacy order, 1 last-row read, deletion audit projection');
