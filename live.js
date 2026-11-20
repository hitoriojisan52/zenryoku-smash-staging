/**
 * Connected smoke-test UI based on v0.7. No demo fallback: do not confuse
 * fake data with live club finances. LINE ID token is kept only in memory.
 * Business permission and concurrency decisions are always server-side.
 */
'use strict';
const M=window.SmashModel,$=id=>document.getElementById(id),yen=n=>Number(n).toLocaleString('ja-JP')+'円';
const CONFIG=window.SMASH_CONFIG||{};
const S={token:'',actor:null,overview:null,practiceId:'',homeReadFailed:false,loading:false,reloadPromise:null,pending:new Set(),ledger:null,ledgerRow:null,mode:'add',modalTarget:null,timer:null,updateEpoch:0,paymentActive:0,paymentQueue:[],paymentNeedsRefresh:false,confirmedPracticeKey:'',selectableDayKey:'',receiptPartialWarning:''};
const VISITOR_MODE=(()=>{
 const q=new URLSearchParams(location.search||'');
 let state=q.get('liff.state')||'';
 if(state.includes('?'))state=state.slice(state.indexOf('?')+1);
 return q.get('visitor')==='1'||new URLSearchParams(state).get('visitor')==='1';
})();
const PERF_MODE=(()=>{
 const q=new URLSearchParams(location.search||'');let state=q.get('liff.state')||'';
 if(state.includes('?'))state=state.slice(state.indexOf('?')+1);
 return q.get('perf')==='1'||new URLSearchParams(state).get('perf')==='1';
})();
const today=()=>{const a=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return `${a.year}-${a.month}-${a.day}`;};
const uuid=()=>crypto.randomUUID();
const safeText=s=>String(s??'');
function toast(message){
 const e=$('toast');if(!e)return;
 let label=message;
 if(PERF_MODE&&/更新しました|保存しました/.test(message)&&S.lastPerf){
   const phase=name=>Number(new RegExp(name+';dur=([0-9]+)').exec(S.lastPerf.serverTiming)?.[1]||0);
   const seconds=ms=>(ms/1000).toFixed(1)+'秒';
   const post=phase('gas_post'),content=phase('gas_content');
    label+='（通信 '+seconds(S.lastPerf.totalMs)+' / LINE '+seconds(phase('line'))+
      ' / GAS '+seconds(phase('gas'))+
      (post||content?' / GAS POST '+seconds(post)+' / 応答GET '+seconds(content):'')+'）';
 }
 e.textContent=label;e.classList.add('show');
 clearTimeout(S.timer);S.timer=setTimeout(()=>e.classList.remove('show'),PERF_MODE?4200:2500);
}
function renderGasProfile_(timings){
 if(!PERF_MODE||!timings||typeof timings!=='object')return;
 const panel=$('perfBreakdown'),out=$('perfBreakdownText');if(!panel||!out)return;
 const ms=key=>Number.isSafeInteger(timings[key])&&timings[key]>=0?timings[key]+'ms':'—';
 const phases=[
  ['スプレッドシート取得','spreadsheetOpenMs'],['会員確認','memberAuthMs'],
  ['ロック待ち','lockWaitMs'],['操作履歴照合','auditReadMs'],
  ['日程読込','practiceReadMs'],['収支表読込','ledgerReadMs'],
  ['参加者読込','attendeeReadMs'],['集金記録読込','paymentReadMs'],
  ['整合性・計算','validationMs'],['集金記録保存','paymentWriteMs'],
  ['収支表保存','ledgerWriteMs'],['操作履歴保存','auditWriteMs'],
  ['GAS処理計','handlerMs']
 ];
 out.textContent=phases.map(([name,key])=>name+'：'+ms(key)).join('\n');
 panel.hidden=false;panel.open=true;
}
function dialog(id){const e=$(id);if(e&&!e.open)e.showModal();}
function close(id){if($(id)?.open)$(id).close();}
function gateEdit(){if(!S.actor||!['duty','admin'].includes(S.actor.role))throw new Error('当番チームの権限がありません');}
// Opt-in diagnostics (?perf=1). Durations and fixed API paths only:
 // never store LINE IDs, names, tokens, request bodies or response data.
 function profileApiRequest_(path,elapsed,timing,outcome){
  if(!PERF_MODE)return;
  const phases={line:'LINE',gas:'GAS',gas_post:'GAS POST',gas_content:'GAS応答'};
  const segments=String(timing||'').split(',').map(x=>x.trim());
  const metrics=[];
  for(const segment of segments){
   const match=/^(line|gas|gas_post|gas_content);dur=(\d+(?:\.\d+)?)$/.exec(segment);
   if(match)metrics.push(phases[match[1]]+' '+Math.round(Number(match[2]))+'ms');
  }
  S.apiPerfHistory=S.apiPerfHistory||[];
  const gas=path==='/api/overview'&&S.lastOverviewProfile;
  const gasText=gas?
   '／GAS内訳 開始'+gas.spreadsheetOpenMs+'ms・会員'+gas.memberAuthMs+
   'ms・ロック待ち'+gas.lockWaitMs+'ms・処理'+gas.overviewHandlerMs+
   'ms・合計'+gas.gasTotalMs+'ms':'';
  S.apiPerfHistory.push((outcome==='ok'?'✓':'!')+' '+path+' '+Math.round(elapsed)+'ms'+
   (metrics.length?'（'+metrics.join(' / ')+'）':'')+gasText+
   (outcome!=='ok'?' ['+outcome+']':''));
  if(S.apiPerfHistory.length>16)S.apiPerfHistory.shift();
  const panel=$('perfBreakdown'),out=$('stageApiPerfText');
  if(panel&&out){panel.hidden=false;out.textContent=S.apiPerfHistory.slice().reverse().join('\n');}
 }
 
