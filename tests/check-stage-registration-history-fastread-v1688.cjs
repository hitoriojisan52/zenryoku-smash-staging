#!/usr/bin/env node
'use strict';
// Read-only, offline regression. Real staging GAS function, mock Sheets only.
// Verify that the registered-user LIFF status check does not read unused
// withdrawal columns, without weakening the history/identity/setup guards.
const assert=require('node:assert/strict'),fs=require('node:fs');
const s=fs.readFileSync('gas-staging/AccessAndGuestV160.gs','utf8');
const a=s.indexOf('function accessStageWithdrawHistoryV1636_(');
const b=s.indexOf('function accessStageWithdrawalV1636_(',a);
assert.ok(a>=0&&b>a);
const STAGE='1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac';
const HEADER=['memberId','displayName','withdrawnAt','withdrawnBy','state','operationId'];
let actualStage=STAGE,ssId=STAGE,validHeader=true,readCount=0,lastRowCount=0,headerChecks=0;
let history=[];
const sh={
 getLastRow(){lastRowCount++;return history.length+1;},
 getRange(row,col,height,width){
  assert.equal(row,2,'no header or unrelated range reread');
  assert.equal(col,1,'only member IDs');
  assert.equal(height,history.length);
  assert.equal(width,1,'one column instead of previous six');
  readCount++;
  return {getValues:()=>history.map(x=>[x[0]])};
 }
};
const conf_=key=>key==='SPREADSHEET_ID'?actualStage:'';
const accessSheet16_=(_ss,name,header)=>{
 headerChecks++;assert.equal(name,'退会履歴');assert.deepEqual(header,HEADER);
 if(!validHeader){const e=Error('history schema error');e.code='SETUP';throw e}
 return sh;
};
const str_=v=>String(v??'').trim();
const guard=new Function('conf_','accessSheet16_','str_','SMA_STAGE_WITHDRAW_ID_V1636',
 'SMA_STAGE_WITHDRAW_HEADER_V1636',s.slice(a,b)+'\nreturn accessStageWithdrawHistoryV1636_;')(
  conf_,accessSheet16_,str_,STAGE,HEADER);
const ss={getId:()=>ssId};
const row=(id)=>[id,'fake user','U'+'a'.repeat(32),true,false];
function reset(){readCount=0;lastRowCount=0;headerChecks=0;}
history=[];
reset();assert.equal(guard(ss,row('M-ONE')),false);
assert.equal(headerChecks,1,'validates history schema even on an empty sheet');
assert.equal(readCount,0,'no bulk data read when history empty');
history=[['M-A','unrelated','date','admin','completed','operation'],
 ['M-ONE','target','date','admin','processing','op2']];
reset();assert.equal(guard(ss,row('M-ONE')),true);
assert.equal(headerChecks,1);assert.equal(readCount,1);
reset();assert.equal(guard(ss,row('M-OTHER')),false);
assert.equal(readCount,1);
validHeader=false;reset();
assert.throws(()=>guard(ss,row('M-ONE')),e=>e.code==='SETUP');
assert.equal(readCount,0,'fail closed when history header mismatches');
validHeader=true;
actualStage='production-id';reset();
assert.equal(guard(ss,row('M-ONE')),false);
assert.equal(headerChecks,0,'no registration history scan outside the exact stage');
actualStage=STAGE;ssId='production-id';reset();
assert.equal(guard(ss,row('M-ONE')),false);
assert.equal(headerChecks,0,'sheet ID guard also prevents nonstage probing');
ssId=STAGE;reset();
assert.equal(guard(ss,null),false);
assert.equal(headerChecks,0,'no history read without member');
assert.ok(s.includes('var latestMember=accessMemberRow16_(ss,lineUserId)'),
 'registration apply still revalidates identity under the existing ScriptLock');
assert.ok(s.includes("if(current&&accessStageWithdrawHistoryV1636_(ss,current))"),
 'both registration status and apply keep the withdrawal gate');
console.log('PASS v1688 registration withdrawal guard: stage binding, header, identity, minimal read and safe reapplication');
