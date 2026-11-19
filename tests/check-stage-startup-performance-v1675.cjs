#!/usr/bin/env node
'use strict';
/* Real isolated GAS and UI functions, fake Sheets/Worker only. No LINE or
 * Google account requests, no remote writes, no fabricated speed claims. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const gas=read('gas-staging/コード.gs'),ui=read('live.js'),html=read('live.html');
const dateCtx={window:{}};vm.runInNewContext(read('date-format.js'),{...dateCtx,Date,Intl});
const D=dateCtx.window.SMDate,day=D.todayJst();
const offset=n=>{const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
let n=0;function ok(x,m){assert.ok(x,m);n++;}
new Function(gas);new Function(ui);n+=2;
const days=[
 {practiceId:'PAST-C',date:offset(-2),startTime:'09:00',place:'過去確定',hours:4},
 {practiceId:'PAST-O',date:offset(-1),startTime:'09:00',place:'過去未確定',hours:4},
 {practiceId:'TODAY-C',date:day,startTime:'09:00',place:'当日確定',hours:4},
 {practiceId:'TODAY-O',date:day,startTime:'13:00',place:'当日未確定',hours:4},
 {practiceId:'FUTURE-O',date:offset(2),startTime:'09:00',place:'未来未確定',hours:4},
 {practiceId:'FUTURE-C',date:offset(3),startTime:'09:00',place:'未来確定',hours:4}
];
let confirmed=['PAST-C','TODAY-C','FUTURE-C'],readSchedules=0,readLedger=0,ensured=0,collections=0;
const functionBody=gas.slice(gas.indexOf('function overview_(ss,member,payload){'),
 gas.indexOf('/* A missing practice ledger',gas.indexOf('function overview_(')));
ok(functionBody.includes('selectEligible===true')&&
 functionBody.includes('ensureCollectionLedger_(ss,member,p,ledgerRows,all)'),
 'eligible date selection and the same cached schedule are used in GAS');
const overview=new Function('practices_','str_','entries_','today_','fail_',
 'ensureCollectionLedger_','collectionState_','paymentRows_','attendees_',
 'SMMatchCore','fee_','ledgerCanConfirm_',functionBody+'\nreturn overview_;')(
 ()=>{readSchedules++;return days.map(x=>({...x}));},
 x=>String(x??'').trim(),
 ()=>{readLedger++;return confirmed.map(id=>({
  rowId:'P-'+id,kind:'practice',practiceId:id,date:days.find(d=>d.practiceId===id).date,
  status:'confirmed',version:1,balance:0
 }));},
 ()=>day,(code,message)=>{throw Object.assign(Error(message),{smCode:code});},
 (_ss,_member,_p,rows,known)=>{ensured++;assert.equal(known.length,days.length);return rows;},
 (_ss,p,rows,known)=>{collections++;assert.equal(known.length,days.length);
  return {canCollect:!confirmed.includes(p.practiceId),reason:'閲覧'};},
 ()=>[],()=>[],{numbered:rows=>rows},()=>800,()=>false);
const member={memberId:'M-FAKE',role:'admin',name:'架空'};
const run=(payload)=>overview({},member,payload).data;
let data=run({selectEligible:true});
ok(data.practice.practiceId==='TODAY-C'&&data.practices.length===6,
 'one server response selects the closest current day including finalized today');
ok(readSchedules===1&&readLedger===1&&ensured===1&&collections===1,
 'one overview uses one schedule read, one ledger read, one initial ledger eligibility check');
data=run({selectEligible:true,practiceId:'PAST-O'});
ok(data.practice.practiceId==='PAST-O','manual selected past unconfirmed day is preserved');
data=run({selectEligible:true,practiceId:'PAST-C'});
ok(data.practice.practiceId==='TODAY-C','historical confirmed day is replaced with nearest eligible');
data=run({selectEligible:true,practiceId:'FUTURE-C'});
ok(data.practice.practiceId==='TODAY-C','future confirmed date is not chosen by picker');
data=run({selectEligible:true,practiceId:'TODAY-O'});
ok(data.practice.practiceId==='TODAY-O','manual selection of a different same-day open session is preserved');
confirmed=['PAST-C','TODAY-C','TODAY-O','FUTURE-C','FUTURE-O'];
data=run({selectEligible:true,practiceId:''});
ok(data.practice===null&&data.practices.length===6&&data.confirmedPracticeIds.length===5,
 'when only old unconfirmed days exist, initial view is empty without writing a ledger');
ok(ensured===5,'no ledger auto-initialization when no upcoming eligible dates');
data=run({});
ok(data.practice.practiceId==='FUTURE-C',
 'legacy backend callers that did not opt in still get the former default');
const a=ui.indexOf('async function reload(refreshDates){'),b=ui.indexOf('function renderHome(){',a);
ok(a>=0&&b>a,'real collection reload function found');
const reloadSource=ui.slice(a,b),S={practiceId:'',pending:new Set(),loading:false,
 reloadPromise:null,updateEpoch:0,confirmedPracticeKey:'',selectableDayKey:'',
 paymentNeedsRefresh:false};
const selected={items:[],value:'',replaceChildren(...items){this.items=items;}};
let calls=0,rendered=0;
confirmed=['PAST-C','TODAY-C','FUTURE-C'];
const api=async (url,payload)=>{
 calls++;assert.equal(url,'/api/overview');assert.equal(payload.selectEligible,true);
 return overview({},member,payload).data;
};
const reload=new Function('S','$','call','window','Option','renderHome',
 'syncPaymentControls','today',reloadSource+'return reload;')(
 S,id=>{assert.equal(id,'date');return selected;},api,{SMDate:D},
 function Option(text,value){this.text=text;this.value=value;},
 ()=>{rendered++;},()=>{},()=>day);
(async()=>{
 await reload(true);
 ok(calls===1&&S.practiceId==='TODAY-C'&&rendered===1,
  'initial collection screen renders after ONE authenticated overview call, no second request');
 S.practiceId='PAST-O';await reload(true);
 ok(calls===2&&S.practiceId==='PAST-O',
  'manual historical date keeps exactly one overview read');
 S.practiceId='PAST-C';await reload(true);
 ok(calls===3&&S.practiceId==='TODAY-C',
  'stale confirmed date is recovered by the server in the same overview request');
 const start=ui.indexOf('async function call(path,payload={}){'),stop=ui.indexOf('// Collection checkboxes are independent',start);
 ok(start>=0&&stop>start,'real authenticated fetch wrapper found');
 const fakeState={token:'FAKE-TOKEN',updateEpoch:0};
 let abortTime=0,mutationSignal=null;
 const mockedFetch=async (_url,opts)=>{
  if(_url.endsWith('/api/session')){
   return new Promise((_res,rej)=>opts.signal.addEventListener('abort',
    ()=>rej(new Error('AbortError')),{once:true}));
  }
  mutationSignal=opts.signal;
  return {ok:true,status:200,headers:{get:()=>''},json:async()=>({ok:true,data:{saved:true}})};
 };
 const bounded=new Function('S','CONFIG','PERF_MODE','performance','fetch',
  'AbortController','setTimeout','clearTimeout','console',
  ui.slice(start,stop)+'return call;')(
  fakeState,{apiBaseUrl:'https://worker.example'},false,{now:()=>0},mockedFetch,
  AbortController,(callback,ms)=>{abortTime=ms;Promise.resolve().then(callback);return 1;},
  ()=>{},console);
 await assert.rejects(bounded('/api/session'),e=>e.code==='REQUEST_TIMEOUT');n++;
 ok(abortTime===25000,'stalled startup reads fail closed after a bounded delay');
 const paid=await bounded('/api/payment',{operationId:'test-payment-operation'});
 ok(paid.saved&&mutationSignal===undefined,
  'financial writes are never automatically aborted or retried');
 ok(ui.includes('liff.init({liffId:CONFIG.liveLiffId')&&
  ui.includes('new Promise((_,reject)=>{liffTimer=setTimeout')&&
  ui.includes('clearTimeout(liffTimer)'),
  'LINE SDK initialization deadline always releases its timer');
 ok(ui.includes('LINE認証を確認しています')&&
  ui.includes('利用者の権限を確認しています')&&
  ui.includes('集金データを取得しています'),
  'startup overlay shows the currently running phase instead of one frozen generic spinner');
 ok(ui.includes("!document.querySelector('dialog[open]')")&&
  ui.includes('},8000);'),
  'background polling still uses 8 seconds but yields while management modal is open');
 ok(html.includes('live.js?v=1675-startup-perf'),
  'LINE WebView fetches revised startup module, not stale cached version');
 console.log('PASS '+n+'/'+n+' single-read startup, schedule snapshot, bounded client reads and finance safety');
})().catch(e=>{console.error(e);process.exitCode=1});