const REQUEST_TIMEOUT_MS=15000;
const MUTATING_ENDPOINTS=new Set(['/api/payment','/api/category','/api/adjustment','/api/expense','/api/ledger/change','/api/schedule/change','/api/visitor/register','/api/visitor/request','/api/visitor/decide','/api/visitor/modify','/api/participant/change','/api/attendance/submit','/api/stage/self-role','/api/receipt/upload','/api/reimbursement/change','/api/cash/save','/api/member/apply','/api/member/manage/decide','/api/member/manage/role','/api/member/manage/edit','/api/member/manage/withdraw','/api/match/share','/api/match/share/revoke']);
function requestTimeoutError_(isWrite){
 const e=new Error(isWrite?'通信がタイムアウトしました（15秒）。保存結果を更新で確認してください。':'通信がタイムアウトしました（15秒）。再度お試しください。');
 e.code=isWrite?'OPERATION_UNCONFIRMED':'REQUEST_TIMEOUT';return e;
}
async function call(path,payload={}){
 if(!S.token||!CONFIG.apiBaseUrl)throw new Error('LINE認証またはAPI設定がありません');
 const url=CONFIG.apiBaseUrl.replace(/\/$/,'')+path,isWrite=MUTATING_ENDPOINTS.has(path);
 if(isWrite)S.updateEpoch++;
 const startedAt=performance.now();
 if(PERF_MODE&&path==='/api/overview')S.lastOverviewProfile=null;
 let diagnosticTiming='',diagnosticOutcome='ok';
 // Reads can abort. Writes must never abort/retry: GAS may commit.
 const controller=!isWrite&&typeof AbortController!=='undefined'?new AbortController():null;
 let timer,expired=false;
 const timeout=new Promise((_,reject)=>{
  timer=setTimeout(()=>{expired=true;if(controller)controller.abort();reject(requestTimeoutError_(isWrite));},REQUEST_TIMEOUT_MS);
 });
 const work=(async()=>{
  const response=await fetch(url,{method:'POST',
   headers:{'Content-Type':'application/json','Authorization':'Bearer '+S.token},
   body:JSON.stringify(PERF_MODE&&path==='/api/overview'?
    {...payload,profileTimings:true}:payload),cache:'no-store',
   ...(controller?{signal:controller.signal}:{})});
  if(PERF_MODE){
   diagnosticTiming=response.headers.get('Server-Timing')||'';
   S.lastPerf={path,totalMs:Math.round(performance.now()-startedAt),serverTiming:response.headers.get('Server-Timing')||''};
   console.info('[STAGE PERF]',S.lastPerf.path,S.lastPerf.totalMs+'ms',S.lastPerf.serverTiming);
  }
  let value;try{value=await response.json();}catch{throw new Error('サーバーの応答を確認できませんでした。');}
  if(PERF_MODE&&path==='/api/overview')S.lastOverviewProfile=
   value?.data?.profileTimings||null;
  if(!response.ok||!value.ok){const err=new Error(value.error||'処理に失敗しました。');err.status=response.status;err.code=String(value.code||'');throw err;}
  return value.data;
 })();
 try{return await Promise.race([work,timeout]);}
 catch(e){
  diagnosticOutcome=expired||e?.name==='AbortError'?'timeout':'error';
  if(expired||e?.name==='AbortError')throw requestTimeoutError_(isWrite);
  throw e;
 }
 finally{
  clearTimeout(timer);
  if(PERF_MODE)profileApiRequest_(path,performance.now()-startedAt,diagnosticTiming,diagnosticOutcome);
 }
}
// Collection checkboxes are independent. Only up to two requests leave this page
// concurrently. Apps Script's lock remains the source of truth for the ledger.
const MAX_PAYMENT_IN_FLIGHT=2;
function syncPaymentControls(){
 const pending=S.pending.size>0,ledger=S.overview?.ledger,access=S.overview?.collectionAccess;
 const locked=!ledger||ledger.status==='confirmed'||access?.canCollect===false;
 const savingAmount=S.pending.has('amount');
 for(const id of ['date','refresh','reimbursementBtn','manageBtn','receiptBtn']){
   const el=$(id);if(el)el.disabled=pending||(S.homeReadFailed&&id!=='refresh')||(id==='date'&&!Array.from(el.options||[]).some(o=>!!o.value));
 }
 if($('confirm'))$('confirm').disabled=pending||locked||
    S.overview?.practice?.date>today()||ledger?.canConfirm!==true;
 for(const id of ['adjustment','expense']){
   const el=$(id);if(el)el.disabled=pending||locked||S.paymentNeedsRefresh;
 }
 // A failed payment requires a manual reconciliation. Disable every unchecked
 // row as well as the in-flight rows until the latest overview is fetched.
 const list=$('list');
 if(list&&typeof list.querySelectorAll==='function'){
   for(const checkbox of list.querySelectorAll('.participant-card input[type="checkbox"]')){
     const id=checkbox.closest('.participant-card')?.dataset?.id;
     checkbox.disabled=locked||savingAmount||S.paymentNeedsRefresh||S.pending.has(id);
   }
 }
}
function drainPaymentQueue_(){
 if(S.paymentNeedsRefresh){
   while(S.paymentQueue.length){
     const item=S.paymentQueue.shift(),error=new Error('未送信の集金変更は中断しました。更新で状態を確認してください。');
     error.notSent=true;item.reject(error);
   }
   return;
 }
 while(S.paymentActive<MAX_PAYMENT_IN_FLIGHT&&S.paymentQueue.length){
   const job=S.paymentQueue.shift();
   S.paymentActive++;
   Promise.resolve().then(()=>{job.onStart();return job.action();})
     .then(job.resolve,error=>{
       // Set the fault BEFORE freeing the slot; otherwise a queued third write
       // could start between an HTTP error and the caller's catch handler.
       S.paymentNeedsRefresh=true;
       drainPaymentQueue_(); // cancel unsent requests before another slot is freed
       job.reject(error);
     }).finally(()=>{S.paymentActive--;drainPaymentQueue_();});
 }
}
function paymentCall_(action,onStart){
 return new Promise((resolve,reject)=>{
   S.paymentQueue.push({action,onStart,resolve,reject});
   drainPaymentQueue_();
 });
}
async function showPaymentError_(error){
 if(error?.notSent)return;
 await window.SMStageUX.showError(error);
}
async function guard(action,label='処理中です…'){
 if(S.pending.size){toast('集金処理中です。完了後に操作してください。');return;}
 let error=null,result;
 try{result=await window.SMStageUX.run(label,action);}
 catch(e){error=e;}
 // The ledger may have been saved even when the subsequent receipt upload fails.
 // A persistent dialog appears only AFTER the busy overlay is closed.
 const warning=S.receiptPartialWarning;S.receiptPartialWarning='';
 if(warning){
  await window.SMStageUX.showError(new Error(warning+
    (error?' 更新も失敗しました。収支表で登録状態を確認してください。':'')));
  if(error?.status===409)await reload(false).catch(()=>{});
  return;
 }
 if(error){
  await window.SMStageUX.showError(error);
  if(error.status===409)await reload(false).catch(()=>{});
 }
 return result;
}
// v0.16.76: allow read-only management screens to open immediately.
// Never hide/disable their Close buttons; stale results from closed screens
// cannot overwrite a newly opened screen. Mutations still use guard().
const screenReadEpoch_=new Map(),screenReadActive_=new Map();
let screenReadsInFlight_=0,homePollPauseUntil_=0;
const screenReadRefreshIds_={
 scheduleDialog:'scheduleReload',visitorDialog:'visitorMineRefresh',
 visitorAdminDialog:'visitorAdminRefresh',attendanceDialog:'attendanceReload',
 participantDialog:'participantReload'
};
// Update the existing blue loading message in-place, without another banner.
function updateReadScreenStatus_(id,label,isCurrent=()=>true){
 if(!isCurrent())return;
 const screen=$(id);
 if(!screen?.open)return;
 const status=screenReadStatus_(id);
 if(status.classList.contains('stage-inline-read-loading'))status.textContent=label;
}
function screenReadStatus_(id){
 const screen=$(id);
 let status=screen.querySelector('.stage-inline-read-status');
 if(!status){
  status=document.createElement('p');
  status.className='stage-inline-read-status stage-system-message stage-system-message--info';
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const toolbar=screen.querySelector('.stage-dialog-toolbar')||screen.querySelector('.participant-heading');
  if(toolbar)toolbar.insertAdjacentElement('afterend',status);
  else screen.querySelector('h2')?.insertAdjacentElement('afterend',status);
 }
 return status;
}
function readScreen_(id,label,loader,onComplete,force=false){
 const screen=$(id),prev=screenReadActive_.get(id);
 if(prev&&screen.open&&!force)return prev.promise; // intentional refresh supersedes stale read
 const version=(screenReadEpoch_.get(id)||0)+1;
 screenReadEpoch_.set(id,version);
 if(!screen.dataset.readCloseBound){
  screen.dataset.readCloseBound='1';
  screen.addEventListener('close',()=>{
   screenReadEpoch_.set(id,(screenReadEpoch_.get(id)||0)+1);
   screenReadActive_.delete(id);
   homePollPauseUntil_=performance.now()+15000;
  });
 }
 if(!screen.open)screen.showModal();
 const refreshId=screenReadRefreshIds_[id],refreshButton=refreshId?$(refreshId):null;
 if(refreshButton)refreshButton.disabled=true;
 const state=screenReadStatus_(id);
 state.hidden=false;
 state.classList.remove('stage-system-message--warning');
 state.classList.remove('stage-system-message--error');
 state.classList.add('stage-system-message--info');
 state.classList.add('stage-inline-read-loading');
 state.textContent=label;
 const current=()=>screen.open&&screenReadEpoch_.get(id)===version;
 screenReadsInFlight_++;
 const promise=Promise.resolve().then(()=>loader(current))
  .then(()=>{
   if(!current())return;
   state.classList.remove('stage-inline-read-loading');
   state.textContent='';state.hidden=true;
   if(onComplete)onComplete();
  }).catch(error=>{
   if(!current())return; // closed while reading; no modal/no stale UI write
   state.hidden=false;state.classList.remove('stage-inline-read-loading');
   state.classList.remove('stage-system-message--info');
   state.classList.add('stage-system-message--error');
   state.textContent=window.SMStageUX?.errorDetails?.(error)?.message||'読み込みに失敗しました。再度お試しください。';
   void window.SMStageUX?.showError?.(error);
  }).finally(()=>{
   screenReadsInFlight_=Math.max(0,screenReadsInFlight_-1);
   if(current()&&refreshButton)refreshButton.disabled=false;
   if(screenReadActive_.get(id)?.version===version)
    screenReadActive_.delete(id);
  });
 screenReadActive_.set(id,{version,promise});
 return promise;
}
window.SMStageRead={open:readScreen_};
// This route is also available to a not-yet-approved LINE tester. Do not
// require /api/session before member.status/member.apply: that would block
// the people the registration form is intended for.
const REGISTRATION_MODE=(()=>{
 const search=typeof location==='undefined'?'':location.search||'';
 const q=new URLSearchParams(search);
 let state=q.get('liff.state')||'';
 if(state.includes('?'))state=state.slice(state.indexOf('?')+1);
 return q.get('register')==='1'||new URLSearchParams(state).get('register')==='1';
})();
let registrationPending=false;
async function refreshRegistration_(){
 if(registrationPending)return;
 registrationPending=true;
 const status=$('stageRegistrationStatus'),form=$('stageRegistrationForm'),refresh=$('stageRegistrationRefresh');
 refresh.disabled=true;form.hidden=true;status.className='stage-system-message stage-system-message--info stage-inline-read-loading';status.textContent='利用申請状況を確認しています…';
 try{
  const data=await call('/api/member/status');
  const state=String(data?.status||'not_requested');
  if(state==='not_requested'||state==='rejected'){
   status.className='stage-system-message stage-system-message--'+(state==='rejected'?'warning':'success');
   status.textContent=state==='rejected'?'前回の申請は却下されました。再申請できます。':'利用申請はまだありません。';
   form.hidden=false;
  }else{
   status.className='stage-system-message stage-system-message--'+(state==='approved'?'success':'warning');
   status.textContent=({
    pending:'利用申請は承認待ちです。',
    approved:'利用登録済みです。',
    inactive:'利用停止中です。管理者に確認してください。',
    withdrawal_processing:'退会処理中です。'
   })[state]||'申請状況を確認してください。';
  }
 }catch(e){
  status.className='stage-system-message stage-system-message--error';status.textContent='申請状況を取得できませんでした。更新してください。';
  await window.SMStageUX?.showError?.(e);
 }finally{registrationPending=false;refresh.disabled=false;}
}
async function openRegistration_(){
 if($('manageDialog')?.open)close('manageDialog');
 dialog('stageRegistrationDialog');
 await refreshRegistration_();
}
function setupRegistration_(){
 $('stageRegistrationOpen').addEventListener('click',()=>{location.href='registration.html';});
 $('stageRegistrationRefresh').addEventListener('click',refreshRegistration_);
 $('stageRegistrationClose').addEventListener('click',()=>close('stageRegistrationDialog'));
 $('stageRegistrationForm').addEventListener('submit',async e=>{
  e.preventDefault();if(registrationPending)return;
  const displayName=$('stageRegistrationName').value.normalize('NFKC').replace(/[\\s\\u00a0\\u3000]+/g,'');
  const nameKana=$('stageRegistrationKana').value.normalize('NFKC').replace(/[\\s\\u00a0\\u3000]+/g,'');
  if(!displayName||displayName.length>30||!/^[ァ-ヶー・]{1,60}$/.test(nameKana)){
   await window.SMStageUX.showError(new Error('氏名と全角カタカナの氏名カナを確認してください。'));return;
  }
  if(!confirm('利用申請を送信しますか？'))return;
  registrationPending=true;$('stageRegistrationSubmit').disabled=true;
  try{
   const result=await call('/api/member/apply',{displayName,nameKana});
   $('stageRegistrationStatus').className='stage-system-message stage-system-message--success';
   $('stageRegistrationStatus').textContent=result?.status==='approved'?'利用登録済みです。':'利用申請を受け付けました。管理者の承認をお待ちください。';
   $('stageRegistrationForm').hidden=true;
  }catch(error){
   $('stageRegistrationStatus').className='stage-system-message stage-system-message--error';
   $('stageRegistrationStatus').textContent='申請結果を確認できませんでした。更新して状況を確認してください。';
   await window.SMStageUX.showError(error);
  }finally{registrationPending=false;$('stageRegistrationSubmit').disabled=false;}
 });
}
async function boot(){
 for(const id of ['confirm','reimbursementBtn','manageBtn','refresh','adjustment','expense','newLedgerRow'])$(id).disabled=true;
 try{
  if(!CONFIG.liveLiffId||CONFIG.liveLiffId.includes('REPLACE_')||!CONFIG.apiBaseUrl||CONFIG.apiBaseUrl.includes('REPLACE_'))throw new Error('runtime-config.js の設定が必要です');
  if(!window.liff)throw new Error('LINE SDKを読み込めませんでした');
  const startupStart=performance.now(),authStart=performance.now();
  $('stageBusyLabel').textContent='LINE認証を確認しています…';
  let liffTimer;
  try{
   await Promise.race([
    liff.init({liffId:CONFIG.liveLiffId,withLoginOnExternalBrowser:true}),
    new Promise((_,reject)=>{liffTimer=setTimeout(()=>reject(
     Object.assign(new Error('LINE認証がタイムアウトしました（15秒）。開き直してください。'),{code:'REQUEST_TIMEOUT'})
    ),REQUEST_TIMEOUT_MS);})
   ]);
  }finally{if(liffTimer!==undefined)clearTimeout(liffTimer);}
  const authMs=Math.round(performance.now()-authStart);
  if(!liff.isLoggedIn()){liff.login({redirectUri:location.href});return;}
  S.token=liff.getIDToken();if(!S.token)throw new Error('LINE IDトークンを取得できません');
  $('stageBusyLabel').textContent='利用者の権限を確認しています…';
  const sessionStart=performance.now();
  if(typeof setupRegistration_==='function')setupRegistration_();
  if(typeof REGISTRATION_MODE!=='undefined'&&REGISTRATION_MODE){
   // The tester has no member record yet. Keep the management controls inert.
   document.body.classList.add('stage-member-locked');
   for(const el of document.querySelectorAll('main button,main select,main input'))el.disabled=true;
   await openRegistration_();
   return;
  }
  S.actor=await call('/api/session');
  // Staging self-role changes are tied to authenticated LINE identity.
  if(!VISITOR_MODE)window.SMRolePreview?.setup({role:S.actor.role,api:call});
  const sessionMs=Math.round(performance.now()-sessionStart);
  if($('manageAdminSection'))$('manageAdminSection').hidden=S.actor.role!=='admin';
  if($('manageSchedules')){
   $('manageSchedules').hidden=S.actor.role!=='admin';
   $('manageSchedules').disabled=S.actor.role!=='admin';
  }
  window.SMVisitor?.setup({api:call,actor:S.actor,
   onDecision:async()=>{if(S.actor?.role!=='member'&&S.overview)await reload(true);}});
  // The LINE attendance/visitor entry remains available at ?visitor=1.
  // The management home, in contrast, never grants member operations.
  if(VISITOR_MODE){
   document.body.classList.add('visitor-member');
   $('visitorMemberHome').hidden=false;
   const list=await call('/api/visitor/practices');
   VIS.practices=validateVisitorPractices_(list);
   await window.SMVisitor.loadMine();
   toast('接続しました');
   return;
  }
  if(S.actor.role==='member'){
   // Management-only guard. Keep visible controls inert, except the
   // verification-only self-role recovery button in the header.
   document.body.classList.add('stage-member-locked');
   const notice=document.createElement('p');
   notice.className='stage-system-message stage-system-message--warning';
   notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
   notice.textContent='メンバー権限では運用管理を利用できません。';
   $('list').replaceChildren(notice);
   for(const control of document.querySelectorAll('main button,main select,main input,main textarea')){
    if(control.id!=='stageRolePreviewOpen')control.disabled=true;
   }
   window.SMLiveAccess?.setup({api:call,actor:S.actor});
   return;
  }
  gateEdit();
  window.SMLiveAccess?.setup({api:call,actor:S.actor});
  // All management actions disabled at startup are restored only after
  // verified duty/admin login. Keep the ledger Add button in this same list.
  for(const id of ['reimbursementBtn','manageBtn','adjustment','expense','newLedgerRow'])$(id).disabled=false;
  $('stageBusyLabel').textContent='集金データを取得しています…';
  const overviewStart=performance.now();
  await reload(true);
  $('refresh').disabled=false;
  const overviewMs=Math.round(performance.now()-overviewStart);
  if(PERF_MODE){
   const totalMs=Math.round(performance.now()-startupStart);
   console.info('[STAGE STARTUP]',{authMs,sessionMs,overviewMs,totalMs});
   toast('接続しました（LINE '+(authMs/1000).toFixed(1)+'秒 / 会員確認 '+
    (sessionMs/1000).toFixed(1)+'秒 / 集金読込 '+
    (overviewMs/1000).toFixed(1)+'秒 / 合計 '+
    (totalMs/1000).toFixed(1)+'秒）');
  }
  setInterval(()=>{if(!document.hidden&&!document.querySelector('dialog[open]')&&screenReadsInFlight_===0&&performance.now()>=homePollPauseUntil_&&!S.paymentNeedsRefresh&&!S.homeReadFailed&&S.pending.size===0&&!S.loading&&!window.SMStageUX.isBusy())reload(false).catch(()=>{});},8000);
  if(!PERF_MODE)toast('接続しました');
 }catch(e){
  if(S.actor&&['duty','admin'].includes(S.actor.role)&&S.homeReadFailed){
   // The first overview request failed. Keep manual refresh available rather
   // than trapping the user in a disabled shell or a blocking error modal.
   $('refresh').disabled=false;
   throw e;
  }
  if(S.homeReadFailed&&typeof showHomeReadError_==='function')showHomeReadError_(e);
  throw e;
 }
}
function showHomeReadError_(e){
 const list=$('list');if(!list)return;
 const error=document.createElement('p');error.className='stage-system-message stage-system-message--error';
 error.setAttribute('role','alert');
 error.textContent=e?.code==='REQUEST_TIMEOUT'?'通信がタイムアウトしました（15秒）。更新してください。':'集金データを読み込めませんでした。更新してください。';
 list.replaceChildren(error);
 for(const id of ['reimbursementBtn','receiptBtn','manageBtn','confirm','adjustment','expense','cashCounter','date']){
  const control=$(id);if(control)control.disabled=true;
 }
 if($('refresh')&&S.pending.size===0)$('refresh').disabled=false;
}
async function reload(refreshDates){
 if(S.pending.size)return;
 if(S.loading){
   // A manual refresh is never dropped just because the 8-second silent
   // automatic poll already owns the request slot. Wait for that read and
   // then force a fresh date/roster fetch, leaving the busy dialog visible.
   if(!refreshDates)return;
   const inFlight=S.reloadPromise;
   if(inFlight){try{await inFlight;}catch(_){/* manual retry fetches latest */}}
   if(S.pending.size)return;
   return reload(true);
 }
 S.loading=true;
 const task=(async()=>{
   const epoch=S.updateEpoch,selected=S.practiceId;
   let d,notFound=false;
   try{d=await call('/api/overview',{practiceId:S.practiceId,selectEligible:true});}
   catch(e){
     // A second device may have deleted the previously selected schedule.
     if(e.status!==404||!selected)throw e;
     d=await call('/api/overview',{selectEligible:true});notFound=true;
   }
   if(epoch!==S.updateEpoch||S.pending.size||(!notFound&&selected!==S.practiceId))return;
   // All unconfirmed (including formerly confirmed/unlocked and past)
   // practice dates are selectable. Initial choice still uses the
   // earliest available practice dated today or later.
   const confirmedIds=new Set(d.confirmedPracticeIds||[]);
   const confirmedKey=[...confirmedIds].sort().join('|');
   const statusChanged=confirmedKey!==S.confirmedPracticeKey;
   const selectableDayKey=today();
   const dayChanged=selectableDayKey!==S.selectableDayKey;
   const eligible=(d.practices||[])
    .filter(p=>p?.practiceId&&(!confirmedIds.has(p.practiceId)||p.date===selectableDayKey))
    .sort((a,b)=>a.date.localeCompare(b.date)||
     String(a.startTime||'').localeCompare(String(b.startTime||''))||
     String(a.practiceId).localeCompare(String(b.practiceId)));
   const upcoming=eligible.filter(p=>p.date>=selectableDayKey);
   const target=eligible.some(p=>p.practiceId===selected)?selected:
    (upcoming[0]?.practiceId||'');
   // Legacy overview defaults to the latest date, which can be past.
   if(target&&d.practice?.practiceId!==target){
    d=await call('/api/overview',{practiceId:target});
    if(epoch!==S.updateEpoch||S.pending.size||selected!==S.practiceId)return;
   }
   if(refreshDates||statusChanged||dayChanged||!S.practiceId||notFound||target!==selected){
    const options=eligible.map(p=>new Option(window.SMDate.practiceLabel(p),p.practiceId));
    if(!options.length)options.unshift(new Option('未確定の練習日がありません',''));
    else if(!upcoming.length)options.unshift(new Option('日程を選択してください',''));
    $('date').replaceChildren(...options);
   }
   if(!target)d={...d,practice:null,participants:[],ledger:null,
    collectionAccess:{canCollect:false,reason:'本日以降の未確定練習日がありません'}};
   S.practiceId=target;$('date').value=target;S.overview=d;
   S.confirmedPracticeKey=confirmedKey;
   S.selectableDayKey=selectableDayKey;
   S.paymentNeedsRefresh=false;S.homeReadFailed=false;
   window.SMStageUX?.clearInlineError?.();
   renderHome();syncPaymentControls();
 })();
 S.reloadPromise=task;
 try{return await task;}
 catch(e){
  S.homeReadFailed=true;
  if(typeof showHomeReadError_==='function')showHomeReadError_(e);
  syncPaymentControls();
  if($('refresh')&&S.pending.size===0)$('refresh').disabled=false;
  if(window.SMStageUX?.isBusy?.()===false)void window.SMStageUX.showError(e);
  throw e;
 }
 finally{
   if(S.reloadPromise===task)S.reloadPromise=null;
   S.loading=false;
 }
}
function renderHome(){const v=S.overview;if(!v)return;const {practice,ledger,participants}=v;
 const receiptView=$('homeReceiptView');if(receiptView)receiptView.hidden=!ledger?.receiptFileId;
 const receiptUpload=$('receiptBtn');if(receiptUpload)receiptUpload.disabled=S.homeReadFailed||!ledger||ledger.status==='confirmed';
 if(!practice){
  $('place').textContent='開催日なし';$('hours').textContent='時間区分：—';
  $('count').textContent='参加者：0名';$('completedCount').textContent='集金完了：0名';
  $('adjustment').value=0;$('expense').value=0;
  $('confirm').disabled=true;$('adjustment').disabled=true;$('expense').disabled=true;
  $('cashCounter').disabled=true;$('list').replaceChildren();
  $('collectionLockReason').textContent='本日以降の開催日がありません';
  $('collectionLockReason').hidden=false;updateFooter();return;
 }
 $('cashCounter').disabled=false;
 $('place').textContent='場所：'+practice.place;$('hours').textContent='時間区分：'+practice.hours+'h';
 $('count').textContent='参加者：'+v.attendingCount+'名';$('completedCount').textContent='集金完了：'+v.completedCount+'名';
 if(document.activeElement!==$('adjustment'))$('adjustment').value=ledger?.adjustment??0;
 if(document.activeElement!==$('expense'))$('expense').value=ledger?.expense??0;
 const access=v.collectionAccess;
 const homeLocked=!ledger||ledger.status==='confirmed'||access?.canCollect===false;
 const reason=$('collectionLockReason');
 if(reason){
   reason.textContent=access?.reason||(!ledger?'集金・収支データ未作成のため集金できません':ledger.status==='confirmed'?'この日程の収支確定済み':'');
   reason.hidden=!reason.textContent;
 }
 $('confirm').disabled=homeLocked||practice.date>today()||ledger?.canConfirm!==true;
 $('confirm').textContent=ledger?.status==='confirmed'?'確定済':'収支を確定';
 $('adjustment').disabled=homeLocked;$('expense').disabled=homeLocked;
 const list=$('list'),pos=list.scrollTop;list.replaceChildren();
 for(const p of M.sortParticipants(participants)){
   const card=document.createElement('div');card.className='participant-card'+(p.collectionCompleted?' checked':'');card.dataset.id=p.participantId;
   const info=document.createElement('div');info.className='info';const nameRow=document.createElement('div');nameRow.className='name-row';
   const name=document.createElement('span');name.className='name';name.textContent=(p.number ? (p.number+'. ') : '')+M.normalizeName(p.name);
   const cat=document.createElement('span');cat.className='type long-press-type';cat.textContent=M.CATEGORY_LABEL[p.category]||p.category;cat.title='長押しで変更';
   const amt=document.createElement('span');amt.className='amount';amt.textContent='('+yen(p.fee)+')';
   nameRow.append(name,cat,amt);info.append(nameRow);
   if(p.memo){const memo=document.createElement('div');memo.className='meta participant-memo';memo.textContent='📝 '+p.memo;info.append(memo);}
   const wrapper=document.createElement('div');wrapper.className='checkbox-container';
   const cb=document.createElement('input');cb.type='checkbox';cb.checked=!!p.collectionCompleted;
   cb.disabled=homeLocked||S.paymentNeedsRefresh||S.pending.has(p.participantId);
   cb.setAttribute('aria-label',M.normalizeName(p.name)+' 集金');
   const state=document.createElement('span');state.className='payment-checkbox-state';state.hidden=true;
   state.setAttribute('role','status');state.setAttribute('aria-live','polite');
   cb.addEventListener('change',()=>setPayment(p,cb,card).catch(showPaymentError_));
   wrapper.append(state,cb);card.append(info,wrapper);list.append(card);setupLongPress(cat,p);
 }list.scrollTop=pos;updateFooter();
}
function updateFooter(){const v=S.overview;if(!v)return;const rows=v.participants.filter(p=>p.attending);const complete=rows.filter(p=>p.collectionCompleted);
 const collected=complete.reduce((a,p)=>a+p.fee,0),expected=rows.reduce((a,p)=>a+p.fee,0),adj=Number($('adjustment').value)||0,expense=Number($('expense').value)||0;
 $('income').textContent='集金額：'+yen(collected)+' / '+yen(expected);$('adjustmentDisplay').textContent='当日補正：('+(adj>=0?'+':'')+yen(adj)+')';
 $('expenseDisplay').textContent='支出：'+yen(expense);
 // Optimistic wallet estimate uses server-posted balance plus local amount deltas, without treating today's delta as the whole wallet.
 const posting=v.ledger;const localIncome=collected+adj;
 const provisional=(posting?.balance??0)+(localIncome-(posting?.income??0))-(expense-(posting?.expense??0));
 $('balance').textContent=posting?'残金：'+yen(provisional):'残金：—';
 $('completedCount').textContent='集金完了：'+complete.length+'名';
}
async function setPayment(p,cb,card){
 gateEdit();const id=p.participantId;
 if(S.pending.has(id))return;
 if(S.paymentNeedsRefresh){
   cb.checked=!!p.collectionCompleted;toast('保存状態を確認するため「更新」を押してください。');return;
 }
 const before=p.collectionCompleted,checked=cb.checked,version=p.paymentVersion;
 const practiceId=S.practiceId,request={operationId:uuid(),practiceId,participantId:id,
   completed:checked,expectedVersion:version,profileTimings:PERF_MODE};
 S.pending.add(id);cb.disabled=true;card.classList.add('payment-saving');
 const state=card.querySelector('.payment-checkbox-state');
 if(state){state.hidden=false;state.textContent='順番待ち…';}
 syncPaymentControls();
 p.collectionCompleted=checked;card.classList.toggle('checked',checked);updateFooter();
 try{
   // Only two requests in flight. GAS still serializes financial mutations.
   // Validate inside the queued job. A malformed 200 response must block
   // unsubmitted payments BEFORE a request slot becomes free.
   const saved=await paymentCall_(
     async()=>{
       const result=await call('/api/payment',request);
       if(result?.practiceId!==practiceId||result?.participantId!==id||result.completed!==checked||
          result.version!==version+1||!Number.isSafeInteger(result.ledgerVersion)||
          !Number.isSafeInteger(result.balance)||!Number.isSafeInteger(result.income)){
         const e=new Error('保存結果を確認できませんでした。「更新」で最新状態をご確認ください。');
         e.appliedButRefreshFailed=true;throw e;
       }
       return result;
     },
     ()=>{if(state)state.textContent='保存中…';}
   );
   p.paymentVersion=saved.version;
   const ledger=S.overview?.ledger;
   // Responses may arrive in a different order than committed financial writes.
   if(ledger&&saved.ledgerVersion>ledger.version){
     ledger.version=saved.ledgerVersion;ledger.income=saved.income;ledger.balance=saved.balance;
   }
   updateFooter();renderGasProfile_(saved.gasTimings);toast('集金処理を更新しました');
 }catch(e){
   S.paymentNeedsRefresh=true;
   // A failed POST may already have committed. Revert only known rejection or
   // unsent queued actions, never an ambiguous network failure.
   const definitelyNotSaved=e.notSent||(Number.isInteger(e.status)&&e.status>=400&&e.status<500);
   if(definitelyNotSaved){
     p.collectionCompleted=before;cb.checked=before;card.classList.toggle('checked',before);
   }
   updateFooter();
   drainPaymentQueue_(); // Stop the queued, unsubmitted financial writes.
   throw e;
 }finally{
   S.pending.delete(id);card.classList.remove('payment-saving');
   if(state){state.textContent='';state.hidden=true;}
   cb.disabled=S.paymentNeedsRefresh||S.overview?.ledger?.status==='confirmed';
   syncPaymentControls();
 }
}
function setupLongPress(element,p){let timer=null,started=false;
 const stop=()=>{if(timer)clearTimeout(timer);timer=null;};
 element.addEventListener('pointerdown',event=>{if(event.button!==0)return;started=true;stop();timer=setTimeout(()=>{if(started&&!S.pending.size&&!S.paymentNeedsRefresh&&S.overview?.ledger?.status==='open'){$('categoryPerson').textContent=M.normalizeName(p.name);
const visitorOption=$('categorySelectVisitor');
visitorOption.hidden=p.category!=='visitor';visitorOption.disabled=p.category!=='visitor';
$('categorySelect').value=p.category;S.modalTarget=p;dialog('categoryDialog');}},650);});
 for(const ev of ['pointerup','pointercancel','pointerleave'])element.addEventListener(ev,()=>{started=false;stop();});
 element.addEventListener('contextmenu',event=>event.preventDefault());
}
async function saveCategory(){
 await guard(async()=>{
   gateEdit();const p=S.modalTarget;if(!p)return;
   const category=$('categorySelect').value;
   if((category==='visitor')!==(p.category==='visitor'))
    throw new Error('ビジターへの変更はできません。ビジター申請を使用してください');
   close('categoryDialog');
   const key='category:'+p.participantId;
   S.pending.add(key);
   try{
     const oldFee=p.fee;
     const saved=await call('/api/category',{operationId:uuid(),practiceId:S.practiceId,participantId:p.participantId,category,expectedVersion:p.categoryVersion});
     if(saved?.participantId!==p.participantId||saved.category!==category||
       !Number.isSafeInteger(saved.categoryVersion)||!Number.isSafeInteger(saved.fee)||
       !Number.isSafeInteger(saved.ledgerVersion)||!Number.isSafeInteger(saved.balance)){
       const e=new Error('保存結果を確認できませんでした。「更新」で最新状態をご確認ください。');e.appliedButRefreshFailed=true;throw e;
     }
     p.category=category;p.fee=saved.fee;p.categoryVersion=saved.categoryVersion;
     const ledger=S.overview?.ledger;
     if(ledger){
       if(p.collectionCompleted)ledger.income+=saved.fee-oldFee;
       ledger.balance=saved.balance;ledger.version=saved.ledgerVersion;
     }
     renderHome();toast('参加区分を更新しました');
   }finally{S.pending.delete(key);}
 });
}
// A field-level status, never a global spinner. The ledger version is still
// protected: while one money change is in flight, payment checkboxes and
// other finance actions are disabled (not auto-queued or retried).
async function saveAmount(kind){
 const el=$(kind==='adjustment'?'adjustment':'expense');
 const status=$(kind==='adjustment'?'adjustmentStatus':'expenseStatus');
 const v=S.overview,ledger=v?.ledger,old=ledger?.[kind];
 if(!ledger||!S.actor||!['duty','admin'].includes(S.actor.role))return;
 if(S.pending.size||S.paymentNeedsRefresh||ledger.status==='confirmed'){
  el.value=old;toast('ほかの集金処理が完了してから操作してください');return;
 }
 const value=Number(el.value);
 if(!Number.isSafeInteger(value)||kind==='expense'&&value<0){
  el.value=old;
  status.textContent='金額を確認してください';
  return;
 }
 if(value===old)return;
 const practiceId=S.practiceId,expectedVersion=ledger.version;
 S.pending.add('amount');status.textContent=(kind==='adjustment'?'当日補正':'当日支出')+'を保存中…';
 el.disabled=true;syncPaymentControls();updateFooter();
 let error=null;
 try{
  const saved=await call(kind==='adjustment'?'/api/adjustment':'/api/expense',
   {operationId:uuid(),practiceId,value,expectedVersion});
  if(saved?.practiceId!==practiceId||!Number.isSafeInteger(saved.ledgerVersion)||
   saved.ledgerVersion<=expectedVersion||!Number.isSafeInteger(saved.income)||
   !Number.isSafeInteger(saved.expense)||!Number.isSafeInteger(saved.adjustment)||
   !Number.isSafeInteger(saved.balance)){
   const e=new Error('保存結果を確認できませんでした。「更新」で最新状態をご確認ください。');
   e.code='OPERATION_UNCONFIRMED';throw e;
  }
  Object.assign(ledger,{version:saved.ledgerVersion,income:saved.income,
   expense:saved.expense,adjustment:saved.adjustment,balance:saved.balance});
  el.value=ledger[kind];status.textContent='保存しました';
  updateFooter();toast((kind==='adjustment'?'当日補正':'当日支出')+'を更新しました');
 }catch(e){
  error=e;
  // The server may have committed despite an unreachable response. Block
  // new finance writes until a verified manual refresh; never auto-retry.
  S.paymentNeedsRefresh=true;
  el.value=old;updateFooter();
  status.textContent='結果を確認できません。更新してください';
 }finally{
  S.pending.delete('amount');
  el.disabled=S.paymentNeedsRefresh||ledger.status==='confirmed';
  syncPaymentControls();
 }
 if(error)await window.SMStageUX.showError(error);
}
function ledgerLoadingRow_(month){
 const body=$('ledgerBody');body.replaceChildren();
 const tr=document.createElement('tr');tr.className='carry-row';
 for(const value of [window.SMDate.date(month+'-01'),'前月繰越','—','—','読み込み中…','', '—']){
  const td=document.createElement('td');td.textContent=value;tr.append(td);
 }
 body.append(tr);
 $('ledgerTotal').textContent='残金：読み込み中…';
 $('prevMonth').disabled=true;$('nextMonth').disabled=true;
 $('newLedgerRow').disabled=true;
}
function readLedgerScreen_(force=false){
 const month=$('ledgerMonth').value;
 ledgerLoadingRow_(month);
 return readScreen_('ledgerDialog','先月繰り越しと収支明細を読み込んでいます…',
  isCurrent=>loadLedger(isCurrent),()=>{
   $('prevMonth').disabled=false;
   $('newLedgerRow').disabled=false;
  },force);
}
function openLedger(){
 gateEdit();close('manageDialog');
 $('ledgerMonth').value=today().slice(0,7);
 S.ledger=null;return readLedgerScreen_();
}
async function loadLedger(isCurrent=()=>true){const month=$('ledgerMonth').value,ledger=await call('/api/ledger',{month});if(!isCurrent())return;S.ledger=ledger;const b=$('ledgerBody');b.replaceChildren();
 const rows=[{rowId:'CARRY-'+month,date:month+'-01',label:'前月繰越',income:0,expense:0,balance:ledger.carried,confirmedBy:'',kind:'carry',status:'confirmed'},...ledger.rows.filter(r=>r.kind!=='opening')];
 for(const r of rows){const tr=document.createElement('tr');
  // Preserve the semantic seven-column table for desktop, CSS reflows it
  // into cards on narrow screens without touching row IDs or actions.
  const values=[window.SMDate.date(r.date),r.label,yen(r.income),yen(r.expense),
    yen(r.balance),r.confirmedBy||''];
  const columns=['date','label','income','expense','balance','confirmed'];
  for(let i=0;i<values.length;i++){
   const td=document.createElement('td');td.className='ledger-col-'+columns[i];
   td.textContent=values[i];
   if(i===1&&r.receiptFileId){
    const link=document.createElement('a');link.href='#';link.className='receipt-ledger-link';
    link.textContent=' 🧾 領収書';link.setAttribute('aria-label',r.label+' の領収書を表示');
    link.addEventListener('click',event=>{
     event.preventDefault();viewReceipt_(r.rowId);
    });
    td.append(link);
   }
   tr.append(td);
  }
  const actions=document.createElement('td');actions.className='ledger-row-actions';
  const future=r.date>today(),carry=r.kind==='carry',confirmed=r.status==='confirmed';
  if(carry)tr.classList.add('carry-row');
  if(confirmed&&!carry)tr.classList.add('confirmed');
  // v15: left-aligned fixed slots before confirmation. After confirmation,
  // duty sees a single disabled state; only admin sees Unlock.
  if(!carry){
   const group=document.createElement('div');group.className='ledger-action-group';
   if(confirmed){
    const button=document.createElement('button');button.type='button';
    if(S.actor.role==='admin'){
     button.className='btn-green';button.textContent='確定解除';
     button.disabled=future||r.canUnlock!==true;
     if(!button.disabled)button.addEventListener('click',()=>ledgerAction('unlock',r));
    }else{
     button.className='btn-green';button.textContent='確定済み';
     button.disabled=true;
    }
    group.append(button);
   }else{
    const canEdit=!future&&r.kind!=='practice';
    const canDelete=!future&&r.kind!=='practice';
    // GAS calculates canConfirm across all prior months and same-day lines.
    const canConfirm=!future&&r.canConfirm===true;
    const slots=[['修正','edit',canEdit],['削除','delete',canDelete],
      ['確定','confirm',canConfirm]];
    for(const [label,act,enabled] of slots){
     const btn=document.createElement('button');btn.type='button';
     btn.className=act==='delete'?'btn-danger':act==='confirm'?'btn-green':'btn-blue';
     btn.textContent=label;btn.disabled=!enabled;
     if(enabled)btn.addEventListener('click',()=>ledgerAction(act,r));
     group.append(btn);
    }
   }
   actions.append(group);
   const status=document.createElement('span');
   status.className='ledger-card-status '+(confirmed?'is-confirmed':'is-open');
   status.textContent=confirmed?'✔ 確定済み':'⏳ 未確定';
   actions.append(status);
  }else{
   const label=document.createElement('small');label.className='muted';
   label.textContent='－';actions.append(label);
  }
  tr.append(actions);b.append(tr);
 }
 $('ledgerTotal').textContent='残金：'+yen(ledger.closingBalance);
 $('nextMonth').disabled=month>=(ledger.maxMonth||today().slice(0,7));
}
function ledgerAction(act,row){
 if(act==='confirm'&&row.canConfirm!==true)return;
 if(act==='unlock'&&row.canUnlock!==true)return;
 if(act==='delete'&&row.kind==='practice')return;
 if(act==='edit'){openEditor(row);return;}
 S.modalTarget={act,row};
 const titles={confirm:'【収支の確定】',delete:'【収支の削除】',unlock:'【確定の解除】'};
 const verbs={confirm:'確定',delete:'削除',unlock:'確定解除'};
 $('confirmActionTitle').textContent=titles[act]||'【収支の確認】';
 $('confirmActionText').textContent=window.SMDate.date(row.date)+'　'+row.label+
  '\n'+verbs[act]+'しますか？';
 $('doConfirmAction').textContent=act==='confirm'?'確定する':
   act==='delete'?'削除する':'解除する';
 $('doConfirmAction').className=act==='delete'?'btn-danger':'btn-green';
 dialog('confirmActionDialog');
}
async function executeLedgerAction(){close('confirmActionDialog');await guard(async()=>{
 const {act,row}=S.modalTarget;await call('/api/ledger/change',{operationId:uuid(),action:act,rowId:row.rowId,expectedVersion:row.version});
 toast((act==='confirm'?'確定':act==='unlock'?'確定解除':'削除')+'しました');if($('ledgerDialog').open)await loadLedger();await reload(true);
});}

