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
 function errorDetails(e){
  if(e?.code==='OPERATION_UNCONFIRMED'||e?.mutationUncertain)
   return {title:'保存結果を確認してください',message:'15秒以内に応答がありません。保存済みの可能性があります。「更新」で確認してください。'};
  if(['REQUEST_TIMEOUT','LINE_VERIFY_TIMEOUT','GAS_TIMEOUT'].includes(e?.code))
   return {title:'通信タイムアウト',message:'15秒以内に応答がありません。「更新」で再確認してください。'};
  if(e?.status===409)return {title:'内容が変わりました',message:'別の操作で更新されました。「更新」で確認してください。'};
  if(Number(e?.status)>=500||e?.code==='NETWORK_ERROR'||
    /Failed to fetch|NetworkError|通信に失敗|Load failed/i.test(String(e?.message||'')))
   return {title:'通信エラー',message:'通信できませんでした。「更新」で確認してください。'};
  return {title:'操作できませんでした',message:String(e?.message||'内容を確認してください。')};
 }
 async function showError(e) {
   // Errors never disappear automatically and cannot be hidden by touching the backdrop.
   if(showingError||processing)return;
   const item=errorDetails(e);
   $('stageErrorTitle').textContent=item.title;
   $('stageErrorMessage').textContent=item.message;
   // Expose a safe LIFF recovery link only for an actual LINE auth failure.
   // Do not display, decode or log the ID token or the user's LINE subject.
   const authHelp=$('stageLineAuthHelp');
   if(authHelp)authHelp.hidden=!(
     e?.code==='LINE_TOKEN_INVALID'||
     /LINE_TOKEN_INVALID/.test(String(e?.message||'')));
   showingError=true;errorDialog.showModal();
   errorOkay.focus({preventScroll:true});
   await new Promise(resolve=>errorDialog.addEventListener('close',resolve,{once:true}));
 }
 w.SMStageUX=Object.freeze({run,showError,isBusy:()=>processing});
})(window);