#!/usr/bin/env node
'use strict';
/* v1665: Actual isolated GAS receipt store/upload/download and deletion proof,
 * plus Worker/HTML policy. No network calls, no Drive/Sheets production writes. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(dir,p),'utf8');
const gas=read('gas-staging/コード.gs'),ui=read('live.js'),html=read('live.html'),
 worker=read('cloudflare-worker/worker.js'),css=read('stage-ui.css');
let n=0;const ok=(v,m)=>{assert.ok(v,m);n++};
const span=(from,to)=>{
 const a=gas.indexOf('function '+from+'('),b=gas.indexOf('function '+to+'(',a+3);
 assert.ok(a>=0&&b>a,from+' isolated');
 return gas.slice(a,b);
};
// 1: Proof of deletion MUST be an audited successful ledger.delete,
// not any practice which merely lacks a ledger row.
let archive=[
 ['opA','ledger.change','X','','',JSON.stringify({ok:true,data:{action:'delete',rowId:'P-P-1'}})],
 ['opB','ledger.change','X','','',JSON.stringify({ok:false,data:{action:'delete',rowId:'P-P-2'}})],
 ['opC','schedule.change','X','','',JSON.stringify({ok:true,data:{action:'delete',rowId:'P-P-3'}})]
];
const deleted=new Function('sheet_','str_',span('deletedPracticeLedgerIds_','monthLedger_')+'return deletedPracticeLedgerIds_;')(
 ()=>({getLastRow:()=>archive.length+1,getRange:()=>({getValues:()=>archive})}),
 value=>String(value??'').trim());
ok(JSON.stringify(deleted(null,[]))===JSON.stringify(['P-1']),
 'only actual successful deletion enters the re-registration candidate list');
ok(deleted(null,[{rowId:'P-P-1'}]).length===0,
 'recreated row is never treated as deleted again');
ok(gas.includes("if(deletedPracticeLedgerIds_(ss,rows).indexOf(p.practiceId)<0)"),
 'GAS also rejects direct-API attempts to recreate never-deleted ledger rows');
ok(ui.includes('const deleted=new Set(S.ledger?.deletedPracticeIds||[])')&&
 ui.includes('deleted.has(p.practiceId)'),
 'UI enables deleted-row option only from verified server evidence');
ok(ui.includes("option[value=\"practice\"]")&&
 ui.includes("disabled=!available"),
 'unavailable re-registration category is disabled and auto-falls back');
// 2: Private, credential-gated uploads. Exercise REAL isolated functions.
const spreadsheetId='1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac';
let environmentId=spreadsheetId,folderId='',createCount=0,files={};
const folder={
 getId:()=>folderId,getName:()=> 'staging receipts',
 createFile:blob=>{
  const id='FILE_'+String(Object.keys(files).length+1).padStart(16,'0');
  const obj={getId:()=>id,getName:()=>blob.name,
   getBlob:()=>({getBytes:()=>blob.bytes,getContentType:()=>blob.mime}),
   getParents:()=>({hasNext:(()=>{let count=0;return ()=>count++===0})(),
    next:()=>({getId:()=>folderId})}),setTrashed:()=>{delete files[id]}};
  files[id]=obj;return obj;
 }
};
const mockDrive={
 createFolder:()=>{createCount++;folderId='PRIVATE_FOLDER_12345678901234567890';return folder;},
 getFolderById:id=>{if(id!==folderId)throw Error('unknown folder');return folder},
 getFileById:id=>{if(!files[id])throw Error('unknown file');return files[id]}
};
const props={
 getProperty:k=>k==='RECEIPT_FOLDER_ID'?folderId:'',
 setProperty:(k,v)=>{assert.equal(k,'RECEIPT_FOLDER_ID');folderId=v}
};
const row={rowId:'P-P-1',kind:'practice',status:'open',version:1,receiptFileId:'',
 adjustment:0,item:'',payee:''};
const setValues=[];
const ctx={
 DriveApp:mockDrive,PropertiesService:{getScriptProperties:()=>props},
 conf_:k=>k==='SPREADSHEET_ID'?environmentId:'',
 str_:v=>String(v??'').trim(),
 row_:(rows,id)=>{const match=rows.find(r=>r.rowId===id);if(!match)throw Error('NOT_FOUND');return match},
 entries_:()=>[{...row}],
 fail_:(code,msg)=>{const err=Error(msg);err.code=code;throw err},
 unlockable_:r=>{if(r.status==='confirmed')throw Object.assign(Error('locked'),{code:'LOCKED'})},
 expectVersion_:(actual,expected)=>{if(actual!==expected)throw Object.assign(Error('version conflict'),{code:'CONFLICT'})},
 Utilities:{base64Decode:s=>Array.from(Buffer.from(s,'base64')),
  base64Encode:b=>Buffer.from(b).toString('base64'),
  newBlob:(bytes,mime,name)=>({bytes,mime,name})},
 sheet_:()=>({getRange:(r,c,h,w)=>({setValues:values=>{
  assert.equal(r,2);assert.equal(c,11);assert.equal(h,1);assert.equal(w,5);
  setValues.push(values);row.version=values[0][0];row.receiptFileId=values[0][4];
 }})})
};
const isolate=span('stageReceiptFolder_','dispatch_');
vm.createContext(ctx);vm.runInContext(isolate,ctx);
const pdf=Buffer.from('%PDF-1.4\nTest receipt\n','ascii').toString('base64');
const upload={rowId:'P-P-1',expectedVersion:1,fileName:'receipt.pdf',
 mimeType:'application/pdf',base64:pdf};
environmentId='production_dummy_id';
assert.throws(()=>ctx.stageReceiptFolder_(),e=>e.code==='FORBIDDEN');
ok(createCount===0,'production workbook can never autoprovision receipt storage');
environmentId=spreadsheetId;
const saved=ctx.receiptUpload_(null,{role:'duty'},upload);
ok(saved.ok&&saved.data.receiptAttached&&saved.data.version===2&&
 row.receiptFileId.startsWith('FILE_'),'upload binds to exact unconfirmed row with optimistic version');
ok(createCount===1&&folderId.length>=15&&setValues.length===1,
 'private staging folder is created once and ledger gets one bounded K:O write');
const downloaded=ctx.receiptDownload_(null,{role:'duty'},{rowId:'P-P-1'});
ok(downloaded.ok&&downloaded.data.base64===pdf&&downloaded.data.mimeType==='application/pdf',
 'authenticated receipt read returns original binary and correct MIME');
assert.throws(()=>ctx.receiptUpload_(null,{role:'duty'},upload),e=>e.code==='CONFLICT');
ok(Object.keys(files).length===1,'stale version cannot create a duplicate file');
assert.throws(()=>ctx.receiptUpload_(null,{role:'duty'},
 {...upload,expectedVersion:2,mimeType:'image/png'}),e=>e.code==='BAD_REQUEST');
ok(Object.keys(files).length===1,'mime/extension mismatch rejected before creating Drive file');
row.status='confirmed';
assert.throws(()=>ctx.receiptUpload_(null,{role:'duty'},
 {...upload,expectedVersion:2}),e=>e.code==='LOCKED');
ok(Object.keys(files).length===1,'confirmed ledger rows do not accept uploads');
// 3: Real access path and UI wiring.
ok(worker.includes("'/api/receipt/upload':'receipt.upload'")&&
 worker.includes("'/api/receipt/get':'receipt.get'")&&
 worker.includes("op==='receipt.upload'?2200000:32768"),
 'upload has a bounded 2.2MB request while other endpoints keep 32KB limit');
ok(worker.includes("await verifyLineToken(")&&
 gas.includes("requireDuty_(member);")&&gas.includes("if(op==='receipt.get')")&&
 gas.includes("else if(op==='receipt.upload')result=receiptUpload_("),
 'LINE token and duty permission are enforced before private receipt storage');
ok(worker.includes("version:'0.16.65-stage-receipt'"),
 'Worker health reflects the new receipt endpoint version');
ok(html.includes('id="homeReceipt"')&&html.includes('id="reimbursementReceipt"')&&
 html.includes('id="ledgerReimbursementReceipt"')&&html.includes('id="ledgerViewReceipt"'),
 'home, separate reimbursement and ledger editor expose receipt attachment/reader');
ok(ui.includes("call('/api/receipt/upload'")&&ui.includes("call('/api/receipt/get'")&&
 ui.includes('receipt-ledger-link')&&ui.includes('attachAfterLedgerSave_'),
 'receipt can be added in both registration flows and opened after confirmation');
ok(html.includes('id="payoutWeekday"')&&html.includes('id="ledgerPayoutWeekday"')&&
 ui.includes("syncPayoutWeekday_('payoutDate'")&&
 ui.includes("syncPayoutWeekday_('ledgerPayoutDate'"),
 'both reimbursement date inputs show the selected weekday');
ok(css.includes('.weekday-hint')&&css.includes('.receipt-ledger-link'),
 'weekday and accessible receipt link are styled');
ok(!gas.includes('setSharing(DriveApp.Access.ANYONE')&&
 !ui.includes('https://drive.google.com/file/d/'),
 'receipt storage does not grant public Drive access or publish raw file links');
console.log('PASS '+n+'/'+n+' audited deleted practice, private receipt roundtrip, validation and UI wiring');
