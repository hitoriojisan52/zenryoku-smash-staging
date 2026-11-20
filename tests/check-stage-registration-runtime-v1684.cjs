#!/usr/bin/env node
'use strict';
// Browserless functional tests for standalone registration: actual JS is executed
// against a minimal DOM + authenticated LINE/Worker response mock.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.resolve(__dirname,'../register.js'),'utf8');
const needed=[
 'registrationStatus','registrationForm','registrationRefresh','registrationSubmit',
 'registrationClose','registrationConfirm','registrationConfirmText','registrationCancel',
 'registrationConfirmSave','registrationError','registrationErrorText','registrationErrorClose',
 'registrationName','registrationKana'
];
function harness({status='not_requested',liffId='2026-REG-TEST',failRead=false}={}){
 const classes=new Map(),elements=new Map(),requests=[];
 for(const id of needed){
  const values=new Set(),events={};
  elements.set(id,{
   id,hidden:false,disabled:false,open:false,textContent:'',value:'',events,classes:values,
   classList:{
    toggle(name,active){if(active)values.add(name);else values.delete(name);},
    contains(name){return values.has(name);}
   },
   addEventListener(name,handler){events[name]=handler;},
   setAttribute(){},
   showModal(){this.open=true;},
   close(){this.open=false;},
   dispatch(name,payload){return events[name]?.(payload||{preventDefault(){}});}
  });
 }
 const e=id=>elements.get(id);
 e('registrationForm').hidden=true;
 const window={
  SMASH_CONFIG:{registrationLiffId:liffId,apiBaseUrl:'https://example.test'},
  liff:{init:async()=>{},isLoggedIn:()=>true,getIDToken:()=> 'verified-id-token',
   isInClient:()=>true,closeWindow(){}},
  location:{href:'https://example.test/register.html'},history:{length:1}
 };
 const mockFetch=async(url,options)=>{
  requests.push({url,options});
  if(failRead)throw TypeError('Failed to fetch');
  const state=url.endsWith('/api/member/apply')?'pending':status;
  return {ok:true,status:200,json:async()=>({ok:true,data:{status:state}})};
 };
 const context={
  window,document:{getElementById:e},fetch:mockFetch,
  setTimeout,clearTimeout,AbortController,Promise,Error,TypeError
 };
 vm.runInNewContext(source,context,{filename:'register.js'});
 return {e,requests,window};
}
async function next(){await new Promise(resolve=>setTimeout(resolve,12));}
(async()=>{
 let count=0;const ok=(condition,description)=>{assert.ok(condition,description);count++;};
 {
  const x=harness({status:'approved'});
  await next();
  ok(x.e('registrationStatus').textContent==='利用登録済みです。','approved state message');
  ok(x.e('registrationStatus').classes.has('stage-system-message--success'),'approved is green');
  ok(!x.e('registrationStatus').classes.has('stage-inline-read-loading'),'spinner stops after success');
  ok(x.e('registrationForm').hidden===true,'approved user cannot reapply');
  ok(x.requests.length===1&&x.requests[0].url.endsWith('/api/member/status'),'only registration status API is used');
  ok(x.requests[0].options.headers.Authorization==='Bearer verified-id-token','ID token sent to Worker');
 }
 {
  const x=harness();
  await next();
  ok(x.e('registrationStatus').classes.has('stage-system-message--success'),'ready to apply is green');
  ok(x.e('registrationForm').hidden===false,'unregistered member can apply');
  x.e('registrationName').value='全力太郎';
  x.e('registrationKana').value='ゼンリョクタロウ';
  x.e('registrationForm').dispatch('submit');
  ok(x.e('registrationConfirm').open,'application requires confirmation');
  await x.e('registrationConfirmSave').dispatch('click');
  ok(x.requests.filter(r=>r.url.endsWith('/api/member/apply')).length===1,'application is submitted once');
  ok(x.e('registrationStatus').classes.has('stage-system-message--success'),'pending receipt is green');
  ok(x.e('registrationForm').hidden,'pending application cannot be resubmitted');
 }
 {
  const x=harness({status:'rejected'});
  await next();
  ok(x.e('registrationStatus').classes.has('stage-system-message--warning'),'rejected application is yellow');
  ok(!x.e('registrationForm').hidden,'rejected applicant can apply again');
 }
 {
  const x=harness({failRead:true});
  await next();
  ok(x.e('registrationStatus').classes.has('stage-system-message--error'),'network failure is red');
  ok(x.e('registrationError').open,'network failure also opens error popup');
  ok(!x.e('registrationStatus').textContent.includes('Failed to fetch'),'raw English network error never shown');
  ok(!x.e('registrationRefresh').disabled,'manual Update remains enabled');
 }
 {
  const x=harness({liffId:''});
  await next();
  ok(x.e('registrationStatus').classes.has('stage-system-message--warning'),'unconfigured LIFF warns, does not fake auth');
  ok(x.requests.length===0,'no unauthenticated backend requests');
  ok(x.e('registrationRefresh').disabled,'unconfigured LIFF cannot send requests');
 }
 console.log('PASS '+count+'/'+count+' real standalone registration state, confirmation, auth and error behavior');
})().catch(e=>{console.error(e);process.exitCode=1});
