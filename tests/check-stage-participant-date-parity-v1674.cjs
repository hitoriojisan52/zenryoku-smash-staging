#!/usr/bin/env node
'use strict';
/* v0.16.74: actual home, participant-list and GAS selectors. Read-only
 * simulations: no member/finance/LINE data is written. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const ui=read('live.js'),html=read('live.html'),gas=read('gas-staging/コード.gs'),
 visitor=read('visitor-approval.js');
let n=0;const ok=(v,msg)=>{assert.ok(v,msg);n++;};
new Function(ui);new Function(gas);n+=2;
const win={};vm.runInNewContext(read('date-format.js'),{window:win,Intl,Date});
const D=win.SMDate,todayKey=D.todayJst();
const plus=i=>{const d=new Date(todayKey+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10)};
let now=todayKey;
const practices=[
 {practiceId:'P-PAST-C',date:plus(-3),startTime:'10:00',place:'過去確定'},
 {practiceId:'P-PAST-O',date:plus(-1),startTime:'10:00',place:'過去未確定'},
 {practiceId:'P-TODAY-C',date:todayKey,startTime:'09:00',place:'当日確定'},
 {practiceId:'P-TODAY-O',date:todayKey,startTime:'14:00',place:'当日未確定'},
 {practiceId:'P-FUTURE-O',date:plus(2),startTime:'10:00',place:'未来未確定'},
 {practiceId:'P-FUTURE-C',date:plus(3),startTime:'10:00',place:'未来確定'}
];
let confirmed=['P-PAST-C','P-TODAY-C','P-FUTURE-C'];
const sortedIds=['P-PAST-O','P-TODAY-C','P-TODAY-O','P-FUTURE-O'];
const apiRows=()=>({practices,confirmedPracticeIds:confirmed});
function Option(text,value){this.text=text;this.value=value;}
ok(!html.includes('id="participantHistoryToggle"')&&
 !html.includes('id="homeHistoryToggle"')&&
 !ui.includes('toggleParticipantHistory_')&&
 !ui.includes('PM.showHistoryDates')&&
 !ui.includes("'participantHistoryToggle'"),
 'collection and participant lists use simple dropdowns without History buttons');
ok(!html.includes('id="visitorMineHistoryToggle"')&&
 !html.includes('id="visitorAdminHistoryToggle"')&&
 !visitor.includes("'visitorMineHistoryToggle'"),
 'both visitor date selectors now use confirmation status instead of History buttons');

const reloadSrc=ui.slice(ui.indexOf('async function reload(refreshDates){'),
 ui.indexOf('function renderHome(){'));
ok(reloadSrc.includes('dayChanged')&&reloadSrc.includes('selectableDayKey'),
 'collection recomputes confirmed-today eligibility across Tokyo midnight');
const homeState={
 practiceId:'',pending:new Set(),loading:false,reloadPromise:null,updateEpoch:0,
 confirmedPracticeKey:'',selectableDayKey:'',paymentNeedsRefresh:false
};
const collectionSelect={items:[],value:'',replaceChildren(...items){this.items=items;}};
const homeApi=async (_path,payload)=>{
 const p=practices.find(p=>p.practiceId===payload.practiceId)||practices[0];
 return {...apiRows(),practice:p,participants:[],ledger:null,collectionAccess:{canCollect:false}};
};
const reload=new Function('S','$','call','window','Option','renderHome',
 'syncPaymentControls','today',reloadSrc+'\nreturn reload;')(
 homeState,id=>{assert.equal(id,'date');return collectionSelect;},
 homeApi,{SMDate:D},Option,()=>{},()=>{},()=>now);

const first=gas.indexOf('function participantList_(ss,member,payload){'),
 after=gas.indexOf('function participantArchivePending_(ss,id){',first);
ok(first>=0&&after>first,'actual GAS participant-list response is available');
let entryReads=0;
const gasList=new Function('practices_','str_','practice_','participantRows_',
 'paymentRows_','sheetRows_','attendanceAuditDates_','norm_','entries_',
 'participantMatchLocked_','fail_',gas.slice(first,after)+'\nreturn participantList_;')(
 ()=>practices.map(p=>({...p})),v=>String(v??'').trim(),
 (_ss,id)=>practices.find(p=>p.practiceId===id),()=>[],()=>[],()=>[],
 ()=>({}),v=>String(v??'').trim(),
 ()=>{entryReads++;return confirmed.map(id=>({
  rowId:'P-'+id,kind:'practice',practiceId:id,status:'confirmed'
 }))},
 ()=>false,(code,msg)=>{throw Object.assign(Error(msg),{smCode:code})});
const participantApi=async (_path,payload)=>{
 assert.equal(_path,'/api/participant/list');
 return gasList({}, {role:'admin'},payload).data;
};
const PM={practices:[],practiceId:'',people:[],
 editing:null,deleting:null,matchLocked:false,financeLocked:false,uncertain:false};
const participantSelect={items:[],value:'',
 replaceChildren(...items){this.items=items;}};
const participantSrc=ui.slice(ui.indexOf('function participantDates_(){'),
 ui.indexOf('function renderParticipantManager_(){'));
const loadSrc=ui.slice(ui.indexOf('async function loadParticipants_('),
 ui.indexOf('function openParticipantManager_(){'));
ok(participantSrc.startsWith('function participantDates_')&&loadSrc.includes("'/api/participant/list'"),
 'real participant date rendering and server read are used by regression');
const participantFns=new Function('PM','$','window','Option','call','today',
 'renderParticipantManager_',participantSrc+loadSrc+
 '\nreturn {participantDates_,loadParticipants_};')(
 PM,id=>{assert.equal(id,'participantPractice');return participantSelect;},
 {SMDate:D},Option,participantApi,()=>now,()=>{});
const participant=participantFns.loadParticipants_;

(async()=>{
 await reload(true);
 ok(collectionSelect.items.map(o=>o.value).join('|')===sortedIds.join('|')&&
  homeState.practiceId==='P-TODAY-C',
  'collection shows all open past/future plus confirmed today, defaults to first today');
 PM.practiceId='';await participant();
 ok(participantSelect.items.map(o=>o.value).join('|')===sortedIds.join('|')&&
  PM.practiceId==='P-TODAY-C'&&PM.financeLocked,
  'participant list matches collection exactly, confirmed today is view-only');
 ok(!participantSelect.items.some(o=>o.text.startsWith('履歴：')),
  'past unconfirmed dates use the same plain labels as collection');
 PM.practiceId='P-PAST-O';await participant();
 ok(PM.practiceId==='P-PAST-O'&&participantSelect.value==='P-PAST-O',
  'manual past unconfirmed selection persists after reload');
 homeState.practiceId='P-PAST-O';await reload(true);
 ok(homeState.practiceId==='P-PAST-O'&&collectionSelect.value==='P-PAST-O',
  'collection also preserves manual past unconfirmed selection');
 // Reconfirm/open today's row without mutating a real ledger.
 confirmed=['P-PAST-C','P-TODAY-O','P-FUTURE-C'];
 homeState.practiceId='';await reload(true);
 PM.practiceId='';await participant();
 ok(collectionSelect.items.map(o=>o.value).join('|')===
  participantSelect.items.map(o=>o.value).join('|')&&
  collectionSelect.items.some(o=>o.value==='P-TODAY-O')&&
  collectionSelect.items.some(o=>o.value==='P-TODAY-C')&&
  !PM.financeLocked,
  'confirmation reversal updates both menus and restores editable unconfirmed row');
 // Calendar moves to the next day: old confirmed session vanishes even though
 // earlier confirmed-ID set remains unchanged; past open days stay available.
 confirmed=['P-PAST-C','P-TODAY-C','P-FUTURE-C'];
 homeState.practiceId='P-FUTURE-O';
 await reload(true);
 now=plus(1);
 await reload(false);
 PM.practiceId='P-FUTURE-O';await participant();
 const expected=['P-PAST-O','P-TODAY-O','P-FUTURE-O'];
 ok(collectionSelect.items.map(o=>o.value).join('|')===expected.join('|')&&
  participantSelect.items.map(o=>o.value).join('|')===expected.join('|'),
  'JST midnight removes prior-day confirmed date in both lists');
 ok(homeState.practiceId==='P-FUTURE-O'&&PM.practiceId==='P-FUTURE-O',
  'existing future selection survives midnight refresh');
 ok(entryReads>=4&&gas.slice(first,after).includes('confirmedPracticeIds:allLedgerRows.filter')&&
  !gas.slice(first,after).includes('getRange('),
  'participant backend reuses its one existing ledger read for confirmation metadata');
 ok(gas.slice(first,after).includes("financeLocked:!!ledgers[0]&&ledgers[0].status==='confirmed'"),
  'confirmed-today read access does not lift finance modification lock');
 ok(html.includes('live.js?v=1676-responsive-reads'),
  'LINE WebView receives refreshed date selector controller');
 console.log('PASS '+n+'/'+n+' collection/participant same-day and past-open calendar parity');
})().catch(e=>{console.error(e);process.exitCode=1});
