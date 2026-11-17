/* Isolated registration boot: initial LIFF and status read use screen-wide loading state. */
(function(){
 'use strict';
 const UI=window.SMSandboxUI;
 const status=document.getElementById('connectionStatus'),retry=document.getElementById('retryConnection');
 async function boot(){
   retry.hidden=true;
   const result=await UI.run('LINE認証と登録状態を確認しています…',async()=>{
     if(!await window.SMWithdrawSandbox.begin('register'))return false;
     await window.SMAccess.start({api:window.SMWithdrawSandbox.api});
     status.textContent='LINE認証と登録状態を確認しました。';
     return true;
   });
   if(!result.ok){status.textContent='接続を完了できませんでした。';retry.hidden=false;}
 }
 retry.addEventListener('click',boot);
 boot();
})();