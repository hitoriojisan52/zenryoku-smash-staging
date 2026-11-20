#!/usr/bin/env node
'use strict';
// v0.16.68: weekday must sit next to rendered date, not near native picker.
// A 10 MB JPEG must be accepted as a source and compressed before authenticated
// upload. Keeps existing 1.5 MB GAS/Worker content ceiling.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('live.html'),css=read('stage-ui.css'),js=read('live.js'),
  worker=read('cloudflare-worker/worker.js'),gas=read('gas-staging/コード.gs');
let tests=0;const ok=(v,m)=>{assert.ok(v,m);tests++};
new Function(js);tests++;

ok(html.includes('stage-ui.css?v=1676-responsive-reads'),
 'LINE WebView receives a distinct CSS asset after this visual fix');
ok(/\.stage-ui \.payout-date-field \.weekday-hint\{\s*position:absolute;top:50%;left:calc\(10\.5ch \+ 9px\);right:auto;/.test(css),
 'weekday is adjacent to the left-aligned date rather than the picker icon');
ok(css.includes('pointer-events:none;background:#fff;')&&
 css.includes('padding-right:87px!important;')&&
 !css.includes('right:43px;')&&
 css.includes('display:block;width:100%;box-sizing:border-box;padding-right:87px!important;'),
 'overlay does not intercept native calendar and no obsolete right-edge spacing remains');
for(const input of ['payoutDate','ledgerPayoutDate']){
 ok(new RegExp('<span class="payout-date-field"><input[^>]+id="'+input+'" type="date" required><small[^>]+class="weekday-hint"').test(html),
  'native payout calendar and weekday wrapper remain intact: '+input);
}
ok(js.includes("syncPayoutWeekday_('payoutDate','payoutWeekday')")&&
 js.includes("syncPayoutWeekday_('ledgerPayoutDate','ledgerPayoutWeekday')"),
 'payout day changes still update both weekday labels');
ok(['homeReceipt','reimbursementReceipt','ledgerReimbursementReceipt'].every(id=>
 new RegExp('id="'+id+'"[^>]+accept="image/\\*,application/pdf,\\.jpg,\\.jpeg,\\.heic,\\.heif"').test(html)),
 'all three receipt file pickers still offer JPG/JPEG and iPhone photos');

class FakeFile{
 constructor(parts,name,opt={}){
  this.name=name;this.type=opt.type||'';this.lastModified=opt.lastModified||0;
  this.size=parts.reduce((n,p)=>n+(p.size||0),0);
 }
}
let drawCount=0,decodeCount=0;
const canvas={
 width:0,height:0,
 getContext:()=>({fillStyle:'#fff',fillRect(){},drawImage(){drawCount++}}),
 toBlob(cb,mime){
  assert.equal(mime,'image/jpeg');
  cb({type:'image/jpeg',size:drawCount===1?1700000:1420000});
 }
};
const mockDocument={createElement:tag=>{assert.equal(tag,'canvas');return canvas;}};
const mockBitmap=async()=>({width:4032,height:3024,close(){decodeCount++}});
const start=js.indexOf('const RECEIPT_MAX_BYTES=1500000;'),
 end=js.indexOf('async function receiptBase64_(',start);
ok(start>=0&&end>start,'real client receipt validator and normalizer can be exercised');
const normalize=new Function('File','document','createImageBitmap','URL','Image',
 js.slice(start,end)+'return {receiptFile_,prepareReceiptFile_};')(
 FakeFile,mockDocument,mockBitmap,{},class Image{});

(async()=>{
 const jpg10=new FakeFile([{size:10000000}],'20261119_185635.jpg',{type:'image/jpeg'});
 ok(normalize.receiptFile_(jpg10)===jpg10,
  'the real source validator explicitly accepts the users 10 MB JPG');
 const saved=await normalize.prepareReceiptFile_(jpg10);
 ok(saved.name==='20261119_185635.jpg'&&saved.type==='image/jpeg'&&
   saved.size===1420000&&drawCount===2&&decodeCount===1,
  '10 MB JPG is converted in the browser to JPEG <= 1.5 MB before the API');
 const smallJpg=new FakeFile([{size:1300000}],'photo.JPG',{type:'image/jpeg'});
 ok(await normalize.prepareReceiptFile_(smallJpg)===smallJpg,
  'existing small JPGs are preserved without any recompression');
 const pdf10=new FakeFile([{size:10000000}],'invoice.pdf',{type:'application/pdf'});
 assert.throws(()=>normalize.receiptFile_(pdf10),/PDFの上限は1.5MB/);tests++;
 ok(js.includes('const RECEIPT_SOURCE_MAX_BYTES=25000000;')&&
  gas.includes('if(bytes.length>1500000||bytes.length<5)')&&
  worker.includes("op==='receipt.upload'?2200000:32768"),
  'photo source headroom unchanged; GAS storage and Worker JSON limits unchanged');
 ok(js.includes("call('/api/receipt/upload'")&&
  js.includes("expectedVersion:row.version")&&
  js.includes('receiptPartialWarning='),
  'original authenticated row-version and partial-save recovery remain intact');
 console.log('PASS '+tests+'/'+tests+' date-adjacent weekday and 10MB JPEG safe upload');
})().catch(e=>{console.error(e);process.exitCode=1});
