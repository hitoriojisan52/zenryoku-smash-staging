#!/usr/bin/env node
'use strict';
/* v0.16.81: 15s request deadlines and semantic message contract.
 * No real network/LINE/Sheets calls. Virtual clock expires requests instantly. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const live=read('live.js'),html=read('live.html'),css=read('stage-ui.css'),
 worker=read('cloudflare-worker/worker.js'),match=read('match.js'),
 viewer=read('match-view.js'),guest=read('guest.js'),
 stage=read('stage-ui.js'),access=read('live-access-v2.js'),
 role=read('stage-role-preview.js');
let count=0;
function ok(cond,msg){assert.ok(cond,msg);count++;}
for(const [name,src] of [['live',live],['match',match],['viewer',viewer],
 ['guest',guest],['stage',stage],['access',access],['role',role]]){
 new Function(src.replace(/^export /gm,''));count++;
}
new Function(worker.replace('export async function','async function')
 .replace('export default {fetch:handleRequest};',''));count++;
const fstart=live.indexOf('async function call(path,payload={}){');
const fend=live.indexOf('\n// Collection checkboxes',fstart);
ok(fstart>=0&&fend>fstart,'live request function independently extracted');
const factory=new Function('S','CONFIG','PERF_MODE','performance',
 'fetch','setTimeout','clearTimeout','AbortController',
 live.slice(fstart,fend)+'\nreturn call;');
const state=()=>({token:'TEST-NOT-A-REAL-TOKEN',updateEpoch:0});
const config={apiBaseUrl:'https://example.invalid'};
const perf={now:()=>0};
async function deadlineCase(endpoint,payload={},readOnly=true,bodyPending=false){
 let delay=null,signals=[],requests=0;
 const fetcher=(url,opt)=>{
  requests++;signals.push(opt.signal);
  return bodyPending?Promise.resolve({headers:{get:()=>''},json:()=>new Promise(()=>{}),ok:true,status:200})
   :new Promise(()=>{});
 };
 const timer=(callback,ms)=>{delay=ms;queueMicrotask(callback);return 1;};
 const req=factory(state(),config,false,perf,fetcher,timer,()=>{},AbortController);
 let error=null;
 try{await req(endpoint,payload)}catch(e){error=e}
 ok(delay===15000,'15s deadline: '+endpoint);
 ok(requests===1,'no repeat request: '+endpoint);
 ok(error?.code===(readOnly?'REQUEST_TIMEOUT':'OPERATION_UNCONFIRMED'),
   'timeout error type: '+endpoint);
 ok(Boolean(signals[0])===readOnly,'only reads are aborted: '+endpoint);
 if(!readOnly)ok(error?.mutationUncertain===true,'write marked uncertain: '+endpoint);
}
(async()=>{
 await deadlineCase('/api/overview');
 await deadlineCase('/api/participant/list');
 await deadlineCase('/api/visitor/mine');
 await deadlineCase('/api/visitor/admin-list');
 await deadlineCase('/api/receipt/get',{rowId:'R-TEST'});
 await deadlineCase('/api/stage/self-role',{action:'status'});
 await deadlineCase('/api/payment',{operationId:'OP-TEST'},false);
 await deadlineCase('/api/receipt/upload',{operationId:'OP-TEST'},false);
 await deadlineCase('/api/stage/self-role',{action:'change',role:'member',expectedRole:'admin'},false);
 await deadlineCase('/api/overview',{},true,true);
 // Even a prompt server 504 on a POST cannot prove a failed write.
 const fast=factory(state(),config,false,perf,
  async()=>({ok:false,status:504,headers:{get:()=>''},
    json:async()=>({ok:false,code:'GAS_TIMEOUT',error:'処理結果を確認できません'})}),
  ()=>1,()=>{},AbortController);
 let error;try{await fast('/api/payment',{operationId:'OP-TEST'});}catch(e){error=e}
 ok(error?.mutationUncertain===true&&error.code==='OPERATION_UNCONFIRMED',
  'upstream 504 mutation is uncertain, never treated as definitely rolled back');
 ok(worker.includes('const deadline=AbortSignal.timeout(15000)')&&
  worker.includes('verifyLineToken(tokenMatch[1],env.LINE_LOGIN_CHANNEL_ID,deadline)')&&
  worker.includes('gasMetrics,deadline)')&&
  worker.includes('signal:deadline')&&
  worker.includes("knownError('GAS_TIMEOUT'")&&
  worker.includes("knownError('LINE_VERIFY_TIMEOUT'"),
  'one Worker 15-second deadline spans LINE, GAS POST, redirect GET and body');
 ok(match.includes('const boundedRead=')&&
  match.includes('if(boundedRead)controller?.abort()')&&
  match.includes('},15000);')&&match.includes("if(key!=='liff')return await fn()"),
  'match editing and LIFF login both use 15s, never abort writes');
 ok(viewer.includes('controller.abort()')&&viewer.includes('},15000)')&&
  viewer.includes('authTimer=setTimeout('),'read-only match and LIFF bounded');
 ok(guest.includes('controller.abort()')&&guest.includes('},15000)')&&
  guest.includes('signal:controller.signal'),'guest QR bounded at 15 seconds');
 ok(live.includes("function homeReadFailure_(error)")&&
  live.includes("['reimbursementBtn','receiptBtn','manageBtn']")&&
  live.includes("S.overviewLoadFailed=false;")&&
  live.includes("const homeError=$('homeReadError')")&&
  html.includes('id="homeReadError" class="stage-system-message stage-system-message--error"'),
  'home timeout banner red; three actions locked until valid reread');
 ok(live.includes("メンバー権限では運用管理機能を利用できません。")&&
  !live.includes('「権限切換」から管理者・当番担当へ戻せます。')&&
  live.includes('if(VISITOR_MODE){'),'member warning does not mention staging recovery; rich-menu visitor mode retained');
 ok(css.includes('content:"⚠️"')&&css.includes('content:"❌"')&&
  css.includes('.stage-system-message--info')&&
  css.includes('.stage-system-message--warning')&&
  css.includes('.stage-system-message--error'),'all three semantic message types/icons standardized');
 ok(stage.includes("e?.code==='OPERATION_UNCONFIRMED'")&&
  stage.includes("e?.code==='REQUEST_TIMEOUT'")&&
  access.includes('保存済みの可能性があります。「更新」で確認してください。'),
  'brief client error text distinguishes server conflict and uncertain writes');
 ok(!live.includes('読み込みが25秒以内')&&!live.includes('LINEの初期化が20秒')&&
  !stage.includes('25秒')&&!match.includes('20秒以内')&&
  !viewer.includes('25秒以内'),'obsolete long timeout messages retired');
 console.log('PASS '+count+'/'+count+' 15s network, recoverability, loading locks and semantic errors');
})().catch(e=>{console.error(e);process.exitCode=1});
