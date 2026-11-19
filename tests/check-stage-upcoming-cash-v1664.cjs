#!/usr/bin/env node
'use strict';
// v0.16.64 UI-only regression: no data writes, financial mutation or LINE call.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('live.html'),css=read('stage-ui.css'),ui=read('live.js'),
 match=read('match.js'),matchHtml=read('match.html'),visitor=read('visitor-approval.js');
const helpers={};vm.runInNewContext(read('date-format.js'),{window:helpers,Date,Intl});
const D=helpers.SMDate;
let n=0;const ok=(v,m)=>{assert.ok(v,m);n++;};
new Function(ui);new Function(match);new Function(visitor);n+=3;
ok(D.todayJst(new Date('2026-11-18T14:59:59Z'))==='2026-11-18'&&
 D.todayJst(new Date('2026-11-18T15:00:00Z'))==='2026-11-19',
 'Tokyo calendar boundaries, not phone locale, determine today');
const t=D.todayJst();
const add=n=>{const date=new Date(t+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10)};
const old=add(-1),today=add(0),soon=add(2),later=add(8);
const rows=[
 {practiceId:'P-LATE',date:later,startTime:'09:00',place:'別会場'},
 {practiceId:'P-PAST',date:old,startTime:'13:00',place:'前回'},
 {practiceId:'P-TODAY-LATE',date:today,startTime:'13:00',place:'午後'},
 {practiceId:'P-SOON',date:soon,startTime:'09:00',place:'次回'},
 {practiceId:'P-TODAY-EARLY',date:today,startTime:'09:00',place:'午前'}
];
ok(D.upcomingPractices(rows).map(p=>p.practiceId).join(',')===
 'P-TODAY-EARLY,P-TODAY-LATE,P-SOON,P-LATE',
 'past date removed, today included, earliest time then future dates sorted');
ok(D.nearestPractice(rows).practiceId==='P-TODAY-EARLY',
 'today earliest-time session is default');
ok(D.upcomingPractices([{practiceId:'P-PAST',date:old}]).length===0 &&
 D.nearestPractice([{practiceId:'P-PAST',date:old}])===null,
 'no historical fallback when no eligible future schedule');

// Execute real live reload; the legacy backend defaults to its LAST date.
// The screen must read it, then read the correct nearest eligible date.
const start=ui.indexOf('async function reload(refreshDates){'),
 end=ui.indexOf('\nfunction renderHome(){',start);
ok(start>0&&end>start,'real collection reload can be executed as isolated unit');
const state={pending:new Set(),loading:false,reloadPromise:null,updateEpoch:0,
 practiceId:'',paymentNeedsRefresh:false};
const dateNode={value:'',items:[],replaceChildren(...children){this.items=children}};
let calls=[],renders=0,controls=0,dates=rows;
const api=async(path,payload)=>{
 assert.equal(path,'/api/overview');
 calls.push(payload.practiceId||'');
 return {practice:{practiceId:payload.practiceId||'P-PAST',date:old,place:'旧日程'},
  practices:dates,participants:[],ledger:{},collectionAccess:{canCollect:true}};
};
const reload=new Function('S','$','call','window','Option','renderHome','syncPaymentControls','today',
 ui.slice(start,end)+'\nreturn reload;')(
 state,id=>id==='date'?dateNode:null,api,{SMDate:D},
 function Option(text,value){this.text=text;this.value=value},
 ()=>{renders++},()=>{controls++},()=> t);
(async()=>{
 await reload(true);
 ok(calls.join(',')===',P-TODAY-EARLY'&&state.practiceId==='P-TODAY-EARLY'&&
  dateNode.value==='P-TODAY-EARLY'&&dateNode.items.length===5,
  'first load defaults nearest today while displaying past unconfirmed options');
 ok(dateNode.items.some(i=>i.text.includes('前回'))&&
  renders===1&&controls===1,'historical unconfirmed schedule remains selectable on home screen');
 state.practiceId='P-LATE';calls=[];await reload(true);
 ok(calls.join(',')==='P-LATE'&&state.practiceId==='P-LATE',
  'manual future-date selection survives explicit refresh');
 dates=[rows[1]];state.practiceId='P-PAST';calls=[];await reload(true);
 ok(dateNode.items.some(i=>i.value==='P-PAST')&&state.practiceId==='P-PAST'&&
  state.overview.practice.practiceId==='P-PAST','past unconfirmed date remains selectable without a future date');

 // Selected day on opening participant manager uses a different nearest choice.
 ok(ui.includes("PM.practiceId=window.SMDate.nearestPractice(S.overview?.practices)?.practiceId||''")&&
  ui.includes('PM.practices=selectable;PM.practiceId=target;')&&
  ui.includes("call('/api/participant/list',{practiceId:target})"),
  'participant management still defaults to future and explicitly gates history');
 ok(ui.includes("$('visitorMinePractice').value=''")&&
  visitor.includes("$('visitorAdminPractice').value=''")&&
  visitor.includes('const unique=new Map()')&&
  visitor.includes('r.date<today')&&
  !visitor.includes("{value:'all',text:'すべての日程'}"),
  'visitor lists default to upcoming with opt-in read-only history');
 ok(visitor.includes("unique.has(previous)?previous:(future?.[0]||'')")&&
  ui.includes("$('visitorMinePractice').value=d.practiceId"),
  'manual day selection and newly submitted future request remain visible');

 ok(match.includes('upcomingMatchPractices_(data.practices)')&&
  match.includes('upcomingMatchPractices_(choices.practices)')&&
  match.includes('upcomingMatchPractices_(result.practices)')&&
  match.includes('else await timedStartup(')&&
  match.includes('matchNoUpcoming_()'),
  'bootstrap, non-bootstrap and read-only match paths choose closest future');
 ok(match.includes("$('matchHeader').textContent='対戦表未作成'")&&
  !match.includes("'対戦表を作成してください。'"),
  'no redundant empty-match help under already clear status');
 ok(match.includes("message:'この開催日の対戦表を削除しますか？'")&&
  !matchHtml.includes('QRを読み取ると、公式アカウントのフォローやLINEログインなしで'),
  'delete confirmation is one sentence and QR explanation removed');
 ok(html.includes('aria-label="開催日"')&&
  !/<label for="date">開催日<\/label>/.test(html),
  'home date label is visually removed while select stays accessible');
 ok(css.includes('font-size:14px!important;')&&
  css.includes('.stage-ui #matchPractice{font-size:13px!important;}'),
  'calendar dropdown text is a little smaller for long dates');
 ok(html.includes('⚙ 運用管理メニュー')&&
  html.indexOf('当番担当メニュー')<html.indexOf('管理者メニュー')&&
  html.indexOf('管理者メニュー')<html.indexOf('検証用メニュー')&&
  html.includes('id="manageAdminSection"')&&
  ui.includes("hidden=S.actor.role!=='admin'"),
  'management groups are duty, admin only and temporary test; original access gated');
 const menu=html.slice(html.indexOf('<dialog id="manageDialog">'),html.indexOf('</dialog>',html.indexOf('<dialog id="manageDialog">')));
 for(const id of ['cashCounter','openLedger','manageSchedules','managePeople',
  'visitorRegisterMenu','matchManage','visitorAdminMenu','manageAccess','manageAttendance']){
  ok((menu.match(new RegExp('id="'+id+'"','g'))||[]).length===1,'menu action ID preserved: '+id);
 }
 ok(html.includes('.cash-denom{display:flex;justify-content:space-between;align-items:center;min-height:34px;padding:1px 1px;')&&
  html.includes('.cash-money-row{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:1px 1px;')&&
  html.includes('.cash-summary{background:#eef2f7;padding:5px 9px;')&&
  html.includes('.cash-actions{display:flex;gap:8px;margin-top:5px}'),
  'cash count rows and book summary shrink without changing button height');
 ok(css.includes('.stage-ui button{padding-block:2px!important;}')&&
  css.includes('.stage-ui #courtSettings > summary,')&&
  css.includes('min-height:36px!important;')&&
  css.includes('.stage-ui #participantSettings.match-settings{margin-top:2px;}'),
  'buttons retain a little inside spacing; match foldable rows become shorter');
 for(const p of ['live.html','match.html','guest.html','match-view.html']){
  ok(read(p).includes('stage-ui.css?v='+(p==='live.html'?'1672-finance-receipt':'1665')),p+' has cache-busted compact style');
 }
 ok(html.includes('date-format.js?v=1664')&&html.includes('visitor-approval.js?v=1664')&&
  html.includes('live.js?v=1672-finance-receipt')&&matchHtml.includes('match.js?v=1664'),
  'all changed date/navigation handlers have updated script URLs');
 console.log('PASS '+n+'/'+n+' upcoming date defaults, compact cash, grouped menus and match copy');
})().catch(e=>{console.error(e);process.exitCode=1});
