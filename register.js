/* Self-contained LINE registration page.
 * Production path: rich menu LIFF URL -> register.html endpoint.
 * No access to the management home, finance, attendance, admin, or role switch.
 * No user-controlled LINE ID. Worker verifies the LINE ID token separately.
 */
(function (w) {
 'use strict';
 const $=id=>document.getElementById(id);
 const cfg=w.SMASH_CONFIG||{};
 const TIMEOUT_MS=15000;
 const KINDS=['info','success','warning','error'];
 let token='',busy=false,writing=false,confirmed=null,readEpoch=0;
 const status=$('registrationStatus'),form=$('registrationForm'),refresh=$('registrationRefresh');
 const errorDialog=$('registrationError'),confirmDialog=$('registrationConfirm');
 function setStatus(kind,message,spinning=false){
  for(const k of KINDS)status.classList.toggle('stage-system-message--'+k,k===kind);
  status.classList.toggle('stage-inline-read-loading',kind==='info'&&spinning);
  status.textContent=message;
  status.setAttribute('aria-busy',String(spinning));
 }
 function controls(){
  refresh.disabled=busy||writing||!token;
  $('registrationSubmit').disabled=busy||writing;
  $('registrationCancel').disabled=writing;
  $('registrationConfirmSave').disabled=writing;
 }
 function readableError(e){
  if(e?.code==='REQUEST_TIMEOUT')return '通信がタイムアウトしました（15秒）。更新してください。';
  if(e?.code==='OPERATION_UNCONFIRMED')return '通信がタイムアウトしました（15秒）。更新して申請状況を確認してください。';
  if(e?.code==='NETWORK_ERROR'||e?.status>=500||/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(String(e?.message||'')))
   return '通信に失敗しました。更新して再度お試しください。';
  const detail=String(e?.message||'');
  if(e?.status===401)return 'LINE認証を確認できません。LINEから開き直してください。';
  if(e?.status===409)return '登録状況が変わりました。更新してください。';
  // Only known Japanese service errors are suitable for user-facing output.
  // Native fetch/JSON/parser exceptions may include English or private URLs.
  if(detail.length<=120&&/[ぁ-んァ-ヶ一-龯]/.test(detail)&&
     !/https?:\/\//i.test(detail))return detail;
  return '処理を完了できませんでした。更新して再度お試しください。';
 }
 function showError(e){
  const message=readableError(e);
  setStatus('error',message);
  $('registrationErrorText').textContent=message;
  if(!errorDialog.open)errorDialog.showModal();
 }
 function deadlineError(write){
  const e=new Error('15秒の通信期限を超えました');
  e.code=write?'OPERATION_UNCONFIRMED':'REQUEST_TIMEOUT';return e;
 }
 async function api(path,payload={},write=false){
  if(!token)throw Error('LINE認証が完了していません。');
  if(!cfg.apiBaseUrl||!/^https:\/\//.test(cfg.apiBaseUrl))throw Error('接続先が設定されていません。');
  const controller=!write&&typeof AbortController!=='undefined'?new AbortController():null;
  let timer,expired=false;
  const timeout=new Promise((_,reject)=>{
   timer=setTimeout(()=>{
    expired=true;if(controller)controller.abort();reject(deadlineError(write));
   },TIMEOUT_MS);
  });
  // A write may commit after the client deadline. Do not abort or automatically retry it.
  const task=(async()=>{
   const response=await fetch(cfg.apiBaseUrl.replace(/\/$/,'')+path,{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
    cache:'no-store',body:JSON.stringify(payload),...(controller?{signal:controller.signal}:{})
   });
   const body=await response.json();
   if(!response.ok||body?.ok!==true){
    const error=Error(body?.error||'処理に失敗しました。');
    error.status=response.status;error.code=body?.code||'';throw error;
   }
   return body.data;
  })();
  try{return await Promise.race([task,timeout]);}
  catch(e){
   if(expired||e?.name==='AbortError')throw deadlineError(write);
   throw e;
  }finally{clearTimeout(timer);}
 }
 function showRegistrationState(data){
  const state=String(data?.status||'');
  form.hidden=true;
  switch(state){
   case 'not_requested':
    form.hidden=false;setStatus('success','利用申請ができます。');break;
   case 'rejected':
    form.hidden=false;setStatus('warning','前回の申請は却下されました。再申請できます。');break;
   case 'pending':
    setStatus('success','利用申請は承認待ちです。');break;
   case 'approved':
    setStatus('success','利用登録済みです。');break;
   case 'inactive':
    setStatus('warning','利用停止中です。管理者に確認してください。');break;
   case 'withdrawal_processing':
    setStatus('warning','退会処理中です。');break;
   default:
    form.hidden=true;setStatus('warning','利用申請状況を確認できません。');break;
  }
 }
 async function readStatus(){
  if(busy||writing||!token)return;
  const epoch=++readEpoch;
  busy=true;form.hidden=true;
  setStatus('info','利用申請状況を読み込んでいます…',true);controls();
  try{
   const result=await api('/api/member/status');
   if(epoch===readEpoch)showRegistrationState(result);
  }catch(e){
   if(epoch===readEpoch)showError(e);
  }finally{
   if(epoch===readEpoch){busy=false;controls();}
  }
 }
 async function submit(){
  if(writing||busy||!confirmed)return;
  const payload=confirmed;confirmed=null;confirmDialog.close();
  writing=true;form.hidden=true;
  setStatus('info','利用申請を送信しています…',true);controls();
  try{
   const result=await api('/api/member/apply',payload,true);
   showRegistrationState(result);
  }catch(e){
   // Uncertain writes are never retried; the next Update is a read-only status lookup.
   showError(e);
  }finally{writing=false;controls();}
 }
 async function begin(){
  setStatus('info','LINE認証を確認しています…',true);
  try{
   if(!cfg.registrationLiffId){
    setStatus('warning','LINE利用申請の準備中です。LIFF設定後にご利用いただけます。');
    refresh.disabled=true;return;
   }
   if(typeof w.liff?.init!=='function')throw Error('LINE SDKを読み込めませんでした。');
   let timer;
   try{
    await Promise.race([
     w.liff.init({liffId:cfg.registrationLiffId,withLoginOnExternalBrowser:true}),
     new Promise((_,reject)=>{timer=setTimeout(()=>reject(deadlineError(false)),TIMEOUT_MS);})
    ]);
   }finally{clearTimeout(timer);}
   if(!w.liff.isLoggedIn()){w.liff.login({redirectUri:w.location.href});return;}
   token=w.liff.getIDToken()||'';
   if(!token)throw Error('LINE認証を確認できませんでした。');
   await readStatus();
  }catch(e){showError(e);}
 }
 $('registrationClose').addEventListener('click',()=>{
  if(w.liff?.isInClient?.()){w.liff.closeWindow();return;}
  if(w.history.length>1)w.history.back();
  else setStatus('warning','LINEアプリに戻って画面を閉じてください。');
 });
 refresh.addEventListener('click',readStatus);
 $('registrationErrorClose').addEventListener('click',()=>errorDialog.close());
 $('registrationForm').addEventListener('submit',e=>{
  e.preventDefault();if(busy||writing)return;
  const displayName=$('registrationName').value.normalize('NFKC').replace(/[\s\u00a0\u3000]+/g,'');
  const nameKana=$('registrationKana').value.normalize('NFKC').replace(/[\s\u00a0\u3000]+/g,'');
  if(!displayName||displayName.length>30||/[\r\n<>]/.test(displayName)||
     !/^[ァ-ヶー・]{1,60}$/.test(nameKana)){
   showError(Error('氏名と全角カタカナの氏名カナを確認してください。'));return;
  }
  confirmed={displayName,nameKana};
  $('registrationConfirmText').textContent='入力した氏名で利用申請しますか？';
  if(!confirmDialog.open)confirmDialog.showModal();
 });
 $('registrationCancel').addEventListener('click',()=>{confirmed=null;confirmDialog.close();});
 confirmDialog.addEventListener('cancel',()=>{if(!writing)confirmed=null;});
 $('registrationConfirmSave').addEventListener('click',submit);
 controls();
 begin();
})(window);