const RECEIPT_MAX_BYTES=1500000;
const RECEIPT_SOURCE_MAX_BYTES=25000000; // iPhone source limit; uploaded bytes still <= 1.5MB.
const RECEIPT_MIMES=new Set(['application/pdf','image/jpeg','image/png','image/webp']);
const RECEIPT_HEIC_MIMES=new Set(['image/heic','image/heif','image/heic-sequence','image/heif-sequence']);
function receiptFile_(file){
 if(!file)return null;
 const type=String(file.type||'').toLowerCase();
 const name=String(file.name||'');
 const ext=(/\.([a-z0-9]+)$/i.exec(name)||[])[1]?.toLowerCase()||'';
 const knownType=RECEIPT_MIMES.has(type)||RECEIPT_HEIC_MIMES.has(type);
 const knownExtension=['pdf','jpg','jpeg','png','webp','heic','heif'].includes(ext);
 if(!knownExtension||(!knownType&&type!==''))
  throw new Error('領収書はPDF・JPG/JPEG・PNG・WebP・iPhoneのHEIC/HEIF画像に対応しています');
 const isPdf=type==='application/pdf'||(ext==='pdf'&&!type);
 if(isPdf&&(ext!=='pdf'||file.size>RECEIPT_MAX_BYTES)||
    file.size<5||file.size>(isPdf?RECEIPT_MAX_BYTES:RECEIPT_SOURCE_MAX_BYTES))
  throw new Error(isPdf?'PDFの上限は1.5MBです':'画像は25MB以下を選択してください（保存時は1.5MB以下に調整します）');
 return file;
}
async function receiptBitmap_(file){
 if(typeof createImageBitmap==='function'){
  try{return await createImageBitmap(file,{imageOrientation:'from-image'});}
  catch(_){/* Safari/WebView versions may need HTMLImageElement instead. */}
 }
 const url=URL.createObjectURL(file);
 try{
  const image=await new Promise((resolve,reject)=>{
   const img=new Image();img.onload=()=>resolve(img);
   img.onerror=()=>reject(new Error('この端末ではHEIC/HEIF画像を読み取れません。iPhoneの写真アプリからJPEG形式で共有して再選択してください。'));
   img.src=url;
  });
  return image;
 }finally{URL.revokeObjectURL(url);}
}
async function prepareReceiptFile_(selected){
 const file=receiptFile_(selected);
 if(!file)return null;
 const type=String(file.type||'').toLowerCase();
 const ext=(/\.([a-z0-9]+)$/i.exec(file.name)||[])[1]?.toLowerCase()||'';
 const isPdf=type==='application/pdf'||(ext==='pdf'&&!type);
 if(isPdf)return file;
 const isHeic=RECEIPT_HEIC_MIMES.has(type)||ext==='heic'||ext==='heif';
 const compatible={
  jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'
 };
 const expected=compatible[ext];
 if(!isHeic&&expected&&(!type||type===expected)&&file.size<=RECEIPT_MAX_BYTES){
  // Safari may supply a JPG with an empty MIME. Explicitly label its known
  // extension so Worker/GAS can validate the true magic bytes.
  if(type)return file;
  return new File([file],file.name,{type:expected,lastModified:file.lastModified});
 }
 // iOS photo-library picks can already contain JPEG bytes under a .HEIC name.
 // Treat the source as JPEG only when Safari provides the JPEG MIME; otherwise
 // decode HEIC or a large camera image in the browser and upload JPEG bytes.
 if(type==='image/jpeg'&&isHeic&&file.size<=RECEIPT_MAX_BYTES){
  const base=file.name.replace(/\.(heic|heif)$/i,'')||'receipt';
  return new File([file],base+'.jpg',{type:'image/jpeg',lastModified:file.lastModified});
 }
 if(!isHeic&&!['image/jpeg','image/png','image/webp',''].includes(type))
  throw new Error('この画像形式には対応していません');
 let source;
 try{source=await receiptBitmap_(file);}
 catch(e){throw new Error(e.message||'iPhone画像を読み取れません。JPEGに変換してから登録してください');}
 try{
  if(!source.width||!source.height)throw new Error('画像のサイズを確認できません');
  const longEdge=Math.max(source.width,source.height);
  const base=file.name.replace(/\.(heic|heif|jpe?g|png|webp)$/i,'')||'receipt';
  // Start near original dimensions, then reduce only as needed. Never upscale.
  const settings=[[2600,.92],[2400,.88],[2100,.85],[1800,.80],[1600,.75],[1300,.70]];
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('この端末で画像を変換できません');
  for(const [maxEdge,quality] of settings){
   const scale=Math.min(1,maxEdge/longEdge);
   canvas.width=Math.max(1,Math.round(source.width*scale));
   canvas.height=Math.max(1,Math.round(source.height*scale));
   ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(source,0,0,canvas.width,canvas.height);
   const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
   if(jpeg?.type==='image/jpeg'&&jpeg.size>=5&&jpeg.size<=RECEIPT_MAX_BYTES)
    return new File([jpeg],base+'.jpg',{type:'image/jpeg'});
  }
  throw new Error('写真を1.5MB以下に調整できません。画像のサイズを小さくして再選択してください');
 }finally{if(typeof source.close==='function')source.close();}
}
async function receiptBase64_(file){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error('領収書を読み取れません'));
  reader.onload=()=>{
   const text=String(reader.result||''),index=text.indexOf(',');
   if(index<0)return reject(new Error('領収書を読み取れません'));
   resolve(text.slice(index+1));
  };
  reader.readAsDataURL(file);
 });
}
async function uploadReceipt_(file,row){
 const prepared=await prepareReceiptFile_(file);
 if(!prepared)throw new Error('領収書を選択してください');
 if(!row?.rowId||!Number.isSafeInteger(row.version))throw new Error('収支行を確認できません。更新してください');
 return call('/api/receipt/upload',{operationId:uuid(),rowId:row.rowId,
  expectedVersion:row.version,fileName:prepared.name,mimeType:prepared.type,
  base64:await receiptBase64_(prepared)});
}
/* Do not auto-click a download anchor after an awaited HTTP request:
 * LINE WebViews often ignore that synthetic gesture without displaying an
 * error. Show an in-app image/PDF preview and user-activated open/save links.
 */
