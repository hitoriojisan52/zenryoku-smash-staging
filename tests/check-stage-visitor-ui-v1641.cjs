#!/usr/bin/env node
'use strict';
// v0.16.41: simulate real visitor status rendering and check all staging
// screens' button vocabulary. Does not contact any server or alter Sheets.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const dateJs=read('date-format.js'),ui=read('visitor-approval.js'),
 html=read('live.html'),liveJs=read('live.js'),style=read('stage-ui.css'),
 access=read('live-access-v2.js'),match=read('match.html'),
 matchCss=read('match.css'),matchConfirm=read('match-confirm.js');
let n=0,ok=(v,msg)=>{assert.ok(v,msg);n++;};
new Function(ui);new Function(liveJs);new Function(access);new Function(dateJs);n+=4;
const w={SMStageUX:{run:async(_label,fn)=>fn(),showError:async()=>{} }};
vm.runInNewContext(dateJs,{window:w,Date,Intl},{filename:'date-format.js'});
const old='Wed Nov 18 2026 20:10:47 GMT+0900 (GMT+09:00)';
const expected='2026/11/18 20:10';
for(const input of [old,'2026-11-18T11:10:47Z','2026-11-18 20:10:47','2026/11/18 20:10:47',new Date('2026-11-18T11:10:47Z')]){
 const formatted=w.SMDate.dateTimeJst(input,false);
 assert.equal(formatted,expected,'JST formatting handles '+String(input));
 n++;
}
ok(w.SMDate.dateTimeJst(old).startsWith('2026/11/18(水) 20:10'),
 'existing weekday-visible datetime format preserved by default');
class Node {
 constructor(name='div'){this.tagName=name;this.className='';this.children=[];this.listeners={};this.textContent='';this.disabled=false;this.hidden=false;this.open=false;}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=[...items];}
 setAttribute(key,value){this[key]=String(value);}
 addEventListener(name,fn){this.listeners[name]=fn;}
 showModal(){this.open=true;}
 close(){this.open=false;}
}
const elements={};
const document={getElementById:id=>elements[id]||(elements[id]=new Node(id)),
 createElement:tag=>new Node(tag)};
