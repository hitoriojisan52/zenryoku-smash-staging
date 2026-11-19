#!/usr/bin/env node
'use strict';
/* Manual GAS Drive OAuth helper: staging only, scope prompt before folder.
 * No network and no production or Google Drive operation during this test. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'gas-staging/コード.gs'),'utf8');
const worker=fs.readFileSync(path.join(root,'cloudflare-worker/worker.js'),'utf8');
const start=source.indexOf('function authorizeStagingReceiptDriveV1669(){');
const end=source.indexOf('function receiptUpload_(',start);
let count=0;const ok=(v,msg)=>{assert.ok(v,msg);count++};
ok(start>=0&&end>start,'existing owner-run GAS entrypoint is present');
const fun=new Function('conf_','fail_','ScriptApp','stageReceiptAuthorizeV1666_',
 source.slice(start,end)+'\nreturn authorizeStagingReceiptDriveV1669;');
const stageId='1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac';
let asked=0,started=0,accountStage=stageId,deny=false,scopeReceived='';
const API={
 AuthMode:{FULL:'FULL'},
 requireScopes(mode,scope){
  assert.equal(mode,'FULL');
  scopeReceived=scope[0];
  asked++;
  if(deny)throw Error('GOOGLE_CONSENT_REQUIRED');
 }
};
const fail=(code,message)=>{throw Object.assign(Error(message),{smCode:code})};
const authorize=fun(()=>accountStage,fail,API,()=>{started++;return 'private folder ready'});
accountStage='PRODUCTION_NON_STAGE';
assert.throws(()=>authorize(),e=>e.smCode==='FORBIDDEN');count++;
ok(asked===0&&started===0,'production/non-stage cannot even request Drive scope');
accountStage=stageId;deny=true;
assert.throws(()=>authorize(),/GOOGLE_CONSENT_REQUIRED/);count++;
ok(asked===1&&started===0,'Google denied/missing consent aborts BEFORE any folder operation');
deny=false;
ok(authorize()==='private folder ready','valid staging OAuth consent reaches original private folder initializer');
ok(asked===2&&started===1&&scopeReceived==='https://www.googleapis.com/auth/drive',
 'Google full Drive scope requested explicitly, still subject to human approval');
ok(worker.indexOf('authorizeStagingReceiptDriveV1669')<0&&
 !source.slice(start,end).includes('Logger.log(')&&
 !source.slice(start,end).includes('console.log('),
 'OAuth helper is never exposed through Worker and does not log secrets');
ok(source.includes("var id=props.getProperty('RECEIPT_FOLDER_ID')||'';")&&
 source.includes('stageReceiptFolder_();')&&
 source.includes("if(sheetId!=='1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac')"),
 'original ScriptProperties, locked private folder and staging data guard are retained');
console.log('PASS '+count+'/'+count+' manual stage-only Drive OAuth consent prompt regression');
