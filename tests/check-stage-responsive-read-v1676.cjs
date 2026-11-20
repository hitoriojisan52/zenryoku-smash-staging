#!/usr/bin/env node
'use strict';
/* v0.16.76: real nonblocking screen/amount functions with fake DOM + API.
 * No LINE account, Sheets, finance writes, Drive or network. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const ui=read('live.js'),html=read('live.html'),visitor=read('visitor-approval.js'),
 access=read('live-access-v2.js'),css=read('stage-ui.css');
let count=0;
function ok(x,msg){assert.ok(x,msg);count++;}
new Function(ui);new Function(visitor);new Function(access);count+=3;
const from=ui.indexOf('// v0.16.76: allow read-only management screens');
const to=ui.indexOf('async function boot(){',from);
ok(from>=0&&to>from,'real screen reader was inserted before secure bootstrap');
let open=false,closed=false,statusNode=null,waited=false,uiWrites=0;
const controls={close:{disabled:false}};
const toolbar={insertAdjacentElement(_where,node){statusNode=node;}};
const dlg={
 open:false,dataset:{},events:{},
 querySelector(selector){
  if(selector==='.stage-inline-read-status')return statusNode;
  if(selector==='.stage-dialog-toolbar')return toolbar;
  return null;
 },
 addEventListener(event,fn){this.events[event]=fn;},
 showModal(){this.open=true;open=true;},
 close(){this.open=false;closed=true;this.events.close?.();}
};
const fakeDocument={
 createElement(){return {
  className:'',hidden:false,textContent:'',attrs:{},
  setAttribute(k,v){this.attrs[k]=v;},
  classList:{add(){},remove(){}}
 };}
};
const window={};
const openScreen=new Function('$','document','window',
 ui.slice(from,to)+'\nreturn readScreen_;')(
 id=>{assert.equal(id,'cashDialog');return dlg;},fakeDocument,window);
let finishFirst;
const pendingFirst=new Promise(resolve=>{finishFirst=resolve;});
const first=openScreen('cashDialog','帳簿残高を読み込んでいます…',async isCurrent=>{
 await pendingFirst;if(isCurrent())uiWrites++;
});
ok(dlg.open&&open&&!closed&&!controls.close.disabled,
 'cash screen opens synchronously and Close remains usable');
ok(statusNode.textContent==='帳簿残高を読み込んでいます…'&&
 statusNode.attrs['aria-live']==='polite',
 'screen reports the precise inline fetch stage, not a spinner');
const duplicate=openScreen('cashDialog','同じ読込',async()=>{uiWrites+=100;});
ok(duplicate===first,'same panel does not duplicate GAS requests while awaiting data');
dlg.close();finishFirst();
(async()=>{
 await first;
 ok(closed&&!dlg.open&&uiWrites===0,
  'closing before response discards stale screen results without interrupting Close');
 let current;
 await openScreen('cashDialog','再読み込み中…',async valid=>{
  current=valid();if(valid())uiWrites++;
 });
 ok(current&&dlg.open&&uiWrites===1&&statusNode.hidden,
  'reopening creates a new request and hides inline status after success');
 const error=await openScreen('cashDialog','収支データ取得中…',async()=>{
  throw Error('検証用通信エラー');
 },null,true);
 ok(error===undefined&&!statusNode.hidden&&statusNode.textContent.includes('検証用通信エラー')&&
  dlg.open&&controls.close.disabled===false,
  'read error stays inside dialog, and user can still close it');
 for(const [functionName,opening] of [
  ['openCash','cashDialog'],['openLedger','ledgerDialog'],
  ['openScheduleMaster_','scheduleDialog'],['openParticipantManager_','participantDialog'],
  ['openVisitorForm_','visitorDialog'],['openMemberAttendance_','attendanceDialog']
 ]){
  const a=ui.indexOf('function '+functionName+'('),b=ui.indexOf('\n}',a);
  ok(a>=0&&b>a&&(ui.slice(a,b).includes("readScreen_('"+opening+"'")||
    (functionName==='openLedger'&&ui.slice(a,b).includes('readLedgerScreen_()'))),
   functionName+' immediately opens an inline-read dialog');
 }
 ok(visitor.includes("w.SMStageRead.open('visitorAdminDialog'")&&
  !visitor.includes("'visitorMineHistoryToggle'")&&
  !html.includes('id="visitorAdminHistoryToggle"')&&
  !html.includes('id="visitorMineHistoryToggle"'),
  'visitor admin loads inline and both visitor History buttons are absent');
 ok(access.includes("if(!dialog.open)dialog.showModal();")&&
  access.includes('readVersion++')&&
  !access.includes("return run(first?'読み込み中です…'"),
  'member authority viewer supports nonblocking reads and stale response safety');
 ok(html.includes('id="ledgerEditWeekday"')&&
  html.includes('placeholder="例：団体戦費用捻出"')&&
  ui.includes("syncPayoutWeekday_('ledgerEditDate','ledgerEditWeekday')"),
  'other-ledger dates display their weekday and the specified example');
 ok(css.includes('.stage-inline-read-status[hidden]')&&
  css.includes('.stage-field-save-status')&&
  html.includes('stage-ui.css?v=1676-responsive-reads')&&
  html.includes('visitor-approval.js?v=1676-responsive-reads')&&
  html.includes('live-access-v2.js?v=1676-responsive-reads'),
  'styles and all changed LINE WebView controllers are cache-busted');
 const a=ui.indexOf('async function saveAmount(kind){'),
  b=ui.indexOf('\nfunction ledgerLoadingRow_(',a);
 ok(a>=0&&b>a,'real amount-saving function exists');
 const nodes={
  adjustment:{value:'250',disabled:false},expense:{value:'0',disabled:false},
  adjustmentStatus:{textContent:''},expenseStatus:{textContent:''}
 };
 const S={actor:{role:'admin'},practiceId:'P-TEST',
  pending:new Set(),paymentNeedsRefresh:false,
  overview:{ledger:{rowId:'P-P-TEST',status:'open',
   adjustment:0,expense:0,version:4,income:0,balance:0}}};
 let completePayment,sends=0,errors=0,spin=0;
 const pendingWrite=new Promise(resolve=>{completePayment=resolve;});
 let nextWrite=()=>pendingWrite;
 const save=new Function('S','$','window','call','uuid','syncPaymentControls',
  'updateFooter','toast',ui.slice(a,b)+'\nreturn saveAmount;')(
  S,id=>nodes[id],{SMStageUX:{showError:async()=>{errors++;}}},
  async()=>{sends++;return nextWrite();},
  ()=>'OP-TEST-123',()=>{},()=>{},()=>{spin++;});
 const saving=save('adjustment');
 ok(sends===1&&S.pending.has('amount')&&nodes.adjustment.disabled&&
  nodes.adjustmentStatus.textContent.includes('保存中')&&spin===0,
  'daily adjustment saves with a per-field status, no global spinner');
 completePayment({practiceId:'P-TEST',ledgerVersion:5,income:250,expense:0,
  adjustment:250,balance:250});
 await saving;
 ok(S.pending.size===0&&S.overview.ledger.version===5&&
  nodes.adjustmentStatus.textContent==='保存しました',
  'successful save returns controls and updates the versioned accounting snapshot');
 nodes.adjustment.value='300';nextWrite=async()=>{throw Error('connection lost')};
 await save('adjustment');
 ok(sends===2&&S.paymentNeedsRefresh&&errors===1&&
  nodes.adjustmentStatus.textContent.includes('更新してください'),
  'unknown write outcome forbids automatic retry and requires manual refresh');
 ok(ui.includes("checkbox.disabled=locked||savingAmount||S.paymentNeedsRefresh"),
  'amount save briefly blocks overlapping collection checkboxes to prevent version conflict');
 ok(ui.includes("const values of")===false &&
  ui.includes("for(const value of [window.SMDate.date(month+'-01'),'前月繰越'"),
  'ledger first paints only the previous-month carry skeleton');
 console.log('PASS '+count+'/'+count+' nonblocking read panels, active Close, weekday, and safe field-level saves');
})().catch(e=>{console.error(e);process.exitCode=1});
