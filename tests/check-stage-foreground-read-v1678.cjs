#!/usr/bin/env node
'use strict';
/* v0.16.78: synthetic read-only UI lifecycle + selector placeholders.
 * Tests never call live endpoints or write club data. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const live=read('live.js'),vis=read('visitor-approval.js'),access=read('live-access-v2.js'),
 html=read('live.html'),match=read('match.js'),mh=read('match.html'),
 mv=read('match-view.js'),mvh=read('match-view.html'),guest=read('guest.js'),
 css=read('stage-ui.css');
let n=0;function ok(v,label){assert.ok(v,label);n++}
for(const src of [live,vis,access,match,mv]){new Function(src);n++}
const cls=()=>{const set=new Set();return {
 add(x){set.add(x)},remove(x){set.delete(x)},contains(x){return set.has(x)},
 toggle(x,on){if(on)set.add(x);else set.delete(x)}
}};
const refreshIds={
 scheduleDialog:'scheduleReload',visitorDialog:'visitorMineRefresh',
 visitorAdminDialog:'visitorAdminRefresh',attendanceDialog:'attendanceReload',
 participantDialog:'participantReload'
};
const buttons=Object.fromEntries(Object.values(refreshIds).map(x=>[x,{disabled:false}]));
const screens={};
const doc={createElement(){return {hidden:false,textContent:'',className:'',attrs:{},classList:cls(),
 setAttribute(k,v){this.attrs[k]=v}}}};
function screen(id){
 const o={open:false,dataset:{},events:{},status:null,
 querySelector(q){
  if(q==='.stage-inline-read-status')return this.status;
  if(q==='.stage-dialog-toolbar')return {insertAdjacentElement:(_p,e)=>{this.status=e}};
  return null;
 },
 addEventListener(t,fn){this.events[t]=fn;},
 showModal(){this.open=true;},
 close(){this.open=false;this.events.close?.();}
 };
 screens[id]=o;return o;
}
for(const id of ['cashDialog',...Object.keys(refreshIds)])screen(id);
const source=live.slice(live.indexOf('const screenReadEpoch_='),live.indexOf('async function boot(){'));
ok(source.includes('function updateReadScreenStatus_'),'status update uses existing inline banner');
const readControls=new Function('$','document','window',source+
 '\nreturn {readScreen_,updateReadScreenStatus_};')(
 id=>screens[id]||buttons[id],doc,{});
const readScreen_=readControls.readScreen_,update=readControls.updateReadScreenStatus_;
(async()=>{
 for(const [id,btn] of Object.entries(refreshIds)){
  const dlg=screens[id],updateButton=buttons[btn],close={disabled:false};
  let finish;const pending=new Promise(resolve=>{finish=resolve});
  const req=readScreen_(id,'対象データを読み込んでいます…',
   async()=>pending);
  ok(dlg.open&&updateButton.disabled&&!close.disabled,
   id+' is open, Update disabled, Close usable during read');
  ok(dlg.status.classList.contains('stage-inline-read-loading')&&
   dlg.status.textContent==='対象データを読み込んでいます…',
   id+' has one animated inline progress message');
  update(id,'取得結果を確認しています…');
  ok(dlg.status.textContent==='取得結果を確認しています…',
   id+' reuses the same status node for progress updates');
  finish();await req;
  ok(!updateButton.disabled&&dlg.status.hidden&&
   !dlg.status.classList.contains('stage-inline-read-loading'),
   id+' restores Update and clears animation after completion');
  dlg.close();
 }
 const dlg=screens.cashDialog;
 let finish;const delayed=new Promise(resolve=>{finish=resolve});
 const first=readScreen_('cashDialog','帳簿残高を取得しています…',async isCurrent=>{
  await delayed;
  update('cashDialog','終了後には表示しない',isCurrent);
 });
 const prior=dlg.status;
 ok(prior.classList.contains('stage-inline-read-loading'),'cash shows only blue animated reading status');
 dlg.close();finish();await first;
 ok(!dlg.open&&prior.textContent!=='終了後には表示しない',
  'closing cash ignores stale response');
 const error=await readScreen_('visitorDialog','ビジターを読み込んでいます…',
  async()=>{throw Error('テスト通信エラー')});
 ok(error===undefined&&screens.visitorDialog.open&&
  !buttons.visitorMineRefresh.disabled&&
  !screens.visitorDialog.status.classList.contains('stage-inline-read-loading')&&
  screens.visitorDialog.status.textContent.includes('テスト通信エラー'),
  'failed read clears spinner, re-enables Update for retry, leaves Close active');
 screens.visitorDialog.close();
 const firstBlank=['visitorMinePractice','visitorPractice','attendancePractice','participantPractice'];
 for(const id of firstBlank)
  ok(live.includes("$('"+id+"').replaceChildren(new Option('',''))"),
   id+' is blank before data retrieval');
 ok(vis.includes("visitorAdminPractice').replaceChildren(node('option','',''))"),
  'visitor admin dropdown is initially blank');
 ok(html.includes('<option value=""></option></select><button id="refresh"')&&
  mh.includes('<option value=""></option>')&&mvh.includes('<option value=""></option>'),
  'home, match management and match viewing selectors begin blank');
 const boot=live.slice(live.indexOf('async function boot(){'),live.indexOf('async function reload('));
 ok(boot.includes("await reload(true);\n  $('refresh').disabled=false;")&&
  !boot.includes("'manageBtn','refresh','adjustment'"),
  'home Update remains disabled throughout first full fetch');
 ok(live.includes("$('refresh').disabled=true; // a foreground date change")&&
  live.includes("if($('refresh').disabled)return;"),
  'home Update disabled for foreground date change and manual refresh');
 ok(access.includes("$('memberAccessRefresh').disabled=true")&&
  vis.includes("w.SMStageRead.open('visitorAdminDialog'")&&
  match.includes("$('refreshMatch').disabled=true")&&
  mv.includes("loading=true;$('refreshMatch').disabled=true")&&
  guest.includes('refresh.disabled=true'),
  'member management, visitor review, match and guest Update controls are disabled while reading');
 ok(css.includes('.stage-system-message.stage-inline-read-loading::before')&&
  css.includes('animation:stage-ui-spin'),
  'blue loading banner retains small spinning activity indicator');
 // Execute the actual cash render function against an isolated fake counter.
 const start=live.indexOf('function renderCash(){'),end=live.indexOf('function validateCashSnapshot_(',start);
 const nodes={};
 function element(id){return nodes[id]||(nodes[id]={textContent:'',hidden:false,
  className:'',disabled:false,classList:cls()});}
 const factory=new Function('$','CASH','cashCountsState','cashSnapshot','window','yen','S','today',
  live.slice(start,end)+'\nreturn renderCash;');
 const ctx={DENOMINATIONS:[10000],cashTotal:()=>0};
 const inputs={10000:0};
 const args=[element,ctx,inputs,null,{SMDate:{date:s=>s}},n=>n+'円',{pending:new Set()},()=> '2026-11-20'];
 factory(...args)();
 ok(element('cashStatus').hidden&&element('cashStatus').textContent===''&&
  element('cashBook').textContent==='—',
  'cash loading shows no redundant second blue information banner');
 args[3]={found:false,auditDate:'2026-11-20'};
 factory(...args)();
 ok(!element('cashStatus').hidden&&element('cashStatus').textContent.includes('見つかりません'),
  'cash existing actionable missing-ledger warning remains visible');
 ok(live.includes("updateReadScreenStatus_('cashDialog','帳簿残高と金種記録を取得しています…'")&&
  live.includes("updateReadScreenStatus_('cashDialog','帳簿残高と金種枚数を確認しています…'"),
  'cash reports fetch and verification phases in one status box');
 for(const [tag,key] of [
  ['live.js','1676-responsive-reads-v1677-visitor-v1678-cash'],
  ['visitor-approval.js','1676-responsive-reads-v1677-visitor-v1678-cash']
 ])ok(html.includes(tag+'?v='+key),'LIFF busts cached '+tag);
 ok(mh.includes('match.js?v=1664-v1678-refresh')&&
  mvh.includes('match-view.js?v=1639b-v1678-refresh'),
  'match user interfaces bust cached controllers');
 console.log('PASS '+n+'/'+n+' unified cash reading, blank initial selectors and foreground Update locks');
})().catch(e=>{console.error(e);process.exitCode=1});
