#!/usr/bin/env node
'use strict';
/* Real GAS upload/download isolation with user-authorized new shared parent,
 * previously private receipts preserved, auth and version checks unchanged. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const gas=read('gas-staging/コード.gs'),ui=read('live.js'),
 html=read('live.html'),worker=read('cloudflare-worker/worker.js'),css=read('stage-ui.css');
let n=0;const ok=(x,msg)=>{assert.ok(x,msg);n++};
new Function(gas);new Function(ui);n+=2;
const stageId='1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac';
const parentId='1Tmbwpyh94jTdq2xnVe2Qd8hDZk94fkI0';
const legacyId='LEGACY_FOLDER_123456789012345';
const childId='NEW_STAGE_FOLDER_123456789012345';
let environment=stageId,childProperty='',created=0,writes=0;
let files={};
const makeParents=id=>{let consumed=false;return {hasNext:()=>!consumed,
 next:()=>{consumed=true;return {getId:()=>id}}}};
const storedFolder={
 getId:()=>childId,getName:()=> '全力☆スマッシュ_検証用領収書',
 getParents:()=>makeParents(parentId),
 createFile:blob=>{
  const id='RECEIPT_FILE_'+String(Object.keys(files).length+1).padStart(18,'0');
  const file={getId:()=>id,getName:()=>blob.name,
   getBlob:()=>({getBytes:()=>blob.bytes,getContentType:()=>blob.mime}),
   getParents:()=>makeParents(childId),setTrashed:()=>{delete files[id]}};
  files[id]=file;return file;
 }
};
const parent={
 getName:()=> '全力IT',
 createFolder:name=>{assert.equal(name,'全力☆スマッシュ_検証用領収書');created++;return storedFolder}
};
const drive={
 getFolderById:id=>{if(id===parentId)return parent;if(id===childId)return storedFolder;throw Error('unknown folder')},
 getFileById:id=>{if(!files[id])throw Error('unknown file');return files[id]}
};
const props={
 getProperty:k=>k==='RECEIPT_FOLDER_ID_V1672'?childProperty:k==='RECEIPT_FOLDER_ID'?legacyId:'',
 setProperty:(k,v)=>{assert.equal(k,'RECEIPT_FOLDER_ID_V1672');childProperty=v;}
};
const row={rowId:'P-P-1',kind:'practice',status:'open',version:1,receiptFileId:'',
 adjustment:0,item:'',payee:''};
const ctx={
 DriveApp:drive,PropertiesService:{getScriptProperties:()=>props},
 conf_:k=>k==='SPREADSHEET_ID'?environment:'',
 str_:v=>String(v??'').trim(),safeCell_:v=>String(v),
 row_:(rows,id)=>{const x=rows.find(r=>r.rowId===id);if(!x)throw Error('NOT_FOUND');return x;},
 entries_:()=>[{...row}],
 fail_:(code,msg)=>{throw Object.assign(Error(msg),{code})},
 unlockable_:x=>{if(x.status==='confirmed')throw Object.assign(Error('locked'),{code:'LOCKED'})},
 expectVersion_:(a,b)=>{if(a!==b)throw Object.assign(Error('version conflict'),{code:'CONFLICT'})},
 Utilities:{base64Decode:x=>Array.from(Buffer.from(x,'base64')),
  base64Encode:b=>Buffer.from(b).toString('base64'),
  newBlob:(bytes,mime,name)=>({bytes,mime,name})},
 sheet_:()=>({getRange:(_row,c,h,w)=>({setValues:values=>{
  assert.equal(c,11);assert.equal(h,1);assert.equal(w,5);writes++;
  row.version=values[0][0];row.receiptFileId=values[0][4];
 }})})
};
const begin=gas.indexOf('function stageReceiptGuard_('),end=gas.indexOf('function dispatch_(',begin);
ok(begin>=0&&end>begin,'actual GAS staging receipt functions are isolateable');
vm.createContext(ctx);vm.runInContext(gas.slice(begin,end),ctx);
const pdf=Buffer.from('%PDF-1.4\nTest receipt\n').toString('base64');
const payload={rowId:'P-P-1',expectedVersion:1,fileName:'receipt.pdf',
 mimeType:'application/pdf',base64:pdf};
environment='PRODUCTION';
assert.throws(()=>ctx.stageReceiptFolder_(),e=>e.code==='FORBIDDEN');n++;
ok(created===0,'non-staging workbook cannot create any folder');
environment=stageId;
const saved=ctx.receiptUpload_(null,{role:'duty'},payload);
ok(saved.ok&&saved.data.receiptAttached&&saved.data.version===2,
 'upload attaches to the exact open ledger version');
ok(created===1&&childProperty===childId&&writes===1,
 'new file goes into one dedicated child under the explicitly approved parent');
ok(ctx.stageReceiptFolder_().getId()===childId&&created===1,
 'second upload reuses existing child folder, no duplicates');
const downloaded=ctx.receiptDownload_(null,{role:'duty'},{rowId:'P-P-1'});
ok(downloaded.ok&&downloaded.data.base64===pdf&&downloaded.data.mimeType==='application/pdf',
 'new receipt returns original bytes through authenticated GAS response');
const oldFileId='LEGACY_FILE_123456789012345';
files[oldFileId]={getId:()=>oldFileId,getName:()=> 'legacy.pdf',
 getBlob:()=>({getBytes:()=>Array.from(Buffer.from(pdf,'base64')),getContentType:()=> 'application/pdf'}),
 getParents:()=>makeParents(legacyId)};
row.receiptFileId=oldFileId;
ok(ctx.receiptDownload_(null,{role:'duty'},{rowId:'P-P-1'}).data.base64===pdf,
 'old private-folder receipt remains available without migration');
row.receiptFileId=saved.data.rowId?'RECEIPT_FILE_'+String(1).padStart(18,'0'):'';
assert.throws(()=>ctx.receiptUpload_(null,{role:'duty'},payload),e=>e.code==='CONFLICT');n++;
ok(writes===1,'stale version does not duplicate upload or ledger write');
row.status='confirmed';
assert.throws(()=>ctx.receiptUpload_(null,{role:'duty'},
 {...payload,expectedVersion:2}),e=>e.code==='LOCKED');n++;
ok(writes===1,'confirmed ledger cannot accept changed receipt');
ok(worker.includes("'/api/receipt/upload':'receipt.upload'")&&
 worker.includes("'/api/receipt/get':'receipt.get'")&&
 worker.includes("await verifyLineToken(")&&
 gas.includes("requireDuty_(member);"),
 'LINE authentication and duty privilege still protect receipt APIs');
ok(gas.includes('STAGE_RECEIPT_PARENT_V1672_')&&
 gas.includes("props.getProperty('RECEIPT_FOLDER_ID_V1672')")&&
 gas.includes("getProperty('RECEIPT_FOLDER_ID')")&&
 !gas.includes('setSharing(DriveApp.Access.ANYONE'),
 'approved shared parent is used without changing its ACL or old folder property');
ok(html.includes('id="homeReceipt"')&&html.includes('id="receiptPreviewDialog"')&&
 ui.includes("call('/api/receipt/get'")&&ui.includes('openReceiptPreview_(')&&
 css.includes('#receiptPreviewDialog .receipt-preview-image'),
 'home and ledger receipt view uses authenticated preview with user-gesture fallback');
console.log('PASS '+n+'/'+n+' approved Drive parent, legacy read, secure receipt roundtrip and in-app preview');
