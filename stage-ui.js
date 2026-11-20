/* v0.16.20 - shared staging busy/error behavior for operation management.
 * Initial/manual reads and writes block interaction; passive polling stays unobtrusive.
 */
(function (w) {
 'use strict';
 const $ = id => document.getElementById(id);
 const busyDialog=$('stageBusyDialog'),errorDialog=$('stageErrorDialog');
 const errorOkay=$('stageErrorOkay'),main=document.querySelector('main');
 let processing=false,showingError=false;
 busyDialog.addEventListener('cancel',e=>e.preventDefault());
 busyDialog.addEventListener('close',()=>{
   if(processing&&!busyDialog.open)busyDialog.showModal();
 });
 errorDialog.addEventListener('cancel',e=>e.preventDefault());
 errorOkay.addEventListener('click',()=>errorDialog.close());
 errorDialog.addEventListener('close',()=>{showingError=false});
 function setBusy(active,label) {
   processing=active;
   if(main){main.inert=active;main.setAttribute('aria-busy',String(active));}
   for(const d of document.querySelectorAll('dialog[open]')){
     if(d!==busyDialog&&d!==errorDialog)d.inert=active;
   }
   if(active){
     $('stageBusyLabel').textContent=String(label||'処理中です…');
     if(!busyDialog.open)busyDialog.showModal();
   } else {
     if(busyDialog.open)busyDialog.close();
     for(const d of document.querySelectorAll('dialog')) {
       if(d!==busyDialog&&d!==errorDialog)d.inert=false;
     }
   }
 }
 async function run(label,action){
   if(processing||showingError)throw new Error('ほかの処理が進行中です。');
   setBusy(true,label);
   try{return await action();}finally{setBusy(false);}
 }
 // All errors use concise Japanese messages. Never display native browser
 // "Failed to fetch", upstream URLs, token values or stack traces.
 function errorDetails(e){
  if(e?.status===409)return {title:'内容が変わりました',message:'最新の内容を確認してください。'};
  if(e?.code==='OPERATION_UNCONFIRMED')
   return {title:'通信エラー',message:'通信がタイムアウトしました（15秒）。保存結果を更新で確認してください。'};
  if(e?.code==='REQUEST_TIMEOUT')
   return {title:'通信エラー',message:'通信がタイムアウトしました（15秒）。更新して再試行してください。'};
  const raw=String(e?.message||'');
  if(Number(e?.status)>=500||['NETWORK_ERROR','LINE_VERIFY_CONNECT_FAILED'].includes(e?.code)||
     /Failed to fetch|NetworkError|Load failed|fetch failed|通信に失敗|ネットワーク/i.test(raw))
   return {title:'通信エラー',message:'通信に失敗しました。更新して再試行してください。'};
  return {title:'操作できませんでした',message:raw||'再度お試しください。'};
 }
 function inlineError(message){
  const active=Array.from(document.querySelectorAll('dialog[open]'))
   .filter(d=>d!==busyDialog&&d!==errorDialog);
  const surface=active[active.length-1];
  const readState=surface?.querySelector?.('.stage-inline-read-status.stage-system-message--error');
  if(readState){readState.textContent=message;return;}
  if(surface){
   let note=surface.querySelector('.stage-inline-error');
   if(!note){
    note=document.createElement('p');
    note.className='stage-inline-error stage-system-message stage-system-message--error';
    note.setAttribute('role','alert');
    const region=surface.querySelector('.stage-message-region');
    if(region)region.insertAdjacentElement('afterbegin',note);
    else surface.querySelector('h2')?.insertAdjacentElement('afterend',note);
   }
   note.hidden=false;note.textContent=message;return;
  }
  // Home system notices occupy a single common upper banner region, even
  // when an overview failure has cleared the participant list.
  const home=$('stageInlineError');
  if(home){home.textContent=message;home.hidden=false;return;}
  const existing=document.querySelector('#list .stage-system-message--error');
  if(existing){existing.textContent=message;return;}
 }
 function clearInlineError(){
  const home=$('stageInlineError');if(home){home.hidden=true;home.textContent='';}
  for(const note of document.querySelectorAll('.stage-inline-error')){
   note.hidden=true;note.textContent='';
  }
 }
 async function showError(e){
  if(showingError||processing)return;
  const item=errorDetails(e);
  inlineError(item.message);
  $('stageErrorTitle').textContent=item.title;
  $('stageErrorMessage').textContent=item.message;
  const authHelp=$('stageLineAuthHelp');
  if(authHelp)authHelp.hidden=!(
   e?.code==='LINE_TOKEN_INVALID'||
   /LINE_TOKEN_INVALID/.test(String(e?.message||'')));
  showingError=true;errorDialog.showModal();
  errorOkay.focus({preventScroll:true});
  await new Promise(resolve=>errorDialog.addEventListener('close',resolve,{once:true}));
 }
 w.SMStageUX=Object.freeze({run,showError,errorDetails,clearInlineError,isBusy:()=>processing});
})(window);