/* Isolated registration boot: initial LIFF and status read use screen-wide loading state. */
(function(){
 'use strict';
 const UI=window.SMSandboxUI;
 const status=document.getElementById('connectionStatus'),retry=document.getElementById('retryConnection');
 async function boot(){
   retry.hidden=true;
   const result=await UI.run('読み込み中です…',async()=>{
     if(!await window.SMWithdrawSandbox.begin('register'))return false;
     await window.SMAccess.start({api:window.SMWithdrawSandbox.api});
     status.textContent='';status.hidden=true;
     return true;
   });
   if(!result.ok){status.textContent='読み込めませんでした。';retry.hidden=false;}
 }
 retry.addEventListener('click',boot);
 boot();
})();