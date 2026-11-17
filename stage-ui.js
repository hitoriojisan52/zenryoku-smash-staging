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
   if(e?.status===409)return {title:'内容が変わりました',message:'ほかの人が先に変更しました。\n最新の内容を確認してください。'};
   if(!e?.status ||e?.status>=500||['NETWORK_ERROR','REQUEST_TIMEOUT'].includes(e?.code))
     return {title:'通信エラー',message:'通信できませんでした。\n最新の情報を確認してください。'};
   return {title:'操作できませんでした',message:String(e?.message||'再度確認してください。')};
 }
 async function showError(e) {
   // Errors never disappear automatically and cannot be hidden by touching the backdrop.
   if(showingError||processing)return;
   const item=errorDetails(e);
   $('stageErrorTitle').textContent=item.title;
   $('stageErrorMessage').textContent=item.message;
   showingError=true;errorDialog.showModal();
   errorOkay.focus({preventScroll:true});
   await new Promise(resolve=>errorDialog.addEventListener('close',resolve,{once:true}));
 }
 w.SMStageUX=Object.freeze({run,showError,isBusy:()=>processing});
})(window);