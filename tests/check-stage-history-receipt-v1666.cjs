#!/usr/bin/env node
'use strict';
/* v1666: Explicit historical reads without changing future defaults, and
 * receipt partial-save confirmation that never re-creates a ledger row. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ui=read('live.js'),html=read('live.html'),visitor=read('visitor-approval.js');
const gas=read('gas-staging/コード.gs'),match=read('match.js');
const window={};vm.runInNewContext(read('date-format.js'),{window,Intl,Date});
const D=window.SMDate;
let count=0;const ok=(v,msg)=>{assert.ok(v,msg);count++};
new Function(ui);new Function(visitor);new Function(gas);count+=3;
const day=D.todayJst(),plus=n=>{const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const past=plus(-2),future=plus(2);
const dates=[{practiceId:'P-PAST',date:past,startTime:'13:00',place:'前回会場'},
 {practiceId:'P-FUTURE',date:future,startTime:'09:00',place:'次回会場'}];
const state={pending:new Set(),loading:false,reloadPromise:null,updateEpoch:0,
 practiceId:'',paymentNeedsRefresh:false,confirmedPracticeKey:''};
const dateNode={value:'',items:[],replaceChildren(...children){this.items=children;}};
const calls=[];
let confirmedIds=[];
const api=async(_path,payload)=>{
 calls.push(payload.practiceId||'');
 const target=dates.find(p=>p.practiceId===payload.practiceId)||dates[0];
 return {practice:target,practices:dates,confirmedPracticeIds:confirmedIds,
  participants:[],ledger:null,collectionAccess:{canCollect:false,reason:'閲覧のみ'}};
};
const reloadSource=ui.slice(ui.indexOf('async function reload(refreshDates){'),ui.indexOf('function renderHome(){'));
ok(reloadSource.includes('const eligible=(d.practices||[])')&&
 !ui.includes('function toggleHomeHistory_(){'),
 'collection picker always exposes unconfirmed past dates; no history toggle');
const reload=new Function('S','$','call','window','Option','renderHome','syncPaymentControls','today',
 reloadSource+'return reload;')(
 state,id=>id==='date'?dateNode:null,api,{SMDate:D},
 function Option(text,value){this.text=text;this.value=value;},()=>{},()=>{},()=>day);
(async()=>{
 await reload(true);
 ok(state.practiceId==='P-FUTURE'&&dateNode.items.length===2&&
  dateNode.items.some(o=>o.value==='P-PAST'),
  'default remains nearest future, but past unconfirmed date is directly selectable');
 state.practiceId='P-PAST';await reload(true);
 ok(state.practiceId==='P-PAST'&&state.overview.practice.practiceId==='P-PAST'&&
  dateNode.value==='P-PAST','old unconfirmed practice stays selected for inspection');
 confirmedIds=['P-PAST'];state.practiceId='';await reload(true);
 ok(state.practiceId==='P-FUTURE'&&dateNode.items.length===1&&
  dateNode.items[0].value==='P-FUTURE',
  'confirmed practice disappears from collection picker immediately');
 confirmedIds=[];await reload(true);
 ok(dateNode.items.some(o=>o.value==='P-PAST'),
  'unlocked practice returns to collection picker without history button');
 ok(!html.includes('id="homeHistoryToggle"')&&
  !html.includes('id="participantHistoryToggle"')&&
  html.includes('id="visitorMineHistoryToggle"')&&html.includes('id="visitorAdminHistoryToggle"'),
  'collection and participant History removed, visitor request histories unaffected');
 ok(!ui.includes('PM.showHistoryDates')&&ui.includes('const selectable=(answer?.practices||[])')&&
  ui.includes('PM.practices=selectable;PM.practiceId=target;'),
  'participant picker now includes all open historical days without a History toggle');
 ok(match.includes('upcomingMatchPractices_(data.practices)')&&
  ui.includes('if(!practice||practice.date<today())')&&
  gas.includes("if(practice.date<today_())fail_('BAD_REQUEST','過去の開催日は申請できません')"),
  'match and new visitor registration remain future-only');

 class Element{
  constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.value='';this.disabled=false;this.attrs={};}
  append(...v){this.children.push(...v);}
  replaceChildren(...v){this.children=v;}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(){}
 }
 const nodes={visitorMinePractice:new Element('select'),visitorAdminPractice:new Element('select')};
 const $=id=>nodes[id];
 const node=(tag,cls,text)=>{const el=new Element(tag,text);el.className=cls;return el};
 const optCode=visitor.slice(visitor.indexOf('function optionsFor('),visitor.indexOf('function card('));
 const optionsFor=new Function('$','w','node','practiceOption',optCode+'return optionsFor;')(
  $,{SMDate:D},node,p=>D.practiceLabel(p));
 const requestRows=[{requestId:'VR-PAST',practiceId:'P-PAST',date:past,place:'前回会場'}];
 optionsFor(requestRows,'visitorMinePractice',dates,false);
 ok(nodes.visitorMinePractice.children.length===1&&nodes.visitorMinePractice.value==='P-FUTURE',
  'visitor lists default to upcoming-only');
 optionsFor(requestRows,'visitorMinePractice',dates,true);
 ok(nodes.visitorMinePractice.children.length===2&&
  nodes.visitorMinePractice.children[1].textContent.startsWith('履歴：')&&
  nodes.visitorMinePractice.value==='P-FUTURE',
  'visitor historical records visible only when explicitly requested');
 nodes.visitorMinePractice.value='P-PAST';
 const historyRows=optionsFor(requestRows,'visitorMinePractice',dates,true);
 ok(historyRows.length===1&&historyRows[0].requestId==='VR-PAST',
  'historical visitor request is available for inspection');

 const cardSrc=visitor.slice(visitor.indexOf('function card('),visitor.indexOf('function render('));
 const card=new Function('node','w','STATUS','shortDate','formatRequestedAt_','openConfirm','openEdit','openDelete',
  cardSrc+'return card;')(node,{SMDate:D},
  {pending:'承認待ち',approved:'承認済み',rejected:'却下済み'},
  x=>D.date(x.date),()=>D.date(day),()=>{},()=>{},()=>{});
 const oldCard=card({name:'過去のビジター',status:'approved',date:past},false);
 const newCard=card({name:'未来のビジター',status:'approved',date:future},false);
 const walk=e=>[e,...e.children.flatMap(walk)];
 ok(walk(oldCard).filter(e=>e.tag==='button').every(e=>e.disabled),
  'past visitor history shows operations as disabled, never hidden');
 ok(walk(newCard).some(e=>e.tag==='button'&&e.textContent==='修正'&&!e.disabled),
  'approved future visitor edit stays available');
 ok(walk(card({name:'過去のビジター',status:'pending',date:past},true))
   .filter(e=>e.tag==='button').every(e=>e.disabled),
  'admin cannot approve or reject a past history record from the new picker');

 const uploadSource=ui.slice(ui.indexOf('async function attachAfterLedgerSave_('),
  ui.indexOf('function syncPayoutWeekday_('));
 let uploadAttempts=0;
 const receiptState={receiptPartialWarning:''};
 const attach=new Function('S','uploadReceipt_',uploadSource+'return attachAfterLedgerSave_;')(
  receiptState,async()=>{uploadAttempts++;throw new Error('Driveの承認が必要です');});
 const result=await attach({name:'receipt.pdf'},{ledger:[{rowId:'R-TEST',version:1}]},'R-TEST');
 ok(result===false&&uploadAttempts===1&&
  receiptState.receiptPartialWarning.includes('収支を再登録せず'),
  'receipt failure preserves committed accounting row and explicitly prohibits duplicate add');
 const guardSource=ui.slice(ui.indexOf('async function guard('),ui.indexOf('async function boot(){'));
 let message='',busy=false;
 const guard=new Function('S','toast','window','reload',guardSource+'return guard;')(
  {...receiptState,pending:new Set()},()=>{},{SMStageUX:{
   run:async(_label,task)=>{busy=true;try{await task()}finally{busy=false}},
   showError:async e=>{ok(!busy,'error confirmation waits until global save lock clears');message=e.message}
  }},async()=>{});
 // Verify the already-staged warning is always surfaced as a persistent dialog.
 await guard(async()=>{});
 ok(message.includes('収支を再登録せず')&&
  gas.includes('function stageReceiptAuthorizeV1666_()')&&
  gas.includes('stageReceiptFolder_();'),
  'one-time staging Drive authorization path and persistent receipt warning are wired');
 ok(html.includes('live.js?v=1676-responsive')&&
  html.includes('visitor-approval.js?v=1676-responsive'),
  'LIFF WebView fetches fresh code after history additions');
 console.log('PASS '+count+'/'+count+' history isolation and receipt partial-save recovery');
})().catch(e=>{console.error(e);process.exitCode=1});