let receiptPreviewUrl_='';
async function downloadReceipt_(rowId){
 const result=await call('/api/receipt/get',{rowId});
 if(!result?.base64||!RECEIPT_MIMES.has(result.mimeType))throw new Error('領収書を取得できません');
 const raw=atob(result.base64),bytes=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 const fileName=String(result.fileName||'receipt').replace(/[/\\]/g,'_');
 return {url:URL.createObjectURL(new Blob([bytes],{type:result.mimeType})),
  mimeType:result.mimeType,fileName};
}
function clearReceiptPreview_(){
 $('receiptPreviewImage').removeAttribute('src');
 $('receiptPreviewPdf').removeAttribute('src');
 if(receiptPreviewUrl_){URL.revokeObjectURL(receiptPreviewUrl_);receiptPreviewUrl_='';}
}
function openReceiptPreview_(receipt){
 clearReceiptPreview_();
 receiptPreviewUrl_=receipt.url;
 const pdf=receipt.mimeType==='application/pdf';
 $('receiptPreviewInfo').textContent=receipt.fileName;
 $('receiptPreviewImage').hidden=pdf;
 $('receiptPreviewPdf').hidden=!pdf;
 if(pdf)$('receiptPreviewPdf').src=receipt.url;
 else $('receiptPreviewImage').src=receipt.url;
 dialog('receiptPreviewDialog');
}
async function viewReceipt_(rowId){
 // Release the full-screen spinner BEFORE calling showModal, so the
 // retrieved receipt stays visible until the user closes it.
 const receipt=await guard(()=>downloadReceipt_(rowId),'領収書を取得しています…');
 if(receipt)openReceiptPreview_(receipt);
}
async function attachAfterLedgerSave_(file,ledgerResult,rowId){
 if(!file)return true;
 const row=(ledgerResult?.ledger||[]).find(r=>r.rowId===rowId);
 if(!row){
  S.receiptPartialWarning='収支は保存済みですが領収書の登録先を確認できません。収支を再登録せず、収支表を更新して対象行を確認してください。';
  return false;
 }
 try{await uploadReceipt_(file,row);return true;}
 catch(e){
  S.receiptPartialWarning='収支は保存済みですが領収書の添付だけ失敗しました。収支を再登録せず、収支表の「修正」から再添付してください。'+e.message;
  return false;
 }
}

