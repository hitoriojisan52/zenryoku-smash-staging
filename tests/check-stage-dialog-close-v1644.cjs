#!/usr/bin/env node
'use strict';
// v0.16.73: navigation screens and the receipt viewer have a top-right Close.
// Confirmation/edit/error popups retain their original footer actions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const html=read('live.html'),css=read('stage-ui.css'),js=read('dialog-close.js'),
 match=read('match.html'),confirm=read('match-confirm.js');
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++};
class E{
 constructor(tag,id='',text=''){
  this.tagName=tag;this.id=id;this.textContent=text;this.children=[];this.parentElement=null;
  this.disabled=false;this.inert=false;this.open=true;this.isConnected=true;this.handlers={};
  this.className='';this.attrs={};this.styles=new Set();
  this.classList={add:x=>this.styles.add(x),contains:x=>this.styles.has(x)};
 }
 remove(){if(!this.parentElement)return;const p=this.parentElement;const i=p.children.indexOf(this);
  if(i>=0)p.children.splice(i,1);this.parentElement=null;}
 append(...elements){for(const e of elements){e.remove();e.parentElement=this;this.children.push(e);}}
 insertBefore(e,first){e.remove();e.parentElement=this;const i=this.children.indexOf(first);
  this.children.splice(i>=0?i:0,0,e);}
 get firstChild(){return this.children[0]||null;}
 querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tagName===tag?[c]:[]),...c.querySelectorAll(tag)]);}
 querySelector(tag){return this.querySelectorAll(tag)[0]||null;}
 addEventListener(event,fn){this.handlers[event]=fn;}
 setAttribute(a,b){this.attrs[a]=b;}
 click(){if(this.disabled)return;this.clicked=(this.clicked||0)+1;this.handlers.click?.();}
}
const el=(tag,id='',s='')=>new E(tag,id,s);
const screens={
 manageDialog:{close:'closeManage'},
 memberAccessDialog:{close:'memberAccessClose',top:['memberAccessRefresh']},
 cashDialog:{close:'cashClose'},
 visitorDialog:{cancel:'visitorCancel',topInSection:'visitorMineRefresh'},
 visitorAdminDialog:{close:'visitorAdminClose',top:['visitorAdminRefresh']},
 participantDialog:{close:'participantClose',top:['participantReload'],heading:'participant-heading'},
 scheduleDialog:{close:'scheduleClose',top:['scheduleAdd','scheduleReload'],heading:'schedule-heading'},
 ledgerDialog:{close:'closeLedger',top:['newLedgerRow']},
 receiptPreviewDialog:{close:'receiptPreviewClose'}
};
const popups={
 modal:{close:'closeModal'},categoryDialog:{cancel:'cancelCategory'},
 participantEditDialog:{cancel:'participantEditCancel',save:'participantEditSave'},
 participantDeleteDialog:{cancel:'participantDeleteCancel'},
 ledgerEditDialog:{cancel:'cancelLedgerEdit',save:'submitLedgerEdit'},
 cashResetDialog:{cancel:'cashResetCancel'},cashSaveDialog:{cancel:'cashSaveCancel'},
 scheduleActionDialog:{cancel:'scheduleActionCancel'},
 visitorConfirmDialog:{cancel:'visitorConfirmCancel'},
 visitorMineEditDialog:{cancel:'visitorMineEditCancel'},
 attendanceDialog:{cancel:'attendanceCancel',topInSection:'attendanceReload'},
 accessConfirmV2:{cancel:'accessConfirmCancelV2'},
 memberAccessEditV1656:{cancel:'memberAccessEditCancelV1656',save:'memberAccessEditSaveV1656'},
 stageErrorDialog:{close:'stageErrorOkay'},
 confirmActionDialog:{cancel:'cancelConfirmAction'}
};
const all=[],original=new Map();
for(const [id,opts] of Object.entries({...screens,...popups,stageBusyDialog:{busy:true}})){
 const dialog=el('dialog',id),head=el('h2',id+'Title','タイトル'),footer=el('div',id+'Footer');
 footer.classList.add('modal-actions');
 const wrapper=opts.heading?el('div'):dialog;
 if(opts.heading)wrapper.classList.add(opts.heading);
 wrapper.append(head);if(opts.heading)dialog.append(wrapper);
 const buttons=[];
 const button=(bid,text,parent=footer)=>{
  const b=el('button',bid,text);b.addEventListener('click',()=>{b.handled=true;});
  parent.append(b);buttons.push(b);return b;
 };
 for(const bid of opts.top||[]){
  const target=bid==='scheduleAdd'&&opts.heading?wrapper:el('div');
  const b=button(bid,bid==='scheduleAdd'||bid==='newLedgerRow'?'＋追加':'更新',target);
  if(target!==wrapper)dialog.append(target);
 }
 if(opts.topInSection){
  const section=el('div','section');dialog.append(section);
  button(opts.topInSection,'更新',section);
 }
 if(opts.close)button(opts.close,'✕ 閉じる',id==='participantDialog'?wrapper:footer);
 if(opts.cancel)button(opts.cancel,'キャンセル');
 if(opts.save)button(opts.save,'保存');
 if(!opts.busy)dialog.append(footer);
 original.set(id,buttons);all.push(dialog);
}
const document={querySelectorAll:x=>{assert.equal(x,'dialog');return all;},
 createElement:tag=>el(tag)};
