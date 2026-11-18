#!/usr/bin/env node
'use strict';
// v0.16.46: simulated REAL DOM reparenting, not only HTML string checks.
// Verify all existing controls and their events survive relocation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const live=read('live.html'),css=read('stage-ui.css'),script=read('dialog-close.js'),
 match=read('match.html'),matchConfirm=read('match-confirm.js');
let n=0;const ok=(value,label)=>{assert.ok(value,label);n++;};
class Element{
 constructor(tag,id='',text=''){
  this.tagName=tag;this.id=id;this.textContent=text;this.children=[];this.parentElement=null;
  this.hidden=false;this.disabled=false;this.inert=false;this.open=true;this.handlers={};
  this.classes=new Set();this.classList={
   add:v=>this.classes.add(v),contains:v=>this.classes.has(v)};
  this.attrs={};this.isConnected=true;this.className='';
 }
 append(...nodes){for(const node of nodes){
   node.remove();node.parentElement=this;this.children.push(node);
 }}
 insertBefore(node,reference){
  node.remove();node.parentElement=this;
  const idx=reference?this.children.indexOf(reference):-1;
  this.children.splice(idx<0?this.children.length:idx,0,node);
 }
 remove(){if(this.parentElement){
  const i=this.parentElement.children.indexOf(this);
  if(i>=0)this.parentElement.children.splice(i,1);
  this.parentElement=null;
 }}
 get firstChild(){return this.children[0]||null;}
 querySelectorAll(tag){
  const out=[];for(const c of this.children){
   if(c.tagName===tag)out.push(c);out.push(...c.querySelectorAll(tag));
  }return out;
 }
 querySelector(tag){return this.querySelectorAll(tag)[0]||null;}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,cb){this.handlers[k]=cb;}
 click(){if(this.disabled)return;this.clicked=(this.clicked||0)+1;this.handlers.click?.();}
}
const el=(tag,id='',text='')=>new Element(tag,id,text);
const scenarios={
 scheduleDialog:{heading:true,top:['scheduleAdd','scheduleReload'],close:'scheduleClose'},
 participantDialog:{heading:true,top:['participantReload'],close:'participantClose'},
 memberAccessDialog:{top:['memberAccessRefresh'],close:'memberAccessClose'},
 visitorAdminDialog:{top:['visitorAdminRefresh'],close:'visitorAdminClose'},
 ledgerDialog:{top:['newLedgerRow'],close:'closeLedger'},
 attendanceDialog:{top:['attendanceReload'],cancel:'attendanceCancel'},
 visitorDialog:{section:['visitorMineRefresh'],cancel:'visitorCancel'},
 participantEditDialog:{cancel:'participantEditCancel',save:'participantEditSave'},
 cashDialog:{close:'cashClose'},
 stageErrorDialog:{close:'stageErrorOkay'},
 stageBusyDialog:{busy:true}
};
const dialogs=[],references=new Map();
for(const [id,info] of Object.entries(scenarios)){
 const dialog=el('dialog',id),header=el('h2',id+'Title','画面タイトル'),footer=el('div',id+'Footer');
 footer.classList.add('modal-actions');
 const heading=info.heading?el('div',id+'Heading'):null;
 if(heading)heading.classList.add(id==='scheduleDialog'?'schedule-heading':'participant-heading');
 if(heading){heading.append(header);dialog.append(heading);}
 else if(!info.busy)dialog.append(header);
 else dialog.append(el('div',id+'Spinner'));
 const buttons=[];
 const button=(bid,title,parent)=>{
  const b=el('button',bid,title);b.addEventListener('click',()=>{b.recorded=true;});
  (parent||footer).append(b);buttons.push(b);references.set(bid,b);return b;
 };
 if(info.top)for(const bid of info.top){
  button(bid,bid==='scheduleAdd'||bid==='newLedgerRow'?'＋追加':'更新',
   bid==='scheduleAdd'&&heading?heading:el('div',id+'Controls'));
  // Ensure standalone controls are attached to the dialog.
  const b=references.get(bid);
  if(!b.parentElement.parentElement)dialog.append(b.parentElement);
 }
 if(info.section)for(const bid of info.section){
  const section=el('div','section');dialog.append(section);button(bid,'更新',section);
 }
 if(info.close){
  const b=button(info.close,'✕ 閉じる',info.close==='participantClose'?heading:footer);
  if(info.close==='participantClose')ok(b.parentElement===heading,'participant original header close');
 }
 if(info.cancel)button(info.cancel,'キャンセル');
 if(info.save)button(info.save,'保存する');
 if(!info.busy)dialog.append(footer);
 dialogs.push(dialog);
}
const document={
 querySelectorAll:x=>{assert.equal(x,'dialog');return dialogs;},
 createElement:tag=>el(tag)
};
const before=new Map(dialogs.map(d=>[d.id,d.querySelectorAll('button').map(x=>x.id)]));
vm.runInNewContext(script,{document});
for(const [id,info] of Object.entries(scenarios)){
 const dialog=dialogs.find(x=>x.id===id);
 const toolbar=dialog.children.find(x=>x.className==='stage-dialog-toolbar');
 if(info.busy){ok(!toolbar,'busy dialog has no dismiss control');continue;}
 ok(Boolean(toolbar),'dialog has one visible non-overlapping toolbar: '+id);
 ok(toolbar.children[0].tagName==='h2','original title retained in header: '+id);
 const controls=toolbar.children[1].children;
 ok(controls.at(-1)?.textContent==='✕ 閉じる','Close always last in header: '+id);
 const after=dialog.querySelectorAll('button').map(x=>x.id).filter(Boolean);
 ok(before.get(id).every(bid=>after.includes(bid)),'original buttons not lost: '+id);
 const expected=[...(info.top||[]),...(info.close?[info.close]:[])];
 ok(expected.every((bid,i)=>controls[i]===references.get(bid)),
    'context actions retain object, order and handler: '+id);
 if(info.heading)ok(!dialog.children.some(x=>x.classes.has(
   id==='scheduleDialog'?'schedule-heading':'participant-heading')),
   'empty legacy heading removed without removing controls: '+id);
 if(info.section)ok(references.get(info.section[0]).parentElement.id==='section',
   'visitor requests update remains beside section title, not rehomed');
 if(info.close){const b=references.get(info.close);b.click();
  ok(b.recorded,'original Close handler still executes: '+id);}
 if(info.cancel){
  const close=controls.at(-1),cancel=references.get(info.cancel);
  close.click();ok(cancel.recorded,'header Close delegates to original Cancel: '+id);
  cancel.recorded=false;dialog.inert=true;close.click();
  ok(!cancel.recorded,'disabled/busy dialog does not bypass the lock: '+id);
 }
}
ok(css.includes('flex-wrap:wrap')&&css.includes('.stage-dialog-toolbar-actions'),
 'toolbar wraps on mobile and reserves a dedicated action area');
ok(!css.includes('.stage-close-row')&&!css.includes('margin:0 0 -43px')&&
 !css.includes('margin:-8px -8px -36px'),
 'old close-button overlays and negative-offset hacks are gone');
ok(css.includes('@media(max-width:380px)')&&css.includes('flex:1 1 100%'),
 'small devices have separate full-width title and action rows');
ok(live.includes('dialog-close.js?v=1646')&&live.includes('stage-ui.css?v=1646'),
 'new script and CSS are versioned for the phone browser cache');
ok(match.includes('class="stage-match-dialog-toolbar"')&&
 match.includes('class="stage-panel-toolbar"')&&
 css.includes('position:static!important')&&
 matchConfirm.includes("byId('matchConfirmClose').addEventListener('click'"),
 'match confirm and QR controls never occupy an overlapping absolute layer');
console.log('PASS '+n+'/'+n+' v0.16.46 all dialog controls and responsive non-overlap');
