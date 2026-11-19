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
  requestedAt:old,status:'pending',version:0,requestedByName:'一般メンバー',nameKana:'カナサンプル',memo:'遅刻します'},
 {requestId:'VR-TWO',practiceId,name:'仮二郎',date:'2026-11-21',place:'検証体育館',
  requestedAt:old,status:'approved',attending:true,version:1,requestedByName:'一般メンバー'},
 {requestId:'VR-THREE',practiceId,name:'仮三郎',date:'2026-11-21',place:'検証体育館',
  requestedAt:old,status:'rejected',version:2,requestedByName:'一般メンバー'}
];
const schedules=[
 {practiceId,date:'2026-11-21',place:'検証体育館',startTime:'09:00',endTime:'13:00'},
 {practiceId:'PR-SECOND',date:'2026-11-28',place:'別体育館',startTime:'09:00',endTime:'13:00'},
 {practiceId:'PR-EMPTY',date:'2026-12-05',place:'無回答会場',startTime:'09:00',endTime:'13:00'}
];
w.SMVisitor.setup({api:async path=>({requests:rows,practices:schedules}),actor:{role:'admin'}});
const find=(e,cls)=>{
 if(String(e.className).split(' ').includes(cls))return e;
 for(const child of e.children){const match=find(child,cls);if(match)return match;}
 return null;
};
const deepText=e=>[e.textContent,...e.children.map(deepText)].filter(Boolean).join(' ');
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
  const text=deepText(find(card,'visitor-review-info')||card);
  ok(text.includes('申請日：'+expected),'rendered application date is yyyy/MM/dd HH:mm JST');
  ok(text.includes('👤 申請者：一般メンバー')&&!text.includes('カナ：'),
   'admin review shows applicant icon and hides registration kana');
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
 elements.visitorDecisionCancel.listeners.click();
 ok(!elements.visitorDecisionDialog.open,'confirmation cancellation closes the dialog');
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
 ok(html.includes('<details id="visitorNewFormSection"')&&
  html.indexOf('<details id="visitorNewFormSection"')<html.indexOf('<form id="visitorForm"')&&
  !html.includes('<details id="visitorNewFormSection" open'),
  'new visitor form is collapsible and initially closed');
 ok(html.includes('id="visitorMinePractice"')&&html.includes('id="visitorAdminPractice"'),
  'requester and administrator both have date dropdowns');
 ok(!deepText(elements.visitorAdminCards).includes('📧'),
  'visitor cards, including admin review, never display email');
 ok(find(elements.visitorMineCards.children[1],'visitor-status')!==null&&
  find(elements.visitorAdminCards.children[1],'visitor-status')===null,
  "approval status badge only shown on the requester visitor registration screen");
 ok(find(elements.visitorMineCards.children[1],'participant-card-content')!==null,
  'visitor cards share participant list layout');
 const memberCards=elements.visitorMineCards.children;
 const pendingActions=find(memberCards[0],'visitor-review-actions').children,
  approvedActions=find(memberCards[1],'visitor-review-actions').children,
  rejectedActions=find(memberCards[2],'visitor-review-actions').children;
 ok(pendingActions.map(x=>x.textContent).join(',')==='修正,削除'&&
  pendingActions[0].disabled&&!pendingActions[1].disabled,
  'pending own application: modify disabled, delete enabled');
 ok(!approvedActions[0].disabled&&approvedActions[1].disabled,
  'approved own visitor: modify enabled, delete disabled');
 ok(rejectedActions.every(button=>button.disabled),
  'rejected own request: no modify or delete actions');
 ok(deepText(elements.visitorMineCards.children[0]).includes('📝 遅刻します')&&
  !deepText(elements.visitorMineCards.children[0]).includes('備考:')&&
  !deepText(elements.visitorAdminCards.children[0]).includes('備考:')&&
  !deepText(elements.visitorMineCards.children[0]).includes('カナ：'),
  'visitor request/admin lists show plain note and hide kana');
 ok(!deepText(elements.visitorMineCards).includes('📧'),
  'visitor self-service cards never show email');
 ok(find(memberCards[1],'participant-card-attendance').textContent==='参加',
  'approved visitor shows actual participant attendance, not only approval state');
 pendingActions[1].listeners.click();
 ok(elements.visitorMineDeleteDialog.open&&
  elements.visitorMineDeleteText.textContent.includes('削除しますか'),
  'pending deletion shows explicit confirmation before backend call');
 elements.visitorMineDeleteCancel.listeners.click();
 ok(!elements.visitorMineDeleteDialog.open,
  'cancelling pending deletion never invokes backend');
 approvedActions[0].listeners.click();
 ok(elements.visitorMineEditDialog.open &&
  elements.visitorMineEditAttendance.value==='attend',
  'approved edit opens with current attendance exactly as participant list');
 elements.visitorMineEditCancel.listeners.click();
 ok(!elements.visitorMineEditDialog.open,
  'cancelling edits does not write');
 ok(html.includes('id="visitorMineEditAttendance"')&&
  html.includes('id="visitorMineEditName"')&&
  html.includes('id="visitorMineEditKana"')&&
  html.includes('id="visitorMineEditMemo"')&&
  html.includes('ビジター（変更不可）'),
  'own visitor edit has name, kana, attendance, memo and immutable category');
 ok(!html.slice(html.indexOf('<dialog id="visitorMineEditDialog"'),
  html.indexOf('<dialog id="visitorMineDeleteDialog"')).includes('メールアドレス'),
  'own visitor edit form has no email input or label');
 ok(ui.includes("attending:$('visitorMineEditAttendance').value==='attend'")&&
  ui.includes("category:'visitor'"),
  'requester edit sends participant-list attendance semantics and fixed visitor category');
 rows.push({requestId:'VR-FOUR',practiceId:'PR-SECOND',name:'別日程',
  date:'2026-11-28',place:'別体育館',requestedAt:old,status:'pending',version:0});
 await w.SMVisitor.loadMine();
 elements.visitorMinePractice.value=practiceId;
 elements.visitorMinePractice.listeners.change();
 ok(elements.visitorMineCards.children.length===3,
  'date dropdown filters request cards to selected practice');
 elements.visitorMinePractice.value='PR-SECOND';
 elements.visitorMinePractice.listeners.change();
 ok(elements.visitorMineCards.children.length===1 &&
  deepText(elements.visitorMineCards.children[0]).includes('別日程'),
  'switching date shows matching visitor alone');
 ok(!elements.visitorMinePractice.children.some(opt=>opt.value==='all'),
  'visitor date picker excludes the all-dates option');
 elements.visitorMinePractice.value=practiceId;
 elements.visitorMinePractice.listeners.change();
 ok(elements.visitorMineCards.children.length===3,
  'nearest date shows only its three request statuses');
 elements.visitorMinePractice.value='PR-EMPTY';
 elements.visitorMinePractice.listeners.change();
 ok(elements.visitorMineCards.children.length===1&&
  deepText(elements.visitorMineCards.children[0]).includes('この開催日のビジター申請はありません'),
  'selecting a master schedule date without requests shows clear empty-state message');
 elements.visitorMinePractice.value=practiceId;
 elements.visitorMinePractice.listeners.change();

 for(const oldId of ['visitorMineMenu','visitorMineDialog','visitorMemberRefresh','visitorMineList']){
  ok(!html.includes('id="'+oldId+'"'),'obsolete standalone element removed: '+oldId);
  ok(!ui.includes("$('"+oldId+"')"),'no stale listener or DOM reference: '+oldId);
 }
 ok(ui.includes("render('visitorMineCards',optionsFor(mineRows,'visitorMinePractice',mineDates,mineHistoryVisible),false)")&&
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
  ok(read(page).includes(page==='live.html'?'stage-ui.css?v=1673-receipt-close':'stage-ui.css?v=1665'),'same shared button CSS cache applied: '+page);
 }
 ok(html.includes('date-format.js?v=1664')&&html.includes('visitor-approval.js?v=1664')&&
  html.includes('live.js?v=1675-startup-perf')&&html.includes('live-access-v2.js?v=1663'),
  'staging LIFF refreshes all modified JavaScript assets');
 ok(matchConfirm.includes('match-modal-is-error')&&matchCss.includes('.match-modal-is-error .match-modal-box{border-top:4px solid #c62828}'),
  'intentional confirmation versus error popup distinction remains unchanged');
 console.log('PASS '+n+'/'+n+' visitor timestamps, above-form statuses, and cross-screen button semantics');
})().catch(e=>{console.error(e);process.exitCode=1});
