#!/usr/bin/env node
'use strict';
/* Ledger Add was disabled at startup and never restored after role verification.
 * Simulate the ACTUAL boot function with authenticated roles to prevent the
 * same silent regression for any other management control. No network/Sheets.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const js=read('live.js'),html=read('live.html'),gas=read('gas-staging/コード.gs');
let n=0;
function ok(v,msg){assert.ok(v,msg);n++;}
const start=js.indexOf('async function boot(){'),end=js.indexOf('\nasync function reload(',start);
ok(start>=0&&end>start,'actual boot implementation remains locatable');
const body=js.slice(start,end);
const makeBoot=new Function('$','CONFIG','window','liff','S','call','gateEdit','reload',
 'setInterval','toast','VISITOR_MODE','document','VIS','validateVisitorPractices_',
 'PERF_MODE','performance','APP_REG_MODE',
 body+'\nreturn boot;');
const initiallyDisabled=['confirm','reimbursementBtn','manageBtn','refresh',
 'adjustment','expense','newLedgerRow'];
const enabledForDuty=['reimbursementBtn','manageBtn','refresh','adjustment','expense',
 'newLedgerRow'];
async function scenario(role){
 const controls=new Map();
 const $=id=>{
  if(!controls.has(id))controls.set(id,{id,disabled:false,hidden:false,textContent:'',
   replaceChildren(...children){this.children=children}});
  return controls.get(id);
 };
 const state={token:'',actor:null,overview:null},VIS={practices:[]};
 const calls=[],instances=[];
 let resolveSession;
 const pending=new Promise(resolve=>{resolveSession=resolve;});
 const env={
  config:{liveLiffId:'2012602642-XBSkXduO',apiBaseUrl:'https://stage.example.invalid'},
  window:{
   SMVisitor:{setup:()=>{calls.push('visitor.setup')},loadMine:async()=>{calls.push('visitor.mine')}},
   SMLiveAccess:{setup:()=>{calls.push('access.setup')}},
   SMRolePreview:{setup:()=>{calls.push('role.setup');$('stageRolePreviewOpen').disabled=false}},
   SMStageUX:{isBusy:()=>false}
  },
  liff:{init:async()=>{calls.push('liff.init')},isLoggedIn:()=>true,
   getIDToken:()=> 'unshared-test-only-token'},
  document:{
   body:{classList:{add:name=>calls.push('class '+name)}},
   createElement:()=>({className:'',textContent:'',setAttribute(){}}),
   querySelectorAll:()=>[...controls.values()]
  },
  gateEdit:()=>{calls.push('gateEdit');if(!['admin','duty'].includes(role))
   throw new Error('権限がありません')},
  reload:async()=>{calls.push('reload')},
  call:async endpoint=>{
   calls.push(endpoint);
   if(endpoint==='/api/session')return pending;
   if(endpoint==='/api/visitor/practices')return {practices:[]};
   throw new Error('unexpected endpoint '+endpoint);
  }
 };
 env.window.liff=env.liff; // real boot checks both window.liff and the LIFF instance
 const boot=makeBoot($,env.config,env.window,env.liff,state,env.call,
  env.gateEdit,env.reload,()=>{calls.push('interval')},()=>{},
  false,env.document,VIS,x=>x.practices,false,{now:()=>1000},false);
 const work=boot();
 for(const id of initiallyDisabled)ok($(id).disabled,
  'boot disables '+id+' until the session is verified: '+role);
 resolveSession({memberId:'M-TEST',name:'テスト会員',role});
 let error=null;
 try{await work;}catch(e){error=e;}
 return {controls,$,state,calls,error};
}
(async()=>{
 for(const role of ['admin','duty']){
  const r=await scenario(role);
  ok(!r.error,'verified '+role+' can complete boot');
  ok(r.calls.includes('gateEdit')&&r.calls.includes('reload'),
   'role gate and first overview load are required: '+role);
  for(const id of enabledForDuty)ok(!r.$(id).disabled,
   'role-verified '+role+' management button is enabled: '+id);
 }
 const member=await scenario('member');
 ok(!member.error,'member can open disabled management shell without finance reads');
 ok(!member.calls.includes('gateEdit')&&!member.calls.includes('reload'),
  'member never enters finance manager bootstrap');
 ok(member.$('newLedgerRow').disabled&&member.$('manageBtn').disabled&&
  member.$('refresh').disabled&&member.$('reimbursementBtn').disabled&&
  !member.$('stageRolePreviewOpen').disabled,
  'member management functions disabled except self-role recovery');
 const denied=await scenario('unknown');
 ok(denied.error?.message==='権限がありません','unknown role fails authorization');
 ok(denied.$('newLedgerRow').disabled,'unknown role cannot enable ledger Add');
 ok(html.includes('id="newLedgerRow" class="btn-green" type="button"')&&
    html.includes('live.js?v=1676-responsive-reads'),'original Add control and cache-busted script retained');
 ok(js.includes("$('newLedgerRow').addEventListener('click',()=>openEditor())"),
    'ledger Add still invokes original editor function');
 const editorStart=js.indexOf('function openEditor('),editorEnd=js.indexOf('function updateEditorKind(',editorStart);
 ok(editorStart>=0&&editorEnd>editorStart&&
    js.slice(editorStart,editorEnd).includes("dialog('ledgerEditDialog')"),
    'Add opens existing reimbursement / other income form');
 const submitStart=js.indexOf('async function submitEditor(');
 const submitEnd=js.indexOf('\nasync function submitReimbursement(',submitStart);
 ok(submitStart>=0&&js.slice(submitStart,submitEnd).includes('gateEdit()')&&
    js.slice(submitStart,submitEnd).includes("'/api/ledger/change'"),
    'saving still requires duty/admin and uses versioned ledger API');
 ok(gas.includes('requireDuty_(member)')&&
    gas.includes("mutateLedger_(ss,member,payload)"),'server-side finance authorization remains');
 console.log('PASS '+n+'/'+n+' stage ledger Add boot/permissions/editor regression');
})().catch(e=>{console.error(e);process.exitCode=1});
