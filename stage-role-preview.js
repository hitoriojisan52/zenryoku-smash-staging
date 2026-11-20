/* v0.16.80 — one-time staging-only self-role switch, not a role preview.
 * The verified LINE user is the ONLY identity; GAS binds the first eligible
 * administrator and requires a second synthetic admin before demotion.
 */
(function(w){
 'use strict';
 const $=id=>document.getElementById(id);
 const names=Object.freeze({member:'メンバー',duty:'当番担当',admin:'管理者'});
 const dialog=$('stageRolePreviewDialog'),confirm=$('stageRolePreviewConfirmDialog');
 const select=$('stageRolePreviewSelect'),save=$('stageRolePreviewSave'),
  close=$('stageRolePreviewClose'),status=$('stageRolePreviewActual');
 let api=null,currentRole='',canSwitch=false,canDemote=false,loading=false,saving=false,
  pendingTarget='',readEpoch=0;
 function message(text,type='info',spinning=false){
  status.textContent=text||'';
  for(const key of ['info','warning','error'])
   status.classList.toggle('stage-system-message--'+key,key===type);
  status.classList.toggle('stage-inline-read-loading',spinning);
 }
 function controls(){
  const target=select.value;
  select.disabled=loading||!canSwitch;
  save.disabled=loading||!canSwitch||!names[target]||target===currentRole||
   (currentRole==='admin'&&target!=='admin'&&!canDemote);
  close.disabled=saving;
 }
 async function refresh(epoch){
  loading=true;canSwitch=false;
  message('現在の権限と検証条件を読み込んでいます…','info',true);
  controls();
  try{
   const data=await api('/api/stage/self-role',{action:'status'});
   if(epoch!==readEpoch||!dialog.open)return;
   if(!data||!names[data.role]||typeof data.canSwitch!=='boolean')
    throw Error('権限情報の形式を確認できません');
   currentRole=data.role;canSwitch=data.canSwitch;canDemote=data.canDemote===true;
   select.value=currentRole;
   message('現在の権限：'+names[currentRole]+
    (canSwitch?'。切り換える権限を選択してください。':
     '。このLINEアカウントは検証用権限切換に登録されていません。'),
    canSwitch?'info':'warning');
  }catch(e){
   if(epoch!==readEpoch||!dialog.open)return;
   message('権限情報を読み込めませんでした：'+String(e?.message||e),'error');
  }finally{
   if(epoch===readEpoch){loading=false;controls();}
  }
 }
 function open(){
  if(!api||loading)return;
  if(!dialog.open)dialog.showModal();
  refresh(++readEpoch);
 }
 function ask(){
  if(loading||save.disabled||!canSwitch)return;
  const target=select.value;if(!names[target]||target===currentRole)return;
  pendingTarget=target;
  $('stageRolePreviewConfirmText').textContent='ご自身の権限を「'+names[currentRole]+
   '」から「'+names[target]+'」に変更しますか？ 保存後、運用管理ツールを再読み込みします。';
  $('stageRolePreviewConfirmSave').className=target==='member'?'btn-danger':'btn-green';
  if(!confirm.open)confirm.showModal();
 }
 async function change(){
  if(!pendingTarget||loading)return;
  const target=pendingTarget;pendingTarget='';
  confirm.close();
  if(!canSwitch||!names[target]||target===currentRole)return;
  const expected=currentRole;
  loading=true;saving=true;controls();
  try{
   await w.SMStageUX.run('ご自身の権限を変更しています…',async()=>{
    // Never resubmit this write automatically after a network interruption.
    const result=await api('/api/stage/self-role',{
     action:'change',role:target,expectedRole:expected,operationId:crypto.randomUUID()
    });
    if(result?.role!==target||result?.previousRole!==expected)
     throw Error('権限変更の結果を確認できません。再度画面を開いて現在の権限を確認してください');
    const verified=await api('/api/session');
    if(verified?.role!==target)
     throw Error('変更後の権限を確認できません。再度画面を開いて確認してください');
   });
   // Fresh session is essential: stale admin UI must never survive demotion.
   w.location.reload();
  }catch(e){
   // A timed-out mutation could have committed. Do not retry automatically.
   message('変更結果を確認できません：'+String(e?.message||e)+
    '。この画面を閉じて開き直し、現在の権限を確認してください。','error');
   canSwitch=false;loading=false;saving=false;controls();
  }
 }
 $('stageRolePreviewOpen').addEventListener('click',open);
 select.addEventListener('change',controls);
 save.addEventListener('click',ask);
 close.addEventListener('click',()=>{if(!saving)dialog.close();});
 dialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();});
 dialog.addEventListener('close',()=>{
  readEpoch++;pendingTarget='';
  if(!saving){loading=false;controls();}
 });
 $('stageRolePreviewConfirmCancel').addEventListener('click',()=>{
  pendingTarget='';confirm.close();
 });
 $('stageRolePreviewConfirmSave').addEventListener('click',change);
 confirm.addEventListener('cancel',()=>{pendingTarget='';});
 w.SMRolePreview=Object.freeze({
  setup(options){
   if(typeof options?.api!=='function'||!names[options?.role])return;
   api=options.api;
   $('stageRolePreviewOpen').disabled=false;
  }
 });
})(window);
