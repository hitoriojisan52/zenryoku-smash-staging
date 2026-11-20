'use strict';
// Isolated LIFF+DOM simulation. No real LINE account, network, GAS or Sheets access.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('registration.js','utf8');
const expectedId='2012602642-lKuGSb43';
const flush=()=>new Promise(r=>setTimeout(r,0));

function harness({state='not_requested',id=expectedId,loggedIn=true,failApply=false,perf=false}={}){
 const ids=['registrationStatus','registrationForm','registrationRefresh','registrationSubmit',
  'registrationConfirm','registrationConfirmSubmit','registrationError',
  'registrationErrorMessage','registrationErrorClose','registrationName',
  'registrationKana','registrationCancel','registrationClose','registrationPerf','registrationPerfText'];
 const nodes=Object.fromEntries(ids.map(key=>[key,{
  key,textContent:'',value:'',hidden:key==='registrationForm'||key==='registrationPerf',disabled:false,open:false,handlers:{},
  addEventListener(event,callback){this.handlers[event]=callback;},
  showModal(){this.open=true;},close(){this.open=false;}
 }]));
 const calls=[],inits=[],logins=[];
 const liff={
  init:async options=>{inits.push(options);},
  isLoggedIn:()=>loggedIn,
  isInClient:()=>true,
  getIDToken:()=> 'fake-test-token',
  login:options=>logins.push(options),
  closeWindow:()=>{}
 };
 const window={liff,SMASH_CONFIG:{registrationLiffId:id,
  liveLiffId:'2012602642-XBSkXduO',
  apiBaseUrl:'https://stage.example.invalid'}};
 const fetch=async(url,opt)=>{
  calls.push({url,opt});
  assert.equal(opt.method,'POST');
  assert.equal(opt.headers.Authorization,'Bearer fake-test-token');
  if(url.endsWith('/api/member/status'))
   return {ok:true,status:200,headers:{get:()=> 'line;dur=75,gas;dur=310,gas_post;dur=280,gas_content;dur=30'},json:async()=>({ok:true,data:{status:state}})};
  if(url.endsWith('/api/member/apply')){
   if(failApply)throw new TypeError('Failed to fetch');
   return {ok:true,status:200,headers:{get:()=> 'line;dur=75,gas;dur=310'},json:async()=>({ok:true,data:{status:'pending'}})};
  }
  throw Error('unexpected request: '+url);
 };
 const document={getElementById:key=>{
  assert.ok(nodes[key],'unexpected HTML control '+key);
  return nodes[key];
 }};
 const location={href:'https://stage.example.invalid/registration.html'+(perf?'?perf=1':''),search:perf?'?perf=1':''};
 let clock=1000;const performance={now:()=>{clock+=100;return clock;}};
 vm.runInNewContext(code,{
  window,liff,document,fetch,location,history:{length:1,back(){}},
  setTimeout,clearTimeout,AbortController,console,performance
 },{timeout:1500});
 return {nodes,calls,inits,logins};
}
(async()=>{
 const approved=harness({state:'approved'});
 await flush();
 assert.equal(approved.inits.length,1);
 assert.equal(approved.inits[0].liffId,expectedId);
 assert.equal(approved.nodes.registrationStatus.className,'stage-system-message stage-system-message--success');
 assert.equal(approved.nodes.registrationStatus.textContent,'利用登録済みです。');
 const timed=harness({state:'approved',perf:true});await flush();
 assert.equal(timed.nodes.registrationPerf.hidden,false,'performance report is shown only with perf=1');
 assert.match(timed.nodes.registrationPerfText.textContent,/状況確認 100ms/);
 assert.match(timed.nodes.registrationPerfText.textContent,/LINE認証 75ms/);
 assert.match(timed.nodes.registrationPerfText.textContent,/GAS POST 280ms/);
 assert.doesNotMatch(timed.nodes.registrationPerfText.textContent,/fake-test-token|架空/);
 assert.equal(approved.nodes.registrationPerf.hidden,true,'diagnostics stay hidden in normal mode');
 assert.equal(approved.nodes.registrationForm.hidden,true);
 assert.deepEqual(approved.calls.map(c=>new URL(c.url).pathname),['/api/member/status']);

 const fresh=harness();
 await flush();
 assert.equal(fresh.nodes.registrationForm.hidden,false);
 assert.equal(fresh.nodes.registrationRefresh.disabled,false);
 fresh.nodes.registrationName.value='架空太郎';
 fresh.nodes.registrationKana.value='カクウタロウ';
 fresh.nodes.registrationForm.handlers.submit({preventDefault(){}});
 assert.equal(fresh.nodes.registrationConfirm.open,true,'user confirmation before write');
 assert.equal(fresh.calls.length,1,'form submit alone is never a write');
 await fresh.nodes.registrationConfirmSubmit.handlers.click();
 await flush();
 assert.equal(fresh.calls.length,2);
 assert.equal(new URL(fresh.calls[1].url).pathname,'/api/member/apply');
 const body=JSON.parse(fresh.calls[1].opt.body);
 assert.equal(body.displayName,'架空太郎');
 assert.equal(body.nameKana,'カクウタロウ');
 assert.equal(fresh.nodes.registrationStatus.className,'stage-system-message stage-system-message--success');
 assert.equal(fresh.nodes.registrationForm.hidden,true);
 await fresh.nodes.registrationConfirmSubmit.handlers.click();
 assert.equal(fresh.calls.length,2,'duplicate apply attempt refused');

 for(const [state,displayForm] of [['pending',false],['rejected',true],['inactive',false]]){
  const h=harness({state});await flush();
  assert.equal(h.nodes.registrationStatus.className,'stage-system-message stage-system-message--warning',state);
  assert.equal(h.nodes.registrationForm.hidden,!displayForm,state+' form gating');
  assert.equal(h.calls.length,1,state+' reads only');
 }
 const rejectedWrite=harness({failApply:true});await flush();
 rejectedWrite.nodes.registrationName.value='架空花子';
 rejectedWrite.nodes.registrationKana.value='カクウハナコ';
 rejectedWrite.nodes.registrationForm.handlers.submit({preventDefault(){}});
 await rejectedWrite.nodes.registrationConfirmSubmit.handlers.click();
 await flush();
 assert.equal(rejectedWrite.calls.length,2,'failed write is never resent');
 assert.equal(rejectedWrite.nodes.registrationError.open,true);
 assert.equal(rejectedWrite.nodes.registrationStatus.className,'stage-system-message stage-system-message--error');
 assert.equal(rejectedWrite.nodes.registrationRefresh.disabled,false,'manual refresh remains available after failure');

 const login=harness({loggedIn:false});await flush();
 assert.equal(login.inits[0].liffId,expectedId);
 assert.equal(login.logins.length,1);
 assert.equal(login.calls.length,0,'unauthenticated users cannot call API');
 const missing=harness({id:''});await flush();
 assert.equal(missing.inits.length,0,'no fallback to management LIFF');
 assert.equal(missing.calls.length,0);
 assert.equal(missing.nodes.registrationError.open,true);
 console.log('PASS v1687 dynamic standalone LIFF: known ID, auth, read statuses, confirmation, single submit, failure, missing ID');
})().catch(error=>{console.error(error);process.exitCode=1;});
