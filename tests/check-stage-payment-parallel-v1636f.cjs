#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ui=fs.readFileSync(path.join(root,'live.js'),'utf8'),html=fs.readFileSync(path.join(root,'live.html'),'utf8');
let checks=0;function ok(x,m){assert.ok(x,m);checks++}
const start=ui.indexOf('const MAX_PAYMENT_IN_FLIGHT=2;'),stop=ui.indexOf('async function guard(',start);
const pStart=ui.indexOf('async function setPayment('),pStop=ui.indexOf('\nfunction setupLongPress(',pStart);
ok(start>0&&stop>start&&pStart>stop&&pStop>pStart,'exact queue and payment handler located');
ok(html.includes('live.js?v=1636f'),'cache bust matches new payment UI');
ok(html.includes('.payment-checkbox-state'),'per-row progress status has style');
ok(!ui.includes("cb.addEventListener('change',()=>guard(async()=>setPayment"),'payment never calls full-screen lock');
ok(ui.includes("cb.addEventListener('change',()=>setPayment(p,cb,card).catch(showPaymentError_))"),'payment wired directly');
ok(ui.includes('S.pending.size===0&&!S.loading'),'auto polling suppressed during saves');
function makeHarness(){
 const controlNames=['date','refresh','reimbursementBtn','manageBtn','confirm','adjustment','expense'];
 const controls=Object.fromEntries(controlNames.map(id=>[id,{disabled:false}]));
 const participants=['P1','P2','P3'].map(participantId=>({participantId,collectionCompleted:false,paymentVersion:0,fee:600}));
 const S={actor:{role:'admin'},practiceId:'TEST-20261116',overview:{practice:{date:'2026-11-16'},ledger:{status:'open',version:1,income:0,balance:0},participants},pending:new Set(),paymentActive:0,paymentQueue:[],paymentNeedsRefresh:false};
 const requests=[],toasts=[];let uuidNumber=0,footerCalls=0;
 const payment=new Function('S','$','today','call','uuid','gateEdit','updateFooter','renderGasProfile_','toast','PERF_MODE',
   ui.slice(start,stop)+'\n'+ui.slice(pStart,pStop)+'\nreturn {setPayment,paymentCall_,drainPaymentQueue_,syncPaymentControls};')(
   S,id=>controls[id],()=> '2026-11-18',
   (route,payload)=>new Promise((resolve,reject)=>{requests.push({route,payload,resolve,reject});}),
   ()=> 'test-operation-'+(++uuidNumber),()=>{},()=>{footerCalls++},()=>{},
   x=>toasts.push(x),false);
 function row(p){
  const note={hidden:true,textContent:''},classes=new Set();
  const cb={checked:true,disabled:false},card={
   classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,flag)=>flag?classes.add(x):classes.delete(x)},
   querySelector:x=>x==='.payment-checkbox-state'?note:null
  };
  return {p,cb,card,note,classes};
 }
 return {S,participants,requests,toasts,controls,payment,row,footerCalls:()=>footerCalls};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const v=makeHarness(),[a,b,c]=v.participants.map(v.row);
 const pa=v.payment.setPayment(a.p,a.cb,a.card),pb=v.payment.setPayment(b.p,b.cb,b.card),pc=v.payment.setPayment(c.p,c.cb,c.card);
 await tick();
 ok(v.requests.length===2,'at most 2 parallel HTTP calls');
 ok(v.S.paymentQueue.length===1,'third payment queued');
 ok(v.S.pending.size===3,'three optimistic checkboxes tracked separately');
 ok([a,b,c].every(x=>x.cb.disabled),'only selected checkboxes disabled while waiting');
 ok(c.note.textContent==='順番待ち…','queued status shown');
 ok(v.controls.refresh.disabled&&v.controls.confirm.disabled,'conflicting financial actions disabled, not whole app');
 ok([a,b,c].every(x=>x.p.collectionCompleted),'all three optimistic states visible before server finishes');
 ok(v.requests.every(x=>x.route==='/api/payment'),'payment endpoint only');
 // The server has committed P1 (v2) and P2 (v3) but the second HTTP response arrives FIRST.
 v.requests[1].resolve({practiceId:'TEST-20261116',participantId:'P2',completed:true,version:1,ledgerVersion:3,income:1200,balance:1200});
 await pb;await tick();
 ok(v.S.overview.ledger.version===3&&v.S.overview.ledger.balance===1200,'newer response applied');
 ok(b.cb.disabled===false&&a.cb.disabled===true,'one checkbox reenabled without blocking other saves');
 ok(v.requests.length===3,'third request starts when one slot frees');
 v.requests[0].resolve({practiceId:'TEST-20261116',participantId:'P1',completed:true,version:1,ledgerVersion:2,income:600,balance:600});
 await pa;await tick();
 ok(v.S.overview.ledger.version===3&&v.S.overview.ledger.balance===1200,'late stale response cannot regress ledger');
 v.requests[2].resolve({practiceId:'TEST-20261116',participantId:'P3',completed:true,version:1,ledgerVersion:4,income:1800,balance:1800});
 await pc;await tick();
 ok(v.S.overview.ledger.balance===1800&&v.S.overview.ledger.version===4,'last server-confirmed balance correct');
 ok(v.S.pending.size===0&&v.S.paymentActive===0&&v.S.paymentQueue.length===0,'all queue and pending state cleaned');
 ok([a,b,c].every(x=>!x.cb.disabled&&x.p.paymentVersion===1&&x.note.hidden),'only saved rows reenabled after completion');
 ok(v.controls.refresh.disabled===false&&v.controls.confirm.disabled===false,'financial controls restored after all saves');
 ok(v.requests.length===3,'exactly one request per checkbox, no duplicate writes');
 const e=makeHarness(),[x,y,z]=e.participants.map(e.row);
 const px=e.payment.setPayment(x.p,x.cb,x.card),py=e.payment.setPayment(y.p,y.cb,y.card),pz=e.payment.setPayment(z.p,z.cb,z.card);
 const all=Promise.allSettled([px,py,pz]);await tick();ok(e.requests.length===2,'error scenario has 2 requests max');
 e.requests[0].reject(Object.assign(new Error('競合'),{status:409}));await tick();
 ok(e.S.paymentNeedsRefresh,'server conflict forces manual refresh');
 ok(e.requests.length===2&&e.S.paymentQueue.length===0,'third queued request canceled without submission');
 ok(!z.p.collectionCompleted&&!z.cb.checked,'unsent optimistic checkbox rolled back');
 e.requests[1].resolve({practiceId:'TEST-20261116',participantId:'P2',completed:true,version:1,ledgerVersion:2,income:600,balance:600});
 const settled=await all;await tick();
 ok(settled[0].status==='rejected'&&settled[1].status==='fulfilled'&&settled[2].status==='rejected','conflict and queued cancellation handled');
 ok(e.S.pending.size===0&&e.S.overview.ledger.balance===600,'in-flight successful save retained after another conflict');
 const u=makeHarness(),item=u.row(u.participants[0]);
 const one=u.payment.setPayment(item.p,item.cb,item.card);await tick();u.requests[0].reject(new Error('NetworkError'));
 const unknown=await Promise.allSettled([one]);await tick();
 ok(unknown[0].status==='rejected'&&item.p.collectionCompleted,'ambiguous network failure does not falsely undo possible server write');
 ok(u.S.paymentNeedsRefresh&&u.requests.length===1,'no automatic retry on uncertain financial POST');
 console.log('PASS '+checks+'/'+checks+' independent payment checkbox concurrency, order and fail-closed safeguards');
})().catch(e=>{console.error(e);process.exitCode=1});
