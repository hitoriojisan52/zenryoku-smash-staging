/* v0.16.83: isolated, authenticated LINE self-application.
 * No admin privileges, no ability to register on someone else's behalf.
 * Existing Worker /member/status and /member/apply perform authorization.
 */
(function(w){
 'use strict';
 const $=id=>document.getElementById(id),form=$('stageRegForm'),
  dlg=$('stageRegistrationDialog'),statusBox=$('stageRegStatus'),
  submit=$('stageRegSubmit'),refresh=$('stageRegRefresh'),
  name=$('stageRegName'),kana=$('stageRegKana');
 let api=null,busy=false,canApply=false,openedEpoch=0,submitted=false;
 function display(message,type='info',spinning=false){
  statusBox.textContent=String(message||'');
  for(const kind of ['info','warning','error'])
   statusBox.classList.toggle('stage-system-message--'+kind,type===kind);
  statusBox.classList.toggle('stage-inline-read-loading',spinning);
 }
 function controls(){
  refresh.disabled=busy;
  submit.disabled=busy||!canApply;
  name.disabled=busy||!canApply;
  kana.disabled=busy||!canApply;
 }
 async function status(){
  if(!api||busy)return;
  const epoch=++openedEpoch;busy=true;canApply=false;submitted=false;
  display('利用申請の状況を確認しています…','info',true);controls();
  try{
   const result=await api('/api/member/status');
   if(epoch!==openedEpoch||!dlg.open)return;
   switch(result?.status){
    case 'approved': display('利用登録済みです。管理メニューからご利用ください。');break;
    case 'pending': display('利用申請済みです。管理者の承認をお待ちください。');break;
    case 'rejected':
     canApply=true;display('前回の申請は却下されました。再申請できます。','warning');break;
    case 'not_requested':
     canApply=true;display('氏名と氏名カナを入力してください。');break;
    case 'withdrawal_processing':display('退会処理中のため申請できません。','warning');break;
    case 'inactive':display('利用停止中です。管理者に確認してください。','warning');break;
    default:throw Error('利用申請の状態を確認できません。');
   }
  }catch(e){
   if(epoch!==openedEpoch||!dlg.open)return;
   display(w.SMStageUX?.errorDetails?.(e)?.message||'利用申請の状況を取得できません。','error');
   void w.SMStageUX?.showError?.(e);
  }finally{
   if(epoch===openedEpoch){busy=false;controls();}
  }
 }
 function open(){
  if(!api)return;
  if(!dlg.open)dlg.showModal();
  void status();
 }
 async function apply(event){
  event.preventDefault();
  if(!canApply||busy||submitted)return;
  const displayName=name.value.normalize('NFKC').replace(/[\s\u00a0\u3000]+/g,''),
   nameKana=kana.value.normalize('NFKC').replace(/[\s\u00a0\u3000]+/g,'');
  if(!displayName||displayName.length>30||/[\r\n<>]/.test(displayName)){
   display('氏名を1～30文字で入力してください。','warning');return;
  }
  if(!nameKana||nameKana.length>60||!/^[ァ-ヶー・]+$/.test(nameKana)){
   display('氏名カナは全角カタカナで入力してください。','warning');return;
  }
  busy=true;submitted=true;controls();display('利用申請を送信しています…','info',true);
  try{
   const result=await api('/api/member/apply',{displayName,nameKana});
   if(!dlg.open)return;
   canApply=false;
   display(result?.status==='pending'?'利用申請を受け付けました。承認をお待ちください。':
    result?.status==='approved'?'既に利用登録済みです。':
    '申請結果を確認してください。');
  }catch(e){
   if(!dlg.open)return;
   canApply=false; // unknown result: never auto-submit the same form twice
   display('申請結果を確認できません。状況を更新してください。','error');
   void w.SMStageUX?.showError?.(e);
  }finally{busy=false;controls();}
 }
 $('stageRegistrationOpen').addEventListener('click',open);
 $('stageRegRefresh').addEventListener('click',status);
 $('stageRegClose').addEventListener('click',()=>{if(!busy)dlg.close();});
 form.addEventListener('submit',apply);
 dlg.addEventListener('close',()=>{openedEpoch++;});
 w.SMStageRegistration=Object.freeze({
  setup(options){if(typeof options?.api!=='function')return;api=options.api;},
  open,ready:()=>!!api
 });
})(window);
