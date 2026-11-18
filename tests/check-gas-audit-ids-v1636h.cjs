#!/usr/bin/env node
'use strict';
// Stage-only, in-memory audit-sheet simulation. Never contacts Google or modifies real data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const gas=fs.readFileSync(path.join(__dirname,'../gas-staging/コード.gs'),'utf8');
const begin=gas.indexOf('function auditExisting_('),end=gas.indexOf('\nfunction entries_(',begin);
assert(begin>=0&&end>begin,'reviewed audit functions present');
const source=gas.slice(begin,end);let tests=0;
function ok(value,msg){assert.ok(value,msg);tests++;}
function sheetHarness(initial=[]){
 const records=initial.map(row=>row.slice()),reads=[],appends=[];
 let mutateBeforeResult=null;
 const sh={
   getLastRow:()=>records.length+1,
   getRange:(row,col,height,width)=>({
     getValues:()=>{
       reads.push({row,col,height,width});
       if(col===1&&width===6&&mutateBeforeResult!==null)records[row-2][0]=mutateBeforeResult;
       return records.slice(row-2,row-2+height).map(a=>a.slice(col-1,col-1+width));
     }
   }),
   appendRow:row=>{records.push([...row]);appends.push([...row]);}
 };
 const sheet_=(ss,name)=>{ok(name==='操作履歴','only audit sheet accessed');return sh;};
 const fail_=(code,msg)=>{const e=new Error(msg);e.smCode=code;throw e;};
 const methods=new Function('sheet_','fail_','now_','str_',
     source+'\nreturn {auditExisting_,audit_};')(
   sheet_,fail_,()=> '2026-11-18 12:00:00',v=>String(v??'')
 );
 return {records,reads,appends,methods,setMutatedId:v=>{mutateBeforeResult=v}};
}
const opId='stage-operation-00001',member={memberId:'M-001'};
const outcome={ok:true,data:{balance:600,ledgerVersion:3}};
const row=(id,op='payment.set',owner='M-001',payload=outcome)=>[id,op,owner,'2026-11-18 11:00:00','P-001',JSON.stringify(payload)];
let h=sheetHarness();
ok(h.methods.auditExisting_({},opId,'payment.set',member)===null,'empty history yields no duplicate');
ok(h.reads.length===0,'empty history does not read a range');
h=sheetHarness([row('different-001'),row('different-002'),row('different-003')]);
ok(h.methods.auditExisting_({},opId,'payment.set',member)===null,'new operation allowed');
ok(h.reads.length===1&&h.reads[0].width===1&&h.reads[0].height===3,'new operation reads only 1-column IDs');
h.methods.audit_({},opId,'payment.set',member,'P-001',outcome);
ok(h.appends.length===1&&h.appends[0][0]===opId,'existing appendRow audit preserved');
ok(h.methods.auditExisting_({},opId,'payment.set',member).data.balance===600,'retry replays saved response');
ok(h.reads.slice(-2).map(x=>x.width).join(',')==='1,6','duplicate re-reads exactly one full row');
const newest={ok:true,data:{balance:1800,ledgerVersion:8}};
h=sheetHarness([row(opId,'payment.set','M-001',outcome),row('else'),row(opId,'payment.set','M-001',newest)]);
ok(h.methods.auditExisting_({},opId,'payment.set',member).data.ledgerVersion===8,'most recent matching operation wins');
ok(h.reads[1].row===4&&h.reads[1].height===1,'duplicate reads correct physical row');
for(const [entry,expected] of [[row(opId,'expense.set'), 'CONFLICT'],[row(opId,'payment.set','other'), 'CONFLICT']]){
 h=sheetHarness([entry]);assert.throws(()=>h.methods.auditExisting_({},opId,'payment.set',member),e=>e.smCode===expected);
 tests++;
}
h=sheetHarness([row(opId)]);h.records[0][5]='not-json';
assert.throws(()=>h.methods.auditExisting_({},opId,'payment.set',member),e=>e.smCode==='SETUP');tests++;
h=sheetHarness([row(opId)]);h.setMutatedId('changed-by-external-edit');
assert.throws(()=>h.methods.auditExisting_({},opId,'payment.set',member),e=>e.smCode==='CONFLICT');tests++;
// Invariant: critical payment writer and script lock remain untouched.
ok(gas.includes("return withLock_(function(){")&&gas.includes("if(done)return done"),'duplicate detection still runs inside lock before payment write');
ok(gas.includes("audit_(ss,opId,op,member,str_(payload.rowId||payload.participantId||payload.practiceId),result);"),
  'all successful financial mutations still audited');
new Function(gas);ok(true,'GAS V8 syntax is valid');
console.log('PASS '+tests+'/'+tests+' stage audit ID-only scan and duplicate/mutation safeguards');
