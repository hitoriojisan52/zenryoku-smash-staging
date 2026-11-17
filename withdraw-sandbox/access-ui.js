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
     case 'approved': message='登録済みです。LINEのメニューから利用する機能を開いてください。';break;
     case 'pending': message='申請済みです。管理者の承認をお待ちください。';break;
     case 'not_requested': message='表示名を入力して登録を申請してください。';break;
     case 'rejected': message='以前の申請は却下されています。再申請できます。';break;
     case 'inactive': case 'withdrawal_processing': message='アカウントの処理中です。管理者にお問い合わせください。';break;
     default: message='現在の登録状態を確認できません。再読込してください。';
   }
   notice(message);
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
 }
 async function submit(){
   if(UI.isBusy()||!loaded||!['not_requested','rejected'].includes(accountState))return;
   const name=$('accessRegName').value.trim();
   if(!name){await UI.showError(new Error('表示名を入力してください。'));return;}
   const confirmed=await UI.confirm({title:'登録申請の確認',message:name+' さんで登録を申請しますか？',confirmLabel:'申請する'});
   if(!confirmed)return;
   await UI.run('登録申請を送信しています…',async()=>{
     try{
       const result=await api('/api/member/apply',{displayName:name});
       await refresh();
       if(!['pending','approved'].includes(accountState))throw Error('申請後の登録状態を確認できません。');
       return result;
     }catch(error){
       if(UI.isUncertain(error)){
         error.mutationUncertain=true;
         try{await refresh();}catch(_){loaded=false;renderStatus('');}
       }
       throw error;
     }
   },{success:'登録申請を受け付けました。'});
 }
 $('accessApply').addEventListener('click',()=>submit().catch(e=>UI.showError(e)));
 $('accessRefresh').addEventListener('click',()=>UI.run('登録状態を再取得しています…',refresh,{success:'最新の登録状態に更新しました。'}));
 window.SMAccess=Object.freeze({start});
})();