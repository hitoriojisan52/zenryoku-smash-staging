/* Independent LIFF registration. No /api/session, overview, or management screen. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const config=window.SMASH_CONFIG||{};
const status=$('registrationStatus'),form=$('registrationForm'),refresh=$('registrationRefresh');
const submit=$('registrationSubmit'),confirmDialog=$('registrationConfirm');
let token='',busy=false,prepared=null,requestId=0;
function setStatus(kind,message){
 status.className='stage-system-message stage-system-message--'+kind+(kind==='info'?' stage-inline-read-loading':'');
 status.textContent=message;
}
function controls(on){busy=on;refresh.disabled=on;submit.disabled=on;$('registrationConfirmSubmit').disabled=on;}
function safeError(e){
 if(e?.code==='OPERATION_UNCONFIRMED')return '通信がタイムアウトしました。申請結果を更新で確認してください。';
 if(e?.code==='REQUEST_TIMEOUT')return '通信がタイムアウトしました。更新して再試行してください。';
 if(e?.status===409)return '申請状況が変わりました。更新して確認してください。';
 const raw=String(e?.message||'');
 if(/Failed to fetch|NetworkError|Load failed|fetch failed|通信に失敗|ネットワーク/i.test(raw)||e?.status>=500)return '通信に失敗しました。更新して再試行してください。';
 return raw||'処理に失敗しました。';
}
function error(e){
 const message=safeError(e);setStatus('error',message);
 $('registrationErrorMessage').textContent=message;
 if(!$('registrationError').open)$('registrationError').showModal();
}
async function request(path,payload,write=false){
 if(!token)throw new Error('LINE認証を確認できません。');
 const base=String(config.apiBaseUrl||'').replace(/\/$/,'');
 if(!/^https:\/\//.test(base))throw new Error('API接続設定がありません。');
 const controller=!write&&typeof AbortController!=='undefined'?new AbortController():null;
 let timer,expired=false;
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{
  expired=true;controller?.abort();const e=new Error('通信がタイムアウトしました。');
  e.code=write?'OPERATION_UNCONFIRMED':'REQUEST_TIMEOUT';reject(e);
 },15000);});
 const work=(async()=>{
  const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
   body:JSON.stringify(payload||{}),cache:'no-store',...(controller?{signal:controller.signal}:{})});
  let value;try{value=await res.json();}catch{throw new Error('サーバーの応答を確認できませんでした。');}
  if(!res.ok||!value.ok){const e=new Error(value.error||'処理に失敗しました。');e.status=res.status;e.code=value.code;throw e;}
  return value.data;
 })();
 try{return await Promise.race([work,timeout]);}
 catch(e){if(expired||e?.name==='AbortError'){const x=new Error('通信がタイムアウトしました。');x.code=write?'OPERATION_UNCONFIRMED':'REQUEST_TIMEOUT';throw x;}throw e;}
 finally{clearTimeout(timer);}
}
async function check(){
 if(busy)return;controls(true);const id=++requestId;form.hidden=true;setStatus('info','利用申請状況を確認しています…');
 try{
  const data=await request('/api/member/status');
  if(id!==requestId)return;
  const state=String(data?.status||'not_requested');
  if(state==='not_requested'){setStatus('success','利用申請はまだありません。');form.hidden=false;}
  else if(state==='rejected'){setStatus('warning','前回の申請は却下されました。再申請できます。');form.hidden=false;}
  else if(state==='pending')setStatus('warning','利用申請は承認待ちです。');
  else if(state==='approved')setStatus('success','利用登録済みです。');
  else if(state==='inactive')setStatus('warning','利用停止中です。管理者に確認してください。');
  else if(state==='withdrawal_processing')setStatus('warning','退会処理中です。');
  else setStatus('warning','申請状況を確認してください。');
 }catch(e){error(e);}
 finally{controls(false);}
}
function validate(){
 const displayName=$('registrationName').value.normalize('NFKC').replace(/[\s\u00a0\u3000]+/g,'');
 const nameKana=$('registrationKana').value.normalize('NFKC').replace(/[\s\u00a0\u3000]+/g,'');
 if(!displayName||displayName.length>30||!/^[ァ-ヶー・]{1,60}$/.test(nameKana))throw new Error('氏名と全角カタカナの氏名カナを確認してください。');
 return {displayName,nameKana};
}
async function apply(){
 if(busy||!prepared)return;
 confirmDialog.close();controls(true);form.hidden=true;setStatus('info','利用申請を送信しています…');
 try{
  const result=await request('/api/member/apply',prepared,true);
  setStatus('success',result?.status==='approved'?'利用登録済みです。':'利用申請を受け付けました。管理者の承認をお待ちください。');
  prepared=null;
 }catch(e){prepared=null;error(e);/* No automatic write retry; user must refresh. */}
 finally{controls(false);}
}
async function init(){
 controls(true);setStatus('info','LINE認証を確認しています…');
 try{
  if(!window.liff)throw new Error('LINE SDKを読み込めませんでした。');
  const liffId=config.registrationLiffId||config.liveLiffId;
  if(!liffId||liffId.includes('REPLACE_'))throw new Error('利用申請用LIFFが未設定です。');
  let timer;
  try{await Promise.race([liff.init({liffId,withLoginOnExternalBrowser:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('LINE認証がタイムアウトしました。'),{code:'REQUEST_TIMEOUT'})),15000);})]);}
  finally{clearTimeout(timer);}
  if(!liff.isLoggedIn()){liff.login({redirectUri:location.href});return;}
  token=liff.getIDToken();if(!token)throw new Error('LINE認証情報を取得できませんでした。');
 }catch(e){controls(false);error(e);return;}
 controls(false);await check();
}
form.addEventListener('submit',e=>{e.preventDefault();if(busy)return;try{prepared=validate();confirmDialog.showModal();}catch(errorValue){error(errorValue);}});
$('registrationConfirmSubmit').addEventListener('click',apply);
$('registrationCancel').addEventListener('click',()=>{prepared=null;confirmDialog.close();});
$('registrationErrorClose').addEventListener('click',()=>$('registrationError').close());
refresh.addEventListener('click',check);
$('registrationClose').addEventListener('click',()=>{if(window.liff?.isInClient?.())window.liff.closeWindow();else if(history.length>1)history.back();else window.close();});
init();
})();