function syncPayoutWeekday_(id,hint){const value=$(id).value,formatted=value?window.SMDate.date(value):'';
 const weekday=/\(([^)]+)\)$/.exec(formatted);
 $(hint).textContent=weekday?'（'+weekday[1]+'）':'';}
function openEditor(row=null,kind='reimbursement'){
 S.ledgerRow=row;S.mode=row?'edit':'add';$('ledgerEditTitle').textContent=row?'収支を修正':'収支を追加';
 const targetKind=row?.kind||kind;$('ledgerKind').value=targetKind;$('ledgerKind').disabled=!!row;
 $('ledgerPayoutDate').value=row?.date||today();$('ledgerReimbursementItem').value=row?.item||'';$('ledgerReimbursementPayee').value=row?.payee||'';
 syncPayoutWeekday_('ledgerPayoutDate','ledgerPayoutWeekday');
 $('ledgerReimbursementAmount').value=row?.expense??'';$('ledgerEditDate').value=row?.date||today();$('ledgerEditLabel').value=row?.label||'';
 $('ledgerEditIncome').value=row?.income??0;$('ledgerEditExpense').value=row?.expense??0;
 syncPayoutWeekday_('ledgerEditDate','ledgerEditWeekday');
 $('ledgerReimbursementReceipt').disabled=targetKind!=='reimbursement';$('ledgerReimbursementReceipt').value='';
 $('ledgerCurrentReceipt').textContent=row?.receiptFileId?'登録済みの領収書があります':'';
 $('ledgerViewReceipt').hidden=!row?.receiptFileId;
 updateEditorKind();dialog('ledgerEditDialog');
}
function updateLedgerAmountValidity_(){
 const income=$('ledgerEditIncome'),expense=$('ledgerEditExpense');
 if($('ledgerKind').value!=='other'){expense.setCustomValidity('');return true;}
 const bothZero=(Number(income.value)||0)===0&&(Number(expense.value)||0)===0;
 expense.setCustomValidity(bothZero?'集金額または支出額を1円以上入力してください':'');
 return !bothZero;
}
function updateEditorKind(){
 const kind=$('ledgerKind').value,reimb=kind==='reimbursement';
 $('ledgerReimbursementFields').hidden=!reimb;
 $('ledgerGeneralFields').hidden=reimb;
 $('ledgerReimbursementReceipt').disabled=!reimb;
 for(const id of ['ledgerPayoutDate','ledgerReimbursementItem','ledgerReimbursementPayee','ledgerReimbursementAmount'])
  $(id).required=reimb;
 for(const id of ['ledgerEditDate','ledgerEditLabel','ledgerEditIncome','ledgerEditExpense'])
  $(id).disabled=reimb;
 $('ledgerEditDate').required=!reimb;
 $('ledgerEditLabel').required=!reimb;
 updateLedgerAmountValidity_();
 $('submitLedgerEdit').disabled=false;
 $('submitLedgerEdit').textContent=reimb?'精算を登録':S.mode==='edit'?'変更する':'登録する';
}
function getReimbursementPayload(prefix){return {date:$(prefix==='ledger'?'ledgerPayoutDate':'payoutDate').value,
 item:$(prefix==='ledger'?'ledgerReimbursementItem':'reimbursementItem').value.trim(),
 payee:M.normalizeName($(prefix==='ledger'?'ledgerReimbursementPayee':'reimbursementPayee').value),
 amount:Number($(prefix==='ledger'?'ledgerReimbursementAmount':'reimbursementAmount').value)};}
async function submitEditor(event){
 event.preventDefault();
 const kind=$('ledgerKind').value;
 // Validate synchronously, BEFORE the full-screen spinner can appear.
 if(kind==='other'){
  updateLedgerAmountValidity_();
  if(!$('ledgerEditForm').reportValidity())return;
 }
 await guard(async()=>{
  gateEdit();
  let payload={operationId:uuid(),action:S.mode==='edit'?'edit':'add',kind};
  if(S.mode==='edit'){payload.rowId=S.ledgerRow.rowId;payload.expectedVersion=S.ledgerRow.version;}
  else payload.rowId=(kind==='reimbursement'?'R-':'O-')+uuid();
  if(kind==='reimbursement')Object.assign(payload,getReimbursementPayload('ledger'));
  else Object.assign(payload,{date:$('ledgerEditDate').value,label:$('ledgerEditLabel').value.trim(),
   income:Number($('ledgerEditIncome').value)||0,expense:Number($('ledgerEditExpense').value)||0});
  const file=kind==='reimbursement'?await prepareReceiptFile_($('ledgerReimbursementReceipt').files?.[0]):null;
  const saved=await call('/api/ledger/change',payload);close('ledgerEditDialog');
  const attached=await attachAfterLedgerSave_(file,saved,payload.rowId);
  if(attached)toast(S.mode==='edit'?'修正しました':'登録しました');
  await loadLedger();await reload(true);
 });
}
async function submitReimbursement(event){event.preventDefault();await guard(async()=>{
 gateEdit();const file=await prepareReceiptFile_($('reimbursementReceipt').files?.[0]);
 const rowId='R-'+uuid();const saved=await call('/api/ledger/change',{operationId:uuid(),action:'add',kind:'reimbursement',rowId,...getReimbursementPayload('header')});
 close('reimbursementDialog');$('reimbursementForm').reset();
 const attached=await attachAfterLedgerSave_(file,saved,rowId);
 if(attached)toast('立替精算を登録しました');await reload(false);
});}

// v0.16.37b: legacy v7 surface, new ID-based cash audit backend.
// This optional check stores denomination snapshots, NEVER mutates ledger money.
const CASH=window.SMCashReconcile;
const CASH_LABELS={10000:'1万円札',5000:'5千円札',1000:'千円札',500:'500円玉',100:'100円玉',
  50:'50円玉',10:'10円玉',5:'5円玉',1:'1円玉'};
let cashSnapshot=null,cashCountsState=null;
function blankCashCounts(){
 return Object.fromEntries(CASH.DENOMINATIONS.map(n=>[n,0]));
}
function prepareCashDenominations(){
 const box=$('cashDenominations');if(!CASH){$('cashCounter').disabled=true;return;}
 cashCountsState=blankCashCounts();box.replaceChildren();
 for(const denom of CASH.DENOMINATIONS){
  const item=document.createElement('div');item.className='cash-denom';
  const label=document.createElement('span');label.className='cash-denom-label';label.textContent=CASH_LABELS[denom];
  const controls=document.createElement('div');controls.className='cash-controls';
  const minus=document.createElement('button');minus.type='button';minus.className='cash-count-btn cash-count-minus';minus.textContent='−';
  minus.setAttribute('aria-label',CASH_LABELS[denom]+'を1枚減らす');
  const count=document.createElement('span');count.id='cashCount'+denom;count.className='cash-count-display';count.textContent='0';
  const plus=document.createElement('button');plus.type='button';plus.className='cash-count-btn cash-count-plus';plus.textContent='+';
  plus.setAttribute('aria-label',CASH_LABELS[denom]+'を1枚増やす');
  const subtotal=document.createElement('span');subtotal.id='cashSubtotal'+denom;subtotal.className='cash-subtotal';subtotal.textContent='0円';
  minus.addEventListener('click',()=>changeCashCount(denom,-1));
  plus.addEventListener('click',()=>changeCashCount(denom,1));
  controls.append(minus,count,plus,subtotal);item.append(label,controls);box.append(item);
 }
}
function changeCashCount(denom,delta){
 if(!cashCountsState||!CASH||window.SMStageUX.isBusy())return;
 const current=cashCountsState[denom]||0;
 cashCountsState[denom]=Math.max(0,Math.min(9999,current+delta));
 renderCash();
}
function renderCash(){
 if(!CASH||!cashCountsState)return;
 const snap=cashSnapshot,status=$('cashStatus'),book=$('cashBook'),difference=$('cashDifference');
 const valid=!!(snap&&snap.found&&Number.isSafeInteger(snap.bookBalance));
 const actual=CASH.cashTotal(cashCountsState);
 for(const denom of CASH.DENOMINATIONS){
  $('cashCount'+denom).textContent=String(cashCountsState[denom]);
  $('cashSubtotal'+denom).textContent=yen(cashCountsState[denom]*denom);
 }
 $('cashActual').textContent=yen(actual);
 $('cashDateDisplay').textContent=snap?window.SMDate.date(snap.auditDate):'—';
 book.textContent=valid?yen(snap.bookBalance):'—';
 $('cashSave').disabled=!valid||snap.auditDate>today()||S.pending.size>0;
 difference.textContent=valid?
  (actual===snap.bookBalance?'0円 (一致！)':
   actual>snap.bookBalance?'+'+yen(actual-snap.bookBalance)+' (超過)':
    yen(actual-snap.bookBalance)+' (不足)'):'—';
 difference.className=!valid?'':actual===snap.bookBalance?'cash-same':
    actual>snap.bookBalance?'cash-surplus':'cash-shortage';
 // Read progress is displayed ONLY in the single animated blue banner.
 // Keep this row for actionable warnings after a successful data fetch.
 status.classList.remove('stage-system-message--info');
 status.classList.add('stage-system-message--warning');
 status.textContent=!snap?'':!snap.found?
  '指定された日付の行が「全体収支管理表」に見つかりません。':
  snap.updatedBy&&snap.savedBookBalance!==null&&snap.savedBookBalance!==snap.bookBalance?
  '前回確認後に帳簿残金が変わりました':'';
 status.hidden=!status.textContent;
}
function validateCashSnapshot_(result,practiceId){
 if(!result||result.practiceId!==practiceId||result.auditDate!==S.overview?.practice?.date||
    typeof result.found!=='boolean'||!Number.isSafeInteger(result.version)||result.version<0||
    (result.found&&!Number.isSafeInteger(result.bookBalance))||!result.counts||
    typeof result.counts!=='object')
  throw new Error('現金確認データが一致しません。「更新」して再確認してください');
 const counts={};
 for(const denom of CASH.DENOMINATIONS){
  if(!Number.isSafeInteger(result.counts[denom])||result.counts[denom]<0||result.counts[denom]>9999)
   throw new Error('保存された枚数が不正です。管理者へご連絡ください');
  counts[denom]=result.counts[denom];
 }
 if(Object.keys(result.counts).length!==CASH.DENOMINATIONS.length)
  throw new Error('金種の種類が一致しません');
 return {result,counts};
}
async function refreshCashSnapshot_(isCurrent=()=>true){
 const practiceId=S.practiceId;
 cashSnapshot=null;renderCash();
 updateReadScreenStatus_('cashDialog','帳簿残高と金種記録を取得しています…',isCurrent);
 const response=await call('/api/cash/get',{practiceId});
 if(!isCurrent())return;
 if(practiceId!==S.practiceId)throw new Error('開催日が変更されました。もう一度現金確認を開いてください');
 updateReadScreenStatus_('cashDialog','帳簿残高と金種枚数を確認しています…',isCurrent);
 const validated=validateCashSnapshot_(response,practiceId);
 cashSnapshot=response;cashCountsState=validated.counts;renderCash();
}
function openCash(){
 gateEdit();if(!CASH)throw new Error('現金確認機能の読み込みに失敗しました');
 cashSnapshot=null;cashCountsState=blankCashCounts();renderCash();
 close('manageDialog');
 return readScreen_('cashDialog','現金確認の帳簿残高を読み込んでいます…',
  isCurrent=>refreshCashSnapshot_(isCurrent));
}
function resetCashCounts(){
 cashCountsState=blankCashCounts();renderCash();toast('枚数をリセットしました');
}
function showCashSaveConfirm(){
 if(!cashSnapshot?.found||cashSnapshot.auditDate>today())return;
 $('cashSaveMessage').textContent=window.SMDate.date(cashSnapshot.auditDate)+
  ' の金種枚数データを保存しますか？';
 dialog('cashSaveDialog');
}
async function saveCashAudit(){
 close('cashSaveDialog');
 const original=cashSnapshot;
 if(!original?.found)return;
 await guard(async()=>{
  gateEdit();
  const counts={...cashCountsState},actual=CASH.cashTotal(counts);
  let saved;
  try{
   saved=await call('/api/cash/save',{operationId:uuid(),practiceId:original.practiceId,
    counts,expectedVersion:original.version});
   if(saved?.practiceId!==original.practiceId||saved?.auditDate!==original.auditDate||
      saved.version!==original.version+1||saved.actual!==actual||
      !Number.isSafeInteger(saved.bookBalance)||saved.difference!==actual-saved.bookBalance||
      CASH.DENOMINATIONS.some(n=>saved?.counts?.[n]!==counts[n]))
    throw new Error('保存結果を確認できません。現金確認を閉じて開き直し、記録をご確認ください。');
  }catch(error){
   // The request may have committed even if the reply was lost. Block a
   // second save until a fresh snapshot has been read from GAS.
   cashSnapshot=null;renderCash();throw error;
  }
  cashSnapshot={...original,version:saved.version,bookBalance:saved.bookBalance,
    counts:saved.counts,savedBookBalance:saved.bookBalance,updatedBy:saved.updatedBy,
    updatedAt:saved.updatedAt};
  renderCash();toast('現金確認を保存しました');
 });
}


