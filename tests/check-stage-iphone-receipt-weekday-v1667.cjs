#!/usr/bin/env node
'use strict';
/* v1667: inline native-date weekday and iPhone camera receipts. This test does
 * not send any API calls or mutate Sheets/Drive. Real UI/client function bodies
 * are exercised in a mocked browser; OAuth and real iOS decoding need E2E. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('live.html'),js=read('live.js'),css=read('stage-ui.css');
const gas=read('gas-staging/コード.gs'),worker=read('cloudflare-worker/worker.js');
let count=0;const ok=(v,msg)=>{assert.ok(v,msg);count++;};
new Function(js);count++;
const re=/class="payout-date-field"><input[^>]+id="(payoutDate|ledgerPayoutDate)"[^>]*><small id="(payoutWeekday|ledgerPayoutWeekday)"[^>]*><\/small><\/span>/g;
const fields=[...html.matchAll(re)];
ok(fields.length===2&&fields[0][1]==='payoutDate'&&fields[1][1]==='ledgerPayoutDate',
 'both reimbursement date inputs and weekday hints share one wrapper');
ok(css.includes('.payout-date-field{')&&
 css.includes('position:absolute;top:50%;left:calc(10.5ch + 9px);right:auto;')&&
 css.includes('pointer-events:none;background:#fff;')&&
 css.includes('input[type="date"]')&&
 css.includes('padding-right:87px!important;'),
 'weekday renders within input perimeter without blocking native date picker');
const wrapper=html.match(/<span class="payout-date-field">/g)||[];
ok(wrapper.length===3&&
 !html.includes('id="payoutDate" type="text"')&&
 !html.includes('id="ledgerPayoutDate" type="text"'),
 'native calendar/date-value controls remain unchanged');
const dnodes={
 payoutDate:{value:'2026-11-19'},payoutWeekday:{textContent:''},
 ledgerPayoutDate:{value:'2026-11-20'},ledgerPayoutWeekday:{textContent:''}
};
const win={};vm.runInNewContext(read('date-format.js'),{window:win,Date,Intl});
const weekdayStart=js.indexOf('function syncPayoutWeekday_('),
 weekdayEnd=js.indexOf('function openEditor(',weekdayStart);
ok(weekdayStart>=0&&weekdayEnd>weekdayStart,'actual weekday function located');
const display=new Function('$','window',js.slice(weekdayStart,weekdayEnd)+'return syncPayoutWeekday_;')(
 id=>dnodes[id],{SMDate:win.SMDate});
display('payoutDate','payoutWeekday');
display('ledgerPayoutDate','ledgerPayoutWeekday');
ok(dnodes.payoutWeekday.textContent==='（木）'&&
 dnodes.ledgerPayoutWeekday.textContent==='（金）',
 'inline weekday reflects selected JST calendar day');
dnodes.payoutDate.value='';
display('payoutDate','payoutWeekday');
ok(dnodes.payoutWeekday.textContent==='',
 'clearing a date clears inline overlay');
ok(['homeReceipt','reimbursementReceipt','ledgerReimbursementReceipt']
 .every(id=>new RegExp('id="'+id+'"[^>]+accept="image/\\*,application/pdf,\\.jpg,\\.jpeg,\\.heic,\\.heif"').test(html)),
 'all three upload fields offer iPhone photos and JPG alongside PDFs');

class File{
 constructor(parts,name,options={}){
  this.name=name;this.type=options.type||'';
  this.lastModified=options.lastModified||0;
  this.size=parts.reduce((n,part)=>n+(part.size||0),0);
 }
}
let decodeCalls=0,closeCalls=0,canvasCalls=0;
const canvas={
 width:0,height:0,
 getContext:()=>({fillStyle:'#fff',fillRect:()=>{},drawImage:()=>{}}),
 toBlob(callback,mime,quality){
  assert.equal(mime,'image/jpeg');assert.ok(quality<=.92);
  canvasCalls++;
  callback({type:'image/jpeg',size:canvasCalls===1?1800000:1250000});
 }
};
const document={createElement:tag=>{assert.equal(tag,'canvas');return canvas;}};
const createImageBitmap=async file=>{
 decodeCalls++;
 return {width:4032,height:3024,close:()=>{closeCalls++}};
};
const start=js.indexOf('const RECEIPT_MAX_BYTES=1500000;');
const end=js.indexOf('async function receiptBase64_(',start);
ok(start>0&&end>start,'actual receipt selection/conversion implementation located');
const preparedFns=new Function('File','createImageBitmap','URL','Image','document',
 js.slice(start,end)+'return {receiptFile_,prepareReceiptFile_};')(
 File,createImageBitmap,{createObjectURL:()=>'',revokeObjectURL:()=>{}},
 class Image{},document);
(async()=>{
 const jpg=new File([{size:900000}],'20261119_185635.jpg',{type:'image/jpeg'});
 ok(preparedFns.receiptFile_(jpg)===jpg,'ordinary JPG accepted by original form');
 ok(await preparedFns.prepareReceiptFile_(jpg)===jpg&&decodeCalls===0,
  'already-small JPG remains byte-identical without compression');
 const pdf=new File([{size:100000}],'voucher.pdf',{type:'application/pdf'});
 ok(await preparedFns.prepareReceiptFile_(pdf)===pdf,
  'existing small PDF is unchanged');
 assert.throws(()=>preparedFns.receiptFile_(new File([{size:1600000}],'large.pdf',{type:'application/pdf'})),
  /1.5MB/);count++;
 const heic=new File([{size:4200000}],'IMG_4832.HEIC',{type:'image/heic'});
 const normalized=await preparedFns.prepareReceiptFile_(heic);
 ok(normalized.name==='IMG_4832.jpg'&&normalized.type==='image/jpeg'&&
  normalized.size===1250000&&decodeCalls===1&&closeCalls===1,
  'iPhone HEIC is decoded/resized as a bounded JPEG');
 const mislabel=new File([{size:850000}],'photo.HEIF',{type:'image/jpeg'});
 const renamed=await preparedFns.prepareReceiptFile_(mislabel);
 ok(renamed.name==='photo.jpg'&&renamed.type==='image/jpeg'&&
  renamed.size===850000&&decodeCalls===1,
  'Safari-generated JPEG under a HEIF filename is safely renamed without re-encoding');
 canvasCalls=0;
 const largeJpg=new File([{size:5100000}],'CAMERA.jpg',{type:'image/jpeg'});
 const reduced=await preparedFns.prepareReceiptFile_(largeJpg);
 ok(reduced.type==='image/jpeg'&&reduced.size<=1500000&&decodeCalls===2,
  'oversized JPEG camera pictures are reduced before upload');
 assert.throws(()=>preparedFns.receiptFile_(new File([{size:30000000}],'huge.heic',{type:'image/heic'})),
  /25MB/);count++;
 assert.throws(()=>preparedFns.receiptFile_(new File([{size:100000}],'animation.gif',{type:'image/gif'})),
  /対応しています/);count++;
 const noDecoderFns=new Function('File','createImageBitmap','URL','Image','document',
  js.slice(start,end)+'return {prepareReceiptFile_};')(
  File,undefined,{createObjectURL:()=>'',revokeObjectURL:()=>{}},
  class BrokenImage{set src(_value){if(this.onerror)this.onerror();}},document);
 await assert.rejects(()=>noDecoderFns.prepareReceiptFile_(heic),/JPEG形式で共有/);count++;
 const uploadStart=js.indexOf('async function uploadReceipt_('),uploadEnd=js.indexOf('async function downloadReceipt_(',uploadStart);
 ok(uploadStart>0&&uploadEnd>uploadStart,'actual authenticated receipt upload entrypoint located');
 const calls=[];
 const upload=new Function('prepareReceiptFile_','call','uuid','receiptBase64_',js.slice(uploadStart,uploadEnd)+'return uploadReceipt_;')(
  preparedFns.prepareReceiptFile_,async(...args)=>{calls.push(args);return {ok:true};},
  ()=>'TEST-OPERATION-ID',async()=> 'JVBERi0xLjQ=');
 await upload(jpg,{rowId:'R-MOCK',version:2});
 ok(calls.length===1&&calls[0][0]==='/api/receipt/upload'&&
  calls[0][1].mimeType==='image/jpeg'&&
  calls[0][1].fileName==='20261119_185635.jpg'&&
  calls[0][1].expectedVersion===2,
  'JPG upload uses existing authorized route and version guard');
 const edit=js.slice(js.indexOf('async function submitEditor('),js.indexOf('async function submitReimbursement('));
 const header=js.slice(js.indexOf('async function submitReimbursement('),js.indexOf('// v0.16.37b:'));
 ok(edit.indexOf('await prepareReceiptFile_')<edit.indexOf("call('/api/ledger/change'")&&
  header.indexOf('await prepareReceiptFile_')<header.indexOf("call('/api/ledger/change'"),
  'new/revised reimbursement preflights image conversion BEFORE creating accounting row');
 ok(gas.includes('if(bytes.length>1500000||bytes.length<5)')&&
  gas.includes("mime==='image/jpeg'")&&
  worker.includes("op==='receipt.upload'?2200000:32768")&&
  worker.includes("'/api/receipt/upload':'receipt.upload'"),
  'GAS magic-byte, 1.5MB, token proxy, and request-size protections remain unchanged');
 ok(html.includes('stage-ui.css?v=1667')&&html.includes('live.js?v=1667'),
  'LIFF WebView always reloads the new inline weekday/photo JavaScript and CSS');
 console.log('PASS '+count+'/'+count+' native weekday, iPhone photo normalization, and receipt security regression');
})().catch(e=>{console.error(e);process.exitCode=1});
