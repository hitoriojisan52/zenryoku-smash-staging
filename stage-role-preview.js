/* v0.16.79 staging: role MENU preview ONLY; no backend role change. */
(function(w){
 'use strict';
 const $=id=>document.getElementById(id);
 const roles=Object.freeze({member:'メンバー',duty:'当番担当',admin:'管理者'});
 let actualRole='',initialized=false;
 const groups=Object.freeze({
  member:[['一般メンバー',['memberAttendanceStart','visitorMemberStart']]],
  duty:[['当番担当メニュー',['cashCounter','openLedger','managePeople','visitorRegisterMenu','matchManage']],
    ['検証用メニュー',['manageAttendance']]],
  admin:[['当番担当メニュー',['cashCounter','openLedger','manageSchedules','managePeople','visitorRegisterMenu','matchManage']],
    ['管理者メニュー',['visitorAdminMenu','manageAccess']],
    ['検証用メニュー',['manageAttendance']]]
 });
 function render(){
  const role=$('stageRolePreviewSelect').value;
  if(!Object.prototype.hasOwnProperty.call(groups,role))return;
  const list=$('stageRolePreviewList');list.replaceChildren();
  for(const [title,ids] of groups[role]){
   const section=document.createElement('section');section.className='stage-role-preview-group';
   const heading=document.createElement('h3');heading.textContent=title;section.append(heading);
   for(const id of ids){
    const original=$(id);if(!original)continue;
    const button=document.createElement('button');button.type='button';
    button.className='btn-outline';button.disabled=true;
    button.textContent=original.textContent.trim();
    section.append(button);
   }
   list.append(section);
  }
  $('stageRolePreviewActual').textContent=
   '実際の権限：'+(roles[actualRole]||'不明')+
   ' ／ 表示プレビュー：'+roles[role];
 }
 function open(){
  if(!actualRole)return;
  $('stageRolePreviewSelect').value=actualRole;
  render();
  const dlg=$('stageRolePreviewDialog');if(!dlg.open)dlg.showModal();
 }
 function init(){
  if(initialized)return;initialized=true;
  $('stageRolePreviewMenuOpen').addEventListener('click',open);
  $('stageRolePreviewMemberOpen').addEventListener('click',open);
  $('stageRolePreviewSelect').addEventListener('change',render);
  $('stageRolePreviewClose').addEventListener('click',()=>$('stageRolePreviewDialog').close());
 }
 init();
 w.SMRolePreview=Object.freeze({
  setup(actor){
   const role=actor?.role;
   if(!Object.prototype.hasOwnProperty.call(roles,role))return;
   actualRole=role;
   $('stageRolePreviewMenuOpen').disabled=false;
   $('stageRolePreviewMemberOpen').disabled=false;
  }
 });
})(window);
