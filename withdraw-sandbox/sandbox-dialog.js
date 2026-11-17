/* Dialog and bottom toast styled by shared operation management stylesheet. */
(function(global){
 'use strict';
 const $=id=>document.getElementById(id);
 const dlg=$('confirmActionDialog'),ok=$('doConfirmAction'),cancel=$('cancelConfirmAction'),toastEl=$('toast');
 let pending=null,timer=null;
 cancel.addEventListener('click',()=>{if(dlg.open)dlg.close('cancel');});
 ok.addEventListener('click',()=>{if(dlg.open)dlg.close('confirm');});
 dlg.addEventListener('close',()=>{if(!pending)return;const resolve=pending;pending=null;resolve(dlg.returnValue==='confirm');});
 function confirmAction(o){
   if(pending)return Promise.resolve(false);
   const options=o||{};
   $('confirmActionTitle').textContent=String(options.title||'確認');
   $('confirmActionText').textContent=String(options.message||'この操作を実行しますか？');
   ok.textContent=String(options.confirmLabel||'実行する');
   ok.className=options.danger?'sb-danger':'btn-blue';
   dlg.returnValue='';
   return new Promise(resolve=>{pending=resolve;dlg.showModal();});
 }
 function toast(s,isError){
   toastEl.textContent=String(s||'');
   toastEl.classList.toggle('error',!!isError);
   toastEl.classList.add('show');
   if(timer!==null)clearTimeout(timer);
   timer=setTimeout(()=>toastEl.classList.remove('show'),3500);
 }
 global.SMSandboxUI=Object.freeze({confirm:confirmAction,toast});
})(window);