// v0.16.38a: old v7 surface, new fixed-ID practice schedule records.
const SC={rows:[],editing:null,action:null};
function scheduleDateLabel_(d){return window.SMDate.date(d);}
function scheduleDateValid_(d){return /^\d{4}-\d{2}-\d{2}$/.test(d)&&window.SMCashReconcile.validDate(d);}
function scheduleFormPayload_(){
 const date=$('scheduleDate').value.trim();
 const match=/^(\d{1,2}):([0-5]\d)\s*-\s*(\d{1,2}):([0-5]\d)$/.exec($('scheduleTimeSlot').value.trim());
 const hours=Number($('scheduleHours').value),place=$('schedulePlace').value,remark=$('scheduleRemark').value.trim();
 if(!scheduleDateValid_(date)||date<today())throw new Error('本日以降の開催日を入力してください');
 if(!match||Number(match[1])>23||Number(match[3])>23)throw new Error('時間帯を確認してください');
 const startTime=String(Number(match[1])).padStart(2,'0')+':'+match[2],
   endTime=String(Number(match[3])).padStart(2,'0')+':'+match[4];
 const start=Number(startTime.slice(0,2))*60+Number(startTime.slice(3)),
   end=Number(endTime.slice(0,2))*60+Number(endTime.slice(3));
 if(end<=start)throw new Error('終了時刻は開始時刻より後にしてください'); // 時間区分は料金用
 if(!place||place.length>100||remark.length>200)throw new Error('開催場所・備考を確認してください');
 return {date,place,startTime,endTime,hours,remark};
}
function renderScheduleMaster_(){
 const list=$('scheduleList');list.replaceChildren();
 if(!SC.rows.length){
  const e=document.createElement('p');e.className='schedule-note stage-system-message stage-system-message--info';
  e.setAttribute('role','status');e.setAttribute('aria-live','polite');
  e.textContent='本日以降の開催予定はありません。';list.append(e);return;
 }
 for(const row of SC.rows){
  const card=document.createElement('div');card.className='schedule-card';
  const head=document.createElement('div');head.className='schedule-card-head';
  const title=document.createElement('span');title.textContent='📅 '+scheduleDateLabel_(row.date);
  const status=document.createElement('span');status.textContent=row.enabled?'✔ 確定済':'⏳ 未確定';
  status.style.color=row.enabled?'#2e7d32':'#666';head.append(title,status);
  const details=document.createElement('div');details.className='schedule-card-detail';
  const hours=document.createElement('span');hours.textContent='🕒 '+row.startTime+'-'+row.endTime+
   ' ('+row.hours+'h) '+row.place;
  details.append(hours);
  if(row.remark){const memo=document.createElement('span');memo.textContent='📝 '+row.remark;details.append(memo);}
  const actions=document.createElement('div');actions.className='schedule-card-actions';
  for(const [action,label,css] of [['edit','修正','btn-outline'],['delete','削除','btn-danger'],['confirm',row.enabled?'確定済':'確定','btn-green']]){
   const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.className=css;
   btn.disabled=row.enabled&&action!=='delete';
   if(!btn.disabled)btn.addEventListener('click',()=>action==='edit'?openScheduleEditor_(row):confirmScheduleAction_(action,row));
   actions.append(btn);
  }
  card.append(head,details,actions);list.append(card);
 }
}
async function loadScheduleMaster_(isCurrent=()=>true){
 const d=await call('/api/schedule/list');
 if(!isCurrent())return;
 if(!Array.isArray(d?.schedules)||d.schedules.some(r=>!r?.practiceId||
   !scheduleDateValid_(r.date)||!Number.isSafeInteger(r.version)||typeof r.enabled!=='boolean')){
  throw new Error('練習日程マスタの取得結果を確認できません');
 }
 SC.rows=d.schedules.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
 renderScheduleMaster_();
}
function openScheduleMaster_(){
 gateEdit();close('manageDialog');
 SC.rows=[];$('scheduleList').textContent='練習日程を読み込んでいます…';
 $('scheduleAdd').disabled=true;
 return readScreen_('scheduleDialog','練習日程マスタを読み込んでいます…',
  isCurrent=>loadScheduleMaster_(isCurrent),
  ()=>$('scheduleAdd').disabled=false);
}
function updateScheduleWeekday_(){
 const date=$('scheduleDate').value;
 if(!scheduleDateValid_(date)){$('scheduleWeekday').textContent='';return;}
 syncPayoutWeekday_('scheduleDate','scheduleWeekday');
}
function openScheduleEditor_(row=null){
 SC.editing=row;
 $('scheduleEditTitle').textContent=row?'日程の修正':'日程の追加';
 $('scheduleDate').min=today();
 $('scheduleDate').value=row?.date||today();
 updateScheduleWeekday_();
 $('scheduleTimeSlot').value=row?row.startTime+'-'+row.endTime:'9:00-13:00';
 $('scheduleHours').value=String(row?.hours||4);
 const place=$('schedulePlace');
 for(const option of Array.from(place.options))if(option.dataset.custom==='1')option.remove();
 if(row?.place&&!Array.from(place.options).some(option=>option.value===row.place)){
  const custom=new Option(row.place,row.place);custom.dataset.custom='1';place.add(custom);
 }
 place.value=row?.place||'曽谷公民館';$('scheduleRemark').value=row?.remark||'';
 dialog('scheduleEditDialog');
}
async function saveScheduleMaster_(event){
 event.preventDefault();
 const original=SC.editing;
 await guard(async()=>{
  gateEdit();
  const data=scheduleFormPayload_(),id=original?.practiceId||('PR-'+uuid());
  const result=await call('/api/schedule/change',{operationId:uuid(),action:original?'edit':'add',
   practiceId:id,expectedVersion:original?.version??0,...data});
  if(result?.practiceId!==id||result.action!==(original?'edit':'add')||
     result.version!==(original?original.version+1:1))
    throw new Error('保存結果を確認できません。最新の日程を読み直してください');
  close('scheduleEditDialog');SC.editing=null;
  await loadScheduleMaster_();
  toast(original?'日程を修正しました':'日程を追加しました');
 },'日程を保存しています…');
}
async function confirmScheduleAction_(action,row){
 let description=scheduleDateLabel_(row.date)+'　'+row.place+'\n日程を確定しますか？';
 if(action==='delete'){
  let preview=null;
  await guard(async()=>{
   preview=await call('/api/schedule/delete-preview',{practiceId:row.practiceId,
     expectedVersion:row.version});
   if(preview?.practiceId!==row.practiceId||preview?.version!==row.version||
     preview.canDelete!==true||!preview.counts)
    throw new Error('削除内容が変わりました。日程を更新してください');
  },'関連データを確認しています…');
  if(!preview)return;
  const counts=preview.counts,group=n=>Number(counts[n]||0);
  const match=group('試合セッション')+group('試合版管理')+group('試合操作履歴');
  description=scheduleDateLabel_(row.date)+'　'+row.place+
    '\n参加'+group('出欠回答')+'件／集金'+group('集金記録')+
    '件／収支'+group('全体収支管理表')+'件／現金'+group('現金確認記録')+
    '件／試合'+match+'件／QR'+group('閲覧リンク')+
    '件も削除します。\n復旧用の記録は残します。削除しますか？';
 }
 SC.action={action,row};
 $('scheduleActionTitle').textContent=action==='delete'?'【日程の削除】':'【日程の確定】';
 $('scheduleActionText').textContent=description;
 $('scheduleActionSubmit').textContent=action==='delete'?'削除する':'確定する';
 $('scheduleActionSubmit').className=action==='delete'?'btn-danger':'btn-green';
 dialog('scheduleActionDialog');
}
async function executeScheduleAction_(){
 const target=SC.action;close('scheduleActionDialog');if(!target)return;
 await guard(async()=>{
  gateEdit();const {action,row}=target;
  const result=await call('/api/schedule/change',{operationId:uuid(),action,
    practiceId:row.practiceId,expectedVersion:row.version});
  if(result?.practiceId!==row.practiceId||result.action!==action||
     result.version!==row.version+1)
    throw new Error('操作結果を確認できません。最新の日程を読み直してください');
  SC.action=null;await loadScheduleMaster_();
  if(action==='delete'&&S.practiceId===row.practiceId)S.practiceId='';
  if(action==='confirm'||action==='delete')await reload(true);
  toast(action==='delete'?'日程と関連データを削除しました':'日程を確定しました');
 },'日程を更新しています…');
}


// v0.16.38b: proxy visitor registration uses the same authenticated LIFF.
// Only the registrar's member ID from GAS is saved; visitors never log in.
const VIS={practices:[],draft:null,unknownResult:false};
function validateVisitorPractices_(value){
 if(!Array.isArray(value?.practices)||value.practices.some(p=>!p?.practiceId||
  !scheduleDateValid_(p.date)||p.date<today()||!p.enabled||
  typeof p.place!=='string'||typeof p.startTime!=='string'||typeof p.endTime!=='string'))
  throw new Error('参加登録できる日程を確認できません');
 return value.practices.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
}
function renderVisitorPracticeOptions_(){
 const select=$('visitorPractice'),rows=VIS.practices,chosen=select.value;
 select.replaceChildren(...rows.map(p=>new Option(
  window.SMDate.practiceLabel(p),p.practiceId)));
 const preferred=rows.find(p=>p.practiceId===chosen)||rows[0];
 if(preferred)select.value=preferred.practiceId;
 $('visitorSubmit').disabled=!preferred;
 $('visitorStatus').textContent=preferred?'':'受付中の練習日程がありません';
}
function openVisitorForm_(){
 gateEdit();close('manageDialog');
 VIS.practices=[];VIS.draft=null;VIS.unknownResult=false;
 $('visitorMinePractice').replaceChildren(new Option('',''));
 $('visitorMinePractice').value='';$('visitorMinePractice').disabled=true;
 $('visitorPractice').value='';
 $('visitorNewFormSection').open=false;
 $('visitorName').value='';$('visitorKana').value='';$('visitorMemo').value='';
 $('visitorSubmit').disabled=true;
 $('visitorPractice').replaceChildren(new Option('',''));
 $('visitorMineCards').textContent='申請状況を読み込んでいます…';
 return readScreen_('visitorDialog','開催日とビジター申請状況を読み込んでいます…',
  async isCurrent=>{
   const [response]=await Promise.all([
    call('/api/visitor/practices'),window.SMVisitor.loadMine(isCurrent)]);
   if(!isCurrent())return;
   VIS.practices=validateVisitorPractices_(response);
   renderVisitorPracticeOptions_();
  });
}
function visitorFormDraft_(){
 const practiceId=$('visitorPractice').value,practice=VIS.practices.find(p=>p.practiceId===practiceId);
 const name=$('visitorName').value.normalize('NFKC').replace(/[\s\u3000]+/g,'');
 const nameKana=$('visitorKana').value.normalize('NFKC').replace(/[\s\u3000]+/g,'');
 const memo=$('visitorMemo').value.trim();
 if(!practice||practice.date<today())throw new Error('参加希望日を選択してください');
 if(!name||name.length>60||/^[=+@]/.test(name)||nameKana.length>100||memo.length>200)
  throw new Error('お名前・カナ・備考を確認してください');
 return {practiceId,name,nameKana,memo,practice};
}
async function confirmVisitorForm_(e){
 e.preventDefault();
 try{
  if(VIS.unknownResult)throw new Error('前回の登録結果が不明です。画面を開き直して確認してください');
  const d=visitorFormDraft_();VIS.draft=d;
  $('visitorConfirmText').textContent=window.SMDate.date(d.practice.date)+' '+d.name+
   'さんをビジター登録申請しますか？ 管理者が承認するまで参加者一覧には表示されません。';
  dialog('visitorConfirmDialog');
 }catch(e){await window.SMStageUX.showError(e);}
}
async function registerVisitor_(){
 const d=VIS.draft;close('visitorConfirmDialog');if(!d)return;
 await guard(async()=>{
  if(VIS.unknownResult)throw new Error('登録結果が不明です。申請状況を更新して確認してください。');
  const requestId='VR-'+uuid(),participantId='PV-'+uuid();
  let result;
  try{
   result=await call('/api/visitor/request',{
    operationId:uuid(),requestId,participantId,
    practiceId:d.practiceId,name:d.name,nameKana:d.nameKana,memo:d.memo
   });
  }catch(error){
   if(!Number.isInteger(error?.status)||error.status>=500){
    VIS.unknownResult=true;$('visitorSubmit').disabled=true;
   }
   throw error;
  }
  if(result?.requestId!==requestId||result.participantId!==participantId||
     result.practiceId!==d.practiceId||result.status!=='pending'||result.version!==0){
   VIS.unknownResult=true;$('visitorSubmit').disabled=true;
   throw new Error('申請結果が不明です。申請状況を更新して確認してください。');
  }
  VIS.draft=null;
  $('visitorName').value='';$('visitorKana').value='';$('visitorMemo').value='';
  // Keep the integrated screen open: the newly submitted request must be
  // visible ABOVE the next empty registration form.
  try{
   // Keep a newly sent request visible even when its date is not nearest.
   $('visitorMinePractice').value=d.practiceId;
   await window.SMVisitor.loadMine();$('visitorNewFormSection').open=false;
  }
  catch(_){
   $('visitorStatus').textContent='申請は受け付けられました。申請状況を「更新」で確認してください。';
  }
  toast(d.name+'さんのビジター申請を受け付けました');
 },'ビジターの登録申請を送信しています…');
}


