#!/usr/bin/env node
'use strict';
/* Receipt viewer keeps the authenticated preview, removes unsupported
 * external actions, and reuses the same right-aligned Close as other screens.
 * This is a local browser mock only: no real receipts, Drive or GAS writes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('live.html'),js=read('live.js'),toolbar=read('dialog-close.js'),css=read('stage-ui.css');
let n=0;const ok=(x,m)=>{assert.ok(x,m);n++};
new Function(js);n++;
const block=html.match(/<dialog id="receiptPreviewDialog"[^>]*>([\s\S]*?)<\/dialog>/);
ok(!!block,'authenticated preview dialog remains available');
ok(!/別画面で開く|保存する|receiptPreviewOpen|receiptPreviewDownload|receiptPreviewHint/.test(block[1]),
 'external open/save actions and their now-invalid PDF hint are absent');
ok((block[1].match(/id="receiptPreviewClose"/g)||[]).length===1,
 'the one original receipt Close control is retained');
ok(html.includes('id="receiptPreviewImage"')&&html.includes('id="receiptPreviewPdf"'),
 'image and PDF embedded previews are retained');
ok(toolbar.includes("'receiptPreviewDialog'")&&
 toolbar.includes("closeButton.textContent='✕ 閉じる'")&&
 toolbar.includes('actions.append(closeButton)'),
 'receipt dialog uses same rightmost emoji Close as other management screens');
ok(html.includes('dialog-close.js?v=1673-receipt-close')&&
 html.includes('live.js?v=1676-responsive-reads')&&
 html.includes('stage-ui.css?v=1676-responsive-reads'),
 'LINE browser loads the revised controller, toolbar, and CSS');
ok(!js.includes("'receiptPreviewOpen'")&&!js.includes("'receiptPreviewDownload'")&&
 !js.includes("'receiptPreviewHint'"),
 'preview controller does not access deleted anchors or hint');
ok(!css.includes('#receiptPreviewDialog .modal-actions a'),
 'dead receipt links do not retain UI styling');
const nodes=Object.fromEntries(['receiptPreviewImage','receiptPreviewPdf','receiptPreviewInfo'].map(id=>[id,{
 textContent:'',hidden:false,src:'',attrs:{},removeAttribute(name){delete this.attrs[name];if(name==='src')this.src='';}
}]));
let dialogOpen=0;
const start=js.indexOf('let receiptPreviewUrl_='),end=js.indexOf('async function viewReceipt_(',start);
ok(start>=0&&end>start,'real preview lifecycle functions are available');
const revoked=[],URL={revokeObjectURL:url=>revoked.push(url)};
const preview=new Function('$','dialog','URL',js.slice(start,end)+
 '\nreturn {clearReceiptPreview_,openReceiptPreview_};')(
 id=>{assert.ok(nodes[id],id);return nodes[id]},()=>{dialogOpen++},URL);
preview.openReceiptPreview_({url:'blob:receipt-jpg',mimeType:'image/jpeg',fileName:'shuttle.jpg'});
ok(nodes.receiptPreviewImage.src==='blob:receipt-jpg'&&
 nodes.receiptPreviewPdf.hidden&&dialogOpen===1,
 'JPG preview stays in its dialog');
preview.openReceiptPreview_({url:'blob:receipt-pdf',mimeType:'application/pdf',fileName:'shuttle.pdf'});
ok(nodes.receiptPreviewPdf.src==='blob:receipt-pdf'&&
 nodes.receiptPreviewImage.hidden&&revoked.includes('blob:receipt-jpg'),
 'PDF preview works and replacing a view revokes old blob URL');
preview.clearReceiptPreview_();
ok(revoked.includes('blob:receipt-pdf')&&
 !nodes.receiptPreviewImage.src&&!nodes.receiptPreviewPdf.src,
 'closing a preview releases the downloaded blob');
ok(js.includes("$('receiptPreviewClose').addEventListener('click',()=>close('receiptPreviewDialog'))")&&
 js.includes("$('receiptPreviewDialog').addEventListener('close',clearReceiptPreview_)"),
 'the original close listener and cleanup are still wired');
console.log('PASS '+n+'/'+n+' receipt in-app preview and standard top-right Close');
