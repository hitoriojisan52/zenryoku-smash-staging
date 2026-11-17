/* v0.16.14 isolated registration UI; all network calls share the busy overlay. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),UI=window.SMSandboxUI;
 let api=null,accountState='',loaded=false;
 function notice(s){$('accessMessage').textContent=String(s||'');}
 function renderStatus(s){
   accountState=s||'';
   let message;
   switch(accountState){
     case 'approved': message='登録済みです';break;
     case 'pending': message='申請済みです。承認をお待ちください。';break;
     case 'not_requested': message='お名前を入力して申し込んでください。';break;
     case 'rejected': message='もう一度申し込めます。';break;
     case 'inactive': case 'withdrawal_processing': message='利用できません。管理者にご確認ください。';break;
     default: message='登録状況を確認できません。更新してください。';
   }
   notice(message);
   $('accessEntry').hidden=!loaded||!['not_requested','rejected'].includes(accountState);
   $('accessApply').disabled=!loaded||!['not_requested','rejected'].includes(accountState);
 }
 async function refresh(){
   $('accessApply').disabled=true;
   const data=await api('/api/member/status');
   loaded=true;renderStatus(data?.status);
   return data;
 }
 async function start(o){
   api=o?.api;
   if(typeof api!=='function')throw Error('登録状態を読み取るAPIが未設定です。');
   $('accessRegistration').hidden=false;
   $('accessApply').disabled=true;
   await refresh();
   $('accessRefresh').disabled=false;
 }
 async function submit(){
   if(UI.isBusy()||!loaded||!['not_requested','rejected'].includes(accountState))return;
   const name=$('accessRegName').value.trim();
   if(!name){await UI.showError(new Error('表示名を入力してください。'));return;}
   const confirmed=await UI.confirm({title:'登録の確認',message:name+' さんで申し込みますか？',confirmLabel:'申し込む'});
   if(!confirmed)return;
   await UI.run('登録申請を送信しています…',async()=>{
     let accepted=false;
     try{
       const result=await api('/api/member/apply',{displayName:name});
       accepted=true;
       await refresh();
       if(!['pending','approved'].includes(accountState))throw Error('申請後の登録状態を確認できません。');
       return result;
     }catch(error){
       if(accepted){
         error.appliedButRefreshFailed=true;
       }else if(UI.isUncertain(error)){
         error.mutationUncertain=true;
         try{await refresh();}catch(_){loaded=false;renderStatus('');}
       }
       throw error;
     }
   },{success:'申し込みました。'});
 }
 $('accessApply').addEventListener('click',()=>submit().catch(e=>UI.showError(e)));
 $('accessRefresh').addEventListener('click',()=>UI.run('登録状況を確認しています…',refresh,{success:'更新しました。'}));
 window.SMAccess=Object.freeze({start});
})();