/* Isolated administration boot: initial LIFF and session read are blocking. */
(function(){
 'use strict';
 const UI=window.SMSandboxUI;
 const status=document.getElementById('connectionStatus'),retry=document.getElementById('retryConnection');
 async function boot(){
   retry.hidden=true;
   const result=await UI.run('読み込み中です…',async()=>{
     if(!await window.SMWithdrawSandbox.begin('manage'))return false;
     const actor=await window.SMWithdrawSandbox.api('/api/session');
     if(actor?.role!=='admin')throw Error('この画面は検証用の管理者アカウント専用です。');
     window.SMLiveAccess.setup({api:window.SMWithdrawSandbox.api,actor});
     await window.SMLiveAccess.start();
     status.textContent='';status.hidden=true;
     return true;
   });
   if(!result.ok){status.textContent='読み込めませんでした。';retry.hidden=false;}
 }
 retry.addEventListener('click',boot);
 boot();
})();