vm.runInNewContext(ui,{window:w,document,Date,Intl,console},{filename:'visitor-approval.js'});
const practiceId='PR-SYNTHETIC-1121',rows=[
 {requestId:'VR-ONE',practiceId,name:'仮一郎',date:'2026-11-21',place:'検証体育館',
  requestedAt:old,status:'pending',version:0,requestedByName:'一般メンバー'},
 {requestId:'VR-TWO',practiceId,name:'仮二郎',date:'2026-11-21',place:'検証体育館',
  requestedAt:old,status:'approved',version:1,requestedByName:'一般メンバー'},
 {requestId:'VR-THREE',practiceId,name:'仮三郎',date:'2026-11-21',place:'検証体育館',
  requestedAt:old,status:'rejected',version:2,requestedByName:'一般メンバー'}
];
w.SMVisitor.setup({api:async path=>({requests:rows}),actor:{role:'admin'}});
const find=(e,cls)=>e.children.find(x=>x.className===cls);
(async()=>{
 const own=await w.SMVisitor.loadMine();
 ok(own.length===3&&elements.visitorMineCards.children.length===3,
  'integrated member request list shows pending, approved and rejected status');
 ok(!elements.visitorMineMenu?.listeners?.click &&
  !elements.visitorMineDialog?.open,'old separate member menu/dialog is unused');
 const admin=await w.SMVisitor.loadAdmin();
 ok(admin.length===3&&elements.visitorAdminCards.children.length===3,
  'administrator review list renders all request states');
 const cards=elements.visitorAdminCards.children;
 for(const card of cards){
  const text=find(card,'visitor-review-info')?.textContent||'';
  ok(text.includes('申請日時：'+expected),'rendered application date is yyyy/MM/dd HH:mm JST');
  ok(!text.includes('GMT+')&&!text.includes('Wed Nov'),
   'no raw Date.toString / GMT English timestamp in UI');
 }
 const p=find(cards[0],'visitor-review-actions').children,
 a=find(cards[1],'visitor-review-actions').children,
 r=find(cards[2],'visitor-review-actions').children;
 ok(p[0].className==='btn-green'&&p[1].className==='btn-danger',
  'pending approval green and rejection red');
 ok(!p[0].disabled&&!p[1].disabled,'pending applicant allows both decisions');
 ok(a[0].disabled&&!a[1].disabled,'approved visitor can only be rejected');
 ok(r[0].disabled&&r[1].disabled,'rejected state is terminal and both buttons disabled');
 p[1].listeners.click();
 ok(elements.visitorDecisionConfirm.className==='btn-danger'&&elements.visitorDecisionDialog.open,
  'rejection confirmation button explicitly uses destructive red');
 p[0].listeners.click();
 ok(elements.visitorDecisionConfirm.className==='btn-green',
  'approval confirmation button explicitly uses positive green');
 ok(html.includes('id="visitorMineCards"')&&
  html.indexOf('id="visitorMineCards"')<html.indexOf('<form id="visitorForm"'),
  'own application history displayed ABOVE new registration form');
 ok(html.includes('id="visitorMyRequestsTitle"')&&
  html.includes('id="visitorForm"')&&
  html.includes('新しいビジターを申請'),
  'two sections clearly labeled within same visitor registration screen');
 for(const oldId of ['visitorMineMenu','visitorMineDialog','visitorMemberRefresh','visitorMineList']){
  ok(!html.includes('id="'+oldId+'"'),'obsolete standalone element removed: '+oldId);
  ok(!ui.includes("$('"+oldId+"')"),'no stale listener or DOM reference: '+oldId);
 }
 ok(ui.includes("render('visitorMineCards',result.requests,false)")&&
  !ui.includes("render('visitorMineList'"),
  'request status refreshed only in integrated screen');
 ok(liveJs.includes("const [response]=await Promise.all([call('/api/visitor/practices'),window.SMVisitor.loadMine()])"),
  'visitor registration opening fetches own application statuses');
 const submit=liveJs.slice(liveJs.indexOf('async function registerVisitor_()'),liveJs.indexOf('// v0.16.38d:',liveJs.indexOf('async function registerVisitor_()')));
 ok(!submit.includes("close('visitorDialog')")&&
  submit.includes('await window.SMVisitor.loadMine()'),
  'after applying, form remains open and history refreshes above it');
 ok(style.includes('button.btn-danger')&&style.includes('background:#c62828;color:#fff'),
  'red destructive button explicitly supported by shared stylesheet');
 for(const type of ['btn-blue','btn-green','btn-outline','btn-danger']){
  ok(style.includes('button.'+type),'shared style defines button meaning: '+type);
 }
 ok(style.includes('.stage-ui .modal-actions button{')&&
  style.includes('flex-wrap:wrap;gap:8px')&&style.includes('min-height:44px'),
  'mobile button layout, wrapping, tap area and spacing remain consistent');
 ok(access.includes("item('button','btn-green','承認')")&&
  access.includes("item('button','btn-danger','却下')"),
  'member administration approval/rejection uses same green/red meaning');
 ok(match.includes('id="deleteMatch" class="btn-danger"')&&
  match.includes('id="saveCourts" class="btn-green"')&&
  match.includes('id="addFixedGroup" class="btn-green"'),
  'match delete and positive setting changes follow same semantic colors');
 for(const id of ['memberAccessClose','cashClose','scheduleClose','closeLedger','closeModal']){
  const match=html.match(new RegExp('<button[^>]*id="'+id+'"[^>]*>'));
  ok(match&&match[0].includes('class="btn-outline"'),'close button is secondary grey: '+id);
 }
 for(const page of ['live.html','match.html','guest.html','match-view.html']){
  ok(read(page).includes('stage-ui.css?v=1641'),'same shared button CSS cache applied: '+page);
 }
 ok(html.includes('date-format.js?v=1641')&&html.includes('visitor-approval.js?v=1641')&&
  html.includes('live.js?v=1641')&&html.includes('live-access-v2.js?v=1641'),
  'staging LIFF refreshes all modified JavaScript assets');
 ok(matchConfirm.includes('match-modal-is-error')&&matchCss.includes('.match-modal-is-error .match-modal-box{border-top:4px solid #c62828}'),
  'intentional confirmation versus error popup distinction remains unchanged');
 console.log('PASS '+n+'/'+n+' visitor timestamps, above-form statuses, and cross-screen button semantics');
})().catch(e=>{console.error(e);process.exitCode=1});