vm.runInNewContext(js,{document});
for(const [id,opts] of Object.entries(screens)){
 const d=all.find(d=>d.id===id),bar=d.children.find(c=>c.className==='stage-dialog-toolbar');
 ok(Boolean(bar),'full management screen has header toolbar: '+id);
 const headerButtons=bar.children[1].children;
 ok(headerButtons.at(-1)?.textContent==='✕ 閉じる','Close on far right: '+id);
 ok(headerButtons.length===1,'only Close is in title, context buttons stay in their own rows: '+id);
 for(const actionId of opts.top||[]){
  const originalAction=original.get(id).find(b=>b.id===actionId);
  ok(!!originalAction&&!headerButtons.includes(originalAction)&&
   originalAction.parentElement!==bar.children[1],
   'context action remains in date or section controls: '+id+'/'+actionId);
 }
 ok(original.get(id).every(b=>d.querySelectorAll('button').includes(b)),
  'all original controls still exist: '+id);
 for(const b of original.get(id)){b.click();ok(b.handled,'original click handler works: '+id+'/'+b.id);}
 if(opts.cancel){
  const cancel=original.get(id).find(b=>b.id===opts.cancel);
  cancel.handled=false;headerButtons.at(-1).click();
  ok(cancel.handled,'screen Close delegates to original Cancel: '+id);
 }
 if(opts.topInSection)ok(
  original.get(id).find(b=>b.id===opts.topInSection).parentElement.id==='section',
  'partial list refresh does not move to full page toolbar: '+id);
}
for(const [id] of Object.entries(popups)){
 const d=all.find(d=>d.id===id);
 ok(!d.children.some(c=>c.className==='stage-dialog-toolbar'),
  'confirmation/edit/error popup has NO synthetic top Close: '+id);
 ok(original.get(id).every(b=>d.querySelectorAll('button').includes(b)),
  'popup footer controls stay original: '+id);
}
ok(!all.find(d=>d.id==='stageBusyDialog').querySelector('button'),
 'busy lock has no controls');
ok(!js.includes('position:absolute')&&!css.includes('.stage-close-row'),
 'old overlapping Close implementation remains removed');
ok(html.includes('dialog-close.js?v=1673-receipt-close')&&html.includes('stage-ui.css?v=1676-responsive-reads'),
 'mobile web UI loads versioned scripts');
ok(!match.includes('id="matchConfirmClose"')&&
 !confirm.includes("byId('matchConfirmClose')")&&
 match.includes('id="matchConfirmCancel"')&&match.includes('id="matchConfirmOk"'),
 'match confirmation has original Cancel / Execute only, no popup extra Close');
console.log('PASS '+checks+'/'+checks+' v0.16.48 screen-only Close and popup unchanged actions');