// v0.16.45: authenticated personal LINE attendance, never visitor proxy.
// Every successful send is dated on the GAS server via 操作履歴.
const AT={practices:[],answers:[],selected:'',uncertain:false};
function memberAttendanceSelected_(){
 return AT.answers.find(a=>a.practiceId===AT.selected)||null;
}
function renderMemberAttendance_(){
 const select=$('attendancePractice'),previous=AT.selected;
 select.replaceChildren(...AT.practices.map(p=>new Option(
  window.SMDate.date(p.date)+'　'+(p.place||'開催場所未登録')+
  '　'+p.startTime+'～'+p.endTime,p.practiceId)));
 AT.selected=AT.practices.some(p=>p.practiceId===previous)?previous:
   (AT.practices[0]?.practiceId||'');
 select.value=AT.selected;
 const response=memberAttendanceSelected_();
 $('attendanceAttending').value=response?.attending===false?'absent':'attend';
 $('attendanceMemo').value=response?.memo||'';
 const first=response?.reportedAt?window.SMDate.dateTimeJst(response.reportedAt,false):'未記録';
 const latest=response?.lastReportedAt?window.SMDate.dateTimeJst(response.lastReportedAt,false):'未記録';
 $('attendanceLastDate').textContent='初回参加連絡：'+first+
   (first!==latest?'　最終連絡：'+latest:'');
 const message=$('attendanceNotice');
 message.textContent=AT.uncertain?'送信結果が不明です。「更新」で最新の連絡を確認してください':
  !AT.practices.length?'受付中の練習日程がありません':
  response?.locked?'この日程は対戦表作成済み、または収支確定済みです':'';
 message.hidden=!message.textContent;
 $('attendanceSave').disabled=AT.uncertain||!response||response.locked;
}
async function loadMemberAttendance_(isCurrent=()=>true){
 const result=await call('/api/attendance/mine');
 if(!isCurrent())return;
 if(!result||!Array.isArray(result.practices)||!Array.isArray(result.answers))
  throw new Error('参加連絡の取得結果を確認できません');
 const unique=new Set();
 for(const row of result.answers){
  if(!row.practiceId||unique.has(row.practiceId)||typeof row.attending!=='boolean'||
   typeof row.locked!=='boolean')
   throw new Error('参加連絡の版番号または日程を確認できません');
  unique.add(row.practiceId);
 }
 AT.practices=result.practices;AT.answers=result.answers;AT.uncertain=false;
 renderMemberAttendance_();
}
function openMemberAttendance_(){
 close('manageDialog');
 AT.practices=[];AT.answers=[];AT.uncertain=true;
 $('attendancePractice').replaceChildren(new Option('',''));
 $('attendanceSave').disabled=true;
 return readScreen_('attendanceDialog','本人の参加連絡を読み込んでいます…',
  isCurrent=>loadMemberAttendance_(isCurrent));
}
async function saveMemberAttendance_(event){
 event.preventDefault();
 const selected=memberAttendanceSelected_();
 if(!selected||selected.locked||AT.uncertain)return;
 await guard(async()=>{
  const request={operationId:uuid(),practiceId:AT.selected,
   attending:$('attendanceAttending').value==='attend',
   memo:$('attendanceMemo').value.trim(),expectedVersion:selected.version};
  if(request.memo.length>200||/[\u0000-\u001f]/.test(request.memo))
   throw new Error('備考を確認してください');
  let result;
  try{result=await call('/api/attendance/submit',request);}
  catch(error){AT.uncertain=true;renderMemberAttendance_();throw error;}
  if(result?.practiceId!==request.practiceId||
   result?.participantId!==S.actor?.memberId||
   typeof result.reportedAt!=='string'||!Number.isSafeInteger(result.version)){
   AT.uncertain=true;renderMemberAttendance_();
   throw new Error('保存結果が不明です。「更新」で確認してください');
  }
  try{await loadMemberAttendance_();}
  catch(error){AT.uncertain=true;renderMemberAttendance_();throw error;}
  if(S.overview&&S.practiceId===request.practiceId)await reload(true);
  toast('参加連絡を送信しました');
 },'参加連絡を保存しています…');
}

// v0.16.38d: legacy participant roster/edit/delete, keyed only by fixed IDs.
// v0.16.43: stable member identity is read-only in participant edits.
// Unlinked LINE subject is shown explicitly; visitor identities remain separately editable.
const PM={practices:[],practiceId:'',people:[],editing:null,deleting:null,
  matchLocked:false,financeLocked:false,uncertain:false};
const PM_CATEGORIES={member:'メンバー',visitor:'ビジター',student:'学生',
 duty:'当番担当',shuttle:'シャトル担当'};
function participantDates_(){
 const sel=$('participantPractice'),previous=PM.practiceId;
 const upcoming=PM.practices.filter(p=>p.date>=today());
 const options=PM.practices.map(p=>new Option(
   window.SMDate.practiceLabel(p),p.practiceId));
 if(!options.length)options.unshift(new Option('未確定の練習日がありません',''));
 else if(!upcoming.length)options.unshift(new Option('日程を選択してください',''));
 sel.replaceChildren(...options);
 const selected=PM.practices.find(p=>p.practiceId===previous)||upcoming[0];
 sel.value=selected?.practiceId||'';
}
function isVisitorParticipant_(p){
 return p?.category==='visitor'||/^PV-/.test(String(p?.participantId||''));
}
function renderParticipantManager_(){
 const list=$('participantCards');list.replaceChildren();
 const blocked=PM.matchLocked||PM.financeLocked||PM.uncertain;
 const notice=$('participantNotice');
 notice.textContent=PM.matchLocked?'対戦表がある日程は修正・削除できません':
  PM.financeLocked?'収支確定済みのため修正・削除できません':
  PM.uncertain?'保存結果が不明です。更新してから操作してください':'';
 notice.hidden=!notice.textContent;
 if(!PM.people.length){
  const empty=document.createElement('p');empty.className='schedule-note stage-system-message stage-system-message--info';
  empty.setAttribute('role','status');empty.setAttribute('aria-live','polite');
  empty.textContent='この開催日の回答データはありません。';
  list.append(empty);return;
 }
 for(const p of PM.people){
  // Shared v7 card: name/status header, details and memo on the left,
  // edit/delete actions bottom-aligned on the right (all participant types).
  // Use textContent, never innerHTML with user-supplied names/notes.
  const card=document.createElement('div');card.className='participant-card-item';
  const head=document.createElement('div');head.className='participant-card-title';
  const person=document.createElement('span');person.className='participant-card-person';
  const name=document.createElement('span');name.className='participant-card-name';
  name.textContent='👤 '+p.name;
  const category=document.createElement('span');category.className='participant-card-category';
  category.textContent=PM_CATEGORIES[p.category]||p.category;
  person.append(name,category);
  const attending=document.createElement('span');
  attending.className='participant-card-attendance '+(p.attending?'is-attending':'is-absent');
  attending.textContent=p.attending?'参加':'欠席';
  head.append(person,attending);
  const content=document.createElement('div');content.className='participant-card-content';
  const info=document.createElement('div');info.className='participant-card-info';
  const details=document.createElement('div');details.className='participant-card-details';
  // Only participation dates and optional remarks are visible in this list.
  // Identity tokens must not appear in member or visitor cards.
  const displayDate=raw=>{
   if(!raw)return '未記録';
   const value=window.SMDate.dateTimeJst(raw,false);
   return /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(value)?value:'未記録';
  };
  const registered=document.createElement('span');
  registered.textContent='📅 登録日：'+displayDate(p.registeredAt);
  details.append(registered);
  const updated=document.createElement('span');
  updated.textContent='🕒 更新日：'+
   (!p.updatedAt?'未記録':p.updatedAt===p.registeredAt?'未更新':displayDate(p.updatedAt));
  details.append(updated);
  info.append(details);
  if(p.memo){
   const note=document.createElement('div');note.className='participant-card-memo';
   note.textContent='📝 '+p.memo;info.append(note);
  }
  const actions=document.createElement('div');actions.className='participant-card-buttons';
  for(const [action,label,style] of [
    ['edit','修正','participant-btn-edit'],
    ['delete','削除','participant-btn-delete']
  ]){
   const btn=document.createElement('button');btn.type='button';btn.className=style;
   btn.textContent=label;
   btn.disabled=blocked||(action==='delete'&&isVisitorParticipant_(p));
   if(action==='delete'&&isVisitorParticipant_(p))
    btn.title='ビジターの削除は管理者のビジター管理から却下してください';
   if(!btn.disabled)btn.addEventListener('click',()=>action==='edit'?
     openParticipantEditor_(p):confirmParticipantDelete_(p));
   actions.append(btn);
  }
  content.append(info,actions);card.append(head,content);list.append(card);
 }
}
async function loadParticipants_(isCurrent=()=>true){
 const selected=PM.practiceId;
 let answer=await call('/api/participant/list',{practiceId:selected});
 if(!isCurrent())return;
 // Keep the participant picker identical to collection: all unconfirmed
 // dates (including past), plus a confirmed practice only on today's date.
 // Confirmed-day read access never removes financeLocked server protection.
 const confirmedIds=new Set(answer?.confirmedPracticeIds||[]);
 const selectable=(answer?.practices||[])
  .filter(p=>p?.practiceId&&(!confirmedIds.has(p.practiceId)||p.date===today()))
  .sort((a,b)=>a.date.localeCompare(b.date)||
   String(a.startTime||'').localeCompare(String(b.startTime||''))||
   String(a.practiceId).localeCompare(String(b.practiceId)));
 const upcoming=selectable.filter(p=>p.date>=today());
 const target=selectable.some(p=>p.practiceId===selected)?selected:
  (upcoming[0]?.practiceId||'');
 if(target&&answer.practiceId!==target)
  answer=await call('/api/participant/list',{practiceId:target});
 if(!isCurrent())return;
 if(!Array.isArray(answer?.practices)||!Array.isArray(answer?.participants)||
  typeof answer.practiceId!=='string'||typeof answer.financeLocked!=='boolean'||
  typeof answer.matchLocked!=='boolean')throw new Error('参加者一覧の取得結果を確認できません');
 const unique=new Set();
 for(const p of answer.participants){
  if(!p.participantId||unique.has(p.participantId)||typeof p.name!=='string'||
     typeof p.attending!=='boolean'||!Number.isSafeInteger(p.version)||p.version<0)
   throw new Error('参加者一覧のIDまたは版番号が不正です');
  unique.add(p.participantId);
 }
 PM.practices=selectable;PM.practiceId=target;PM.people=target?answer.participants:[];
 PM.financeLocked=!target||answer.financeLocked;
 PM.matchLocked=!target||answer.matchLocked;PM.uncertain=false;
 participantDates_();$('participantPractice').value=PM.practiceId;
 renderParticipantManager_();
}
function openParticipantManager_(){
 // Opening the screen always defaults to the nearest selectable date today
 // or later. A manually selected past open date remains selectable afterward.
 const confirmedIds=new Set(S.overview?.confirmedPracticeIds||[]);
 const candidates=(S.overview?.practices||[])
  .filter(p=>p?.practiceId&&p.date>=today()&&
   (!confirmedIds.has(p.practiceId)||p.date===today()))
  .sort((a,b)=>a.date.localeCompare(b.date)||
   String(a.startTime||'').localeCompare(String(b.startTime||''))||
   String(a.practiceId).localeCompare(String(b.practiceId)));
 PM.practiceId=candidates[0]?.practiceId||'';
 gateEdit();close('manageDialog');
 PM.people=[];PM.practices=[];PM.financeLocked=true;PM.matchLocked=true;PM.uncertain=true;
 $('participantCards').textContent='参加者を読み込んでいます…';
 $('participantPractice').replaceChildren(new Option('',''));
 $('participantPractice').disabled=true;
 return readScreen_('participantDialog','参加者一覧を読み込んでいます…',
  isCurrent=>loadParticipants_(isCurrent),
  ()=>$('participantPractice').disabled=false);
}
function switchParticipantDate_(){
 PM.practiceId=$('participantPractice').value;
 $('participantCards').textContent='参加者を読み込んでいます…';
 return readScreen_('participantDialog','選択した日の参加者を読み込んでいます…',
  isCurrent=>loadParticipants_(isCurrent));
}
function openParticipantEditor_(p){
 if(PM.uncertain||PM.financeLocked||PM.matchLocked)return;
 PM.editing=p;
 const isVisitor=p.category==='visitor';
 $('participantVisitorIdentity').hidden=!isVisitor;
 $('participantMemberIdentity').hidden=isVisitor;
 $('participantMemberName').textContent=p.name;
 $('participantMemberKana').textContent=p.nameKana||'未登録';
 $('participantName').value=isVisitor?p.name:'';
 $('participantKana').value=isVisitor?(p.nameKana||''):'';
 $('participantAttendance').value=p.attending?'attend':'absent';
 const visitorOption=$('participantCategoryVisitor');
 visitorOption.hidden=!isVisitor;visitorOption.disabled=!isVisitor;
 $('participantCategory').value=p.category;
 $('participantCategory').disabled=isVisitor;
 $('participantMemo').value=p.memo||'';
 dialog('participantEditDialog');
}
function participantEditData_(){
 const p=PM.editing;
 if(!p)throw new Error('修正対象が見つかりません');
 const isVisitor=p.category==='visitor';
 const name=isVisitor?$('participantName').value.normalize('NFKC').replace(/[\s\u3000]+/g,''):p.name;
 const nameKana=isVisitor?$('participantKana').value.normalize('NFKC').replace(/[\s\u3000]+/g,''):(p.nameKana||'');
 const category=$('participantCategory').value;
 const memo=$('participantMemo').value.trim();
 if((category==='visitor')!==isVisitor)
  throw new Error('ビジターへの変更はできません。ビジター申請を使用してください');
 if(!name||name.length>60||nameKana.length>100||!PM_CATEGORIES[category]||
    memo.length>200||/^[=+@]/.test(name)||/^[=+@]/.test(nameKana))
  throw new Error('お名前・区分・備考を確認してください');
 return {practiceId:p.practiceId,participantId:p.participantId,
  action:'edit',expectedVersion:p.version,name,nameKana,
  category,attending:$('participantAttendance').value==='attend',memo};
}
async function saveParticipantEdit_(event){
 event.preventDefault();
 if(PM.uncertain)return;
 await guard(async()=>{
  gateEdit();const data=participantEditData_();
  let updated;
  try{updated=await call('/api/participant/change',{operationId:uuid(),...data});}
  catch(error){PM.uncertain=true;renderParticipantManager_();throw error;}
  if(updated?.participantId!==data.participantId||updated?.practiceId!==data.practiceId||
     updated?.action!=='edit'||updated?.version!==data.expectedVersion+1){
   PM.uncertain=true;renderParticipantManager_();
   throw new Error('修正結果が不明です。更新してから確認してください');
  }
  close('participantEditDialog');PM.editing=null;
  await loadParticipants_();
  if(S.practiceId===data.practiceId)await reload(true);
  toast('参加者を修正しました');
 },'参加者情報を保存しています…');
}
function confirmParticipantDelete_(p){
 if(PM.uncertain||PM.financeLocked||PM.matchLocked||isVisitorParticipant_(p))return;
 PM.deleting=p;
 $('participantDeleteText').textContent=p.name+'さんの回答行を本当に削除しますか？'+
  (p.collectionCompleted?'集金・帳簿残金も更新されます。':'');
 dialog('participantDeleteDialog');
}
async function deleteParticipant_(){
 const p=PM.deleting;close('participantDeleteDialog');
 if(!p||PM.uncertain||isVisitorParticipant_(p))return;
 await guard(async()=>{
  gateEdit();
  let updated;
  try{
   updated=await call('/api/participant/change',{operationId:uuid(),
    action:'delete',practiceId:p.practiceId,participantId:p.participantId,
    expectedVersion:p.version});
  }catch(error){PM.uncertain=true;renderParticipantManager_();throw error;}
  if(updated?.participantId!==p.participantId||updated?.practiceId!==p.practiceId||
     updated?.action!=='delete'||updated?.version!==p.version+1){
   PM.uncertain=true;renderParticipantManager_();
   throw new Error('削除結果が不明です。更新してから確認してください');
  }
  PM.deleting=null;await loadParticipants_();
  if(S.practiceId===p.practiceId)await reload(true);
  toast('参加者の回答を削除しました');
 },'参加者の回答を削除しています…');
}

function bind(){
 $('date').addEventListener('change',async()=>{
  S.practiceId=$('date').value;
  $('refresh').disabled=true; // a foreground date change also owns a read
  try{await guard(()=>reload(false),'開催日を読み込んでいます…');}
  finally{syncPaymentControls();}
 });
 $('refresh').addEventListener('click',async()=>{
  if($('refresh').disabled)return;
  $('refresh').disabled=true;
  try{
   await guard(async()=>{
    // An explicit/manual refresh retains the existing full-screen safety lock.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    await reload(true);
   },'データを更新しています…');
  }finally{
   syncPaymentControls();
  }
 });
 $('categoryDialog').addEventListener('close',()=>{S.modalTarget=null;});$('cancelCategory').addEventListener('click',()=>close('categoryDialog'));$('saveCategory').addEventListener('click',saveCategory);
 $('adjustment').addEventListener('change',()=>saveAmount('adjustment'));$('expense').addEventListener('change',()=>saveAmount('expense'));
 $('receiptBtn').addEventListener('click',()=>{if(!S.overview?.ledger||S.overview.ledger.status==='confirmed')return toast('領収書を登録できる未確定の収支行がありません');$('homeReceipt').click();});
 $('homeReceipt').addEventListener('change',()=>guard(async()=>{const file=$('homeReceipt').files?.[0];if(!file)return;gateEdit();
  try{const row=S.overview?.ledger;await uploadReceipt_(file,row);toast('領収書を登録しました');await reload(true);}
  finally{$('homeReceipt').value='';}
 },'領収書をアップロードしています…'));
 $('homeReceiptView').addEventListener('click',()=>viewReceipt_(S.overview.ledger.rowId));
 $('ledgerViewReceipt').addEventListener('click',()=>viewReceipt_(S.ledgerRow.rowId));
 $('receiptPreviewClose').addEventListener('click',()=>close('receiptPreviewDialog'));
 $('receiptPreviewDialog').addEventListener('close',clearReceiptPreview_);
 $('confirm').addEventListener('click',()=>{if(!S.overview?.ledger)return;ledgerAction('confirm',S.overview.ledger);});
 $('reimbursementBtn').addEventListener('click',()=>{$('payoutDate').value=today();syncPayoutWeekday_('payoutDate','payoutWeekday');$('reimbursementReceipt').disabled=false;dialog('reimbursementDialog');});
 $('payoutDate').addEventListener('change',()=>syncPayoutWeekday_('payoutDate','payoutWeekday'));
 $('ledgerPayoutDate').addEventListener('change',()=>syncPayoutWeekday_('ledgerPayoutDate','ledgerPayoutWeekday'));
 $('cancelReimbursement').addEventListener('click',()=>close('reimbursementDialog'));$('reimbursementForm').addEventListener('submit',submitReimbursement);
 $('manageBtn').addEventListener('click',()=>dialog('manageDialog'));$('closeManage').addEventListener('click',()=>close('manageDialog'));$('openLedger').addEventListener('click',openLedger);
 prepareCashDenominations();
 $('cashCounter').addEventListener('click',openCash);
 $('cashReset').addEventListener('click',()=>dialog('cashResetDialog'));
 $('cashResetCancel').addEventListener('click',()=>close('cashResetDialog'));
 $('cashResetConfirm').addEventListener('click',()=>{close('cashResetDialog');resetCashCounts();});
 $('cashSave').addEventListener('click',showCashSaveConfirm);
 $('cashSaveCancel').addEventListener('click',()=>close('cashSaveDialog'));
 $('cashSaveConfirm').addEventListener('click',saveCashAudit);
 $('cashClose').addEventListener('click',()=>{cashSnapshot=null;close('cashDialog');});

 $('manageSchedules').addEventListener('click',openScheduleMaster_);
 $('scheduleDate').addEventListener('change',updateScheduleWeekday_);
 $('scheduleDate').addEventListener('input',updateScheduleWeekday_);
 $('scheduleAdd').addEventListener('click',()=>openScheduleEditor_());
 $('scheduleClose').addEventListener('click',()=>close('scheduleDialog'));
 $('scheduleReload').addEventListener('click',()=>readScreen_('scheduleDialog','練習日程を更新しています…',
 isCurrent=>loadScheduleMaster_(isCurrent)));
 $('scheduleEditCancel').addEventListener('click',()=>close('scheduleEditDialog'));
 $('scheduleEditForm').addEventListener('submit',saveScheduleMaster_);
 $('scheduleActionCancel').addEventListener('click',()=>close('scheduleActionDialog'));
 $('scheduleActionSubmit').addEventListener('click',executeScheduleAction_);
 $('managePeople').addEventListener('click',openParticipantManager_);
 $('memberAttendanceStart').addEventListener('click',openMemberAttendance_);
 $('manageAttendance').addEventListener('click',openMemberAttendance_);
 $('attendancePractice').addEventListener('change',()=>{
  AT.selected=$('attendancePractice').value;renderMemberAttendance_();
 });
 $('attendanceReload').addEventListener('click',()=>readScreen_('attendanceDialog',
 '本人の参加連絡を更新しています…',isCurrent=>loadMemberAttendance_(isCurrent)));
 $('attendanceForm').addEventListener('submit',saveMemberAttendance_);
 $('attendanceCancel').addEventListener('click',()=>close('attendanceDialog'));
 $('participantPractice').addEventListener('change',switchParticipantDate_);

 $('participantReload').addEventListener('click',()=>readScreen_('participantDialog','参加者を更新しています…',
 isCurrent=>loadParticipants_(isCurrent)));
 $('participantClose').addEventListener('click',()=>close('participantDialog'));
 $('participantEditCancel').addEventListener('click',()=>close('participantEditDialog'));
 $('participantEditForm').addEventListener('submit',saveParticipantEdit_);
 $('participantDeleteCancel').addEventListener('click',()=>close('participantDeleteDialog'));
 $('participantDeleteConfirm').addEventListener('click',deleteParticipant_);
 $('visitorRegisterMenu').addEventListener('click',openVisitorForm_);
 $('visitorMemberStart').addEventListener('click',openVisitorForm_);
 $('visitorCancel').addEventListener('click',()=>close('visitorDialog'));
 $('visitorForm').addEventListener('submit',confirmVisitorForm_);
 $('visitorConfirmCancel').addEventListener('click',()=>close('visitorConfirmDialog'));
 $('visitorConfirmSave').addEventListener('click',registerVisitor_);
 $('ledgerMonth').addEventListener('change',()=>readLedgerScreen_(true));$('prevMonth').addEventListener('click',()=>shiftMonth(-1));$('nextMonth').addEventListener('click',()=>shiftMonth(1));
 $('closeLedger').addEventListener('click',()=>close('ledgerDialog'));$('newLedgerRow').addEventListener('click',()=>openEditor());
 $('ledgerKind').addEventListener('change',updateEditorKind);
 $('ledgerEditDate').addEventListener('change',()=>syncPayoutWeekday_('ledgerEditDate','ledgerEditWeekday'));
 $('ledgerEditDate').addEventListener('input',()=>syncPayoutWeekday_('ledgerEditDate','ledgerEditWeekday'));
 $('ledgerEditIncome').addEventListener('input',updateLedgerAmountValidity_);
 $('ledgerEditExpense').addEventListener('input',updateLedgerAmountValidity_);
 $('cancelLedgerEdit').addEventListener('click',()=>close('ledgerEditDialog'));$('ledgerEditForm').addEventListener('submit',submitEditor);
 $('cancelConfirmAction').addEventListener('click',()=>close('confirmActionDialog'));$('doConfirmAction').addEventListener('click',executeLedgerAction);
 $('closeModal').addEventListener('click',()=>close('modal'));
}
function shiftMonth(amount){
 const [year,month]=$('ledgerMonth').value.split('-').map(Number);
 const dt=new Date(Date.UTC(year,month-1+amount,1)),next=dt.toISOString().slice(0,7);
 if(next>(S.ledger?.maxMonth||today().slice(0,7)))return;
 $('ledgerMonth').value=next;readLedgerScreen_(true);
}
bind();
window.SMStageUX.run('読み込み中です…',boot)
 .then(()=>window.SMLiveAccess?.openFromCheckLink?.())
 .catch(e=>window.SMStageUX.showError(e));

// Match screen launch: current selected practice, same LINE login context.
if(document.getElementById("matchManage")){document.getElementById("matchManage").addEventListener("click",()=>{if(!CONFIG.liffId||CONFIG.liffId.includes("REPLACE_")){toast("対戦表LIFFが設定されていません");return;}const next=window.SMDate.nearestPractice(S.overview?.practices)?.practiceId||"";
 window.location.href="https://liff.line.me/"+encodeURIComponent(CONFIG.liffId)+"?practiceId="+encodeURIComponent(next);});}
