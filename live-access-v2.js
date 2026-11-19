/* v0.16.19 opt-in member administration UI for the existing staging LIVE page.
 * Enabled ONLY when ?accessUi=v2 is present. Original stage UI stays unchanged.
 * v0.16.53: withdrawal is available only if BOTH stage backend gates report
 * enabled; admin two-step confirmation, no automatic retries or rich-menu sync.
 */
(function () {
 'use strict';
 if(window.SM_STAGE_ACCESS_V2!==true)return;
 const $=id=>document.getElementById(id);
 const dialog=$('memberAccessDialog'),confirmDialog=$('accessConfirmV2'),
  editDialog=$('memberAccessEditV1656'),editForm=$('memberAccessEditFormV1656');
 const cancel=$('accessConfirmCancelV2'),okay=$('accessConfirmOkayV2'),toastEl=$('toast');
 let api=null,actorRole='',actorMemberId='',busy=false,prompt=null,toastTimer=null,
  editingMember=null;
 const status=s=>{$('memberAccessStatus').textContent=String(s||'');};
 function item(tag,cls,label){
   const x=document.createElement(tag);if(cls)x.className=cls;
   if(label!==undefined)x.textContent=String(label);
   return x;
 }
 function ensureAdmin(){if(actorRole!=='admin'||typeof api!=='function')throw Error('管理者のみ利用できます。');}
 function isUncertain(e){
   return e instanceof TypeError || ['NETWORK_ERROR','REQUEST_TIMEOUT','OPERATION_UNCONFIRMED'].includes(e?.code)||Number(e?.status)>=500;
 }
 function restoreFocus(prev){if(prev?.isConnected&&!prev.inert)prev.focus({preventScroll:true});}
 function closePrompt(){
   if(!prompt)return;
   const old=prompt;prompt=null;
   confirmDialog.setAttribute('role','dialog');cancel.hidden=false;
   const value=confirmDialog.returnValue==='yes';restoreFocus(old.focus);old.resolve(value);
 }
 confirmDialog.addEventListener('close',closePrompt);
 confirmDialog.addEventListener('cancel',event=>{if(prompt?.error)event.preventDefault();});
 cancel.addEventListener('click',()=>confirmDialog.close('no'));
 editDialog.addEventListener('cancel',event=>{if(busy||prompt)event.preventDefault();});
 $('memberAccessEditCancelV1656').addEventListener('click',()=>{
  if(!busy&&!prompt)editDialog.close();
 });
 okay.addEventListener('click',()=>confirmDialog.close('yes'));
 dialog.addEventListener('cancel',event=>{if(busy||prompt)event.preventDefault();});
 function ask(o,error){
   if(busy||prompt)return Promise.resolve(false);
   const d=o||{};
   $('accessConfirmTitleV2').textContent=d.title||(error?'操作できませんでした':'確認');
   $('accessConfirmMessageV2').textContent=d.message||'';
   okay.textContent=d.label||(error?'閉じる':'実行する');
   okay.className=error?'btn-blue':d.danger?'access-danger-v2':'btn-green';
   confirmDialog.setAttribute('role',error?'alertdialog':'dialog');
   cancel.hidden=Boolean(error);
   confirmDialog.returnValue='';
   const focus=document.activeElement;
   return new Promise(resolve=>{
     prompt={resolve,focus,error:Boolean(error)};
     confirmDialog.showModal();
     (error?okay:cancel).focus({preventScroll:true});
   });
 }
 function errorDetails(e){
   if(e?.appliedButRefreshFailed)return {title:'変更結果を確認してください',message:'更新された可能性があります。\n「更新」で最新状態をご確認ください。'};
   if(e?.mutationUncertain)return {title:'変更結果を確認してください',message:'通信が切れました。\n「更新」で結果をご確認ください。'};
   if(e?.status===409)return {title:'内容が変わりました',message:'別の人が先に変更しました。\n「更新」してからやり直してください。'};
   if(isUncertain(e))return {title:'通信エラー',message:'通信できませんでした。\n「更新」でやり直してください。'};
   return {title:'操作できませんでした',message:String(e?.message||'もう一度お試しください。')};
 }
 function showError(e){const info=errorDetails(e);return ask({title:info.title,message:info.message,label:'閉じる'},true);}
 function toast(s){
   if(!toastEl)return;toastEl.textContent=String(s||'');
   toastEl.classList.add('show');clearTimeout(toastTimer);
   toastTimer=setTimeout(()=>toastEl.classList.remove('show'),3500);
 }
 async function run(label,fn,success){
   if(busy||prompt)return false;
   busy=true;let failure=null;
   try{await window.SMStageUX.run(label,fn);}
   catch(e){failure=e;}
   finally{busy=false;}
   if(failure){await showError(failure);return false;}
   if(success)toast(success);
   return true;
 }
 // Use the same name/status/details/actions card layout as 参加者一覧.
 // No browser confirm() fallback, no editable self/admin singleton.
 const ROLE_LABEL={member:'一般メンバー',duty:'当番担当',admin:'管理者'};
 function cardLine(text){
  return item('span','',text);
 }
 function cardFrame(name,badge,status){
  const card=item('div','participant-card-item');
  const head=item('div','participant-card-title');
  const person=item('span','participant-card-person');
  person.append(item('span','participant-card-name','👤 '+name));
  if(badge)person.append(item('span','participant-card-category',badge));
  head.append(person);
  // The member roster has no active/inactive switch. Do not draw an empty
  // status badge for an active member; preserve meaningful stopped/history states.
  if(status)head.append(item('span','participant-card-attendance',status));
  const content=item('div','participant-card-content');
  const info=item('div','participant-card-info');
  const details=item('div','participant-card-details');
  info.append(details);
  const actions=item('div','participant-card-buttons member-role-actions');
  content.append(info,actions);card.append(head,content);
  return {card,head,details,actions};
 }
 function renderHistory(list){
  const section=$('memberAccessHistoryV2'),history=$('memberAccessWithdrawnV2');
  // v0.16.23: do not confuse an unsupported history API with an empty history.
  section.hidden=!Array.isArray(list);history.replaceChildren();
  if(!Array.isArray(list))return;
  if(!list.length){
   history.append(item('p','access-help','退会履歴はありません。'));
   return;
  }
  for(const m of list){
   const completed=m.state==='completed';
   const line=item('div','live-access-row access-history-line');
   line.append(item('span','live-access-name',String(m.name||'名前なし')+
    (completed?'（退会済み）':'（確認中）')));
   if(m.withdrawnAt){
    const formatted=window.SMDate?.dateTimeJst?.(m.withdrawnAt,false)||String(m.withdrawnAt);
    line.append(item('span','access-history-date','退会日：'+String(formatted).split(' ')[0]));
   }
   history.append(line);
  }
 }
 function render(snapshot){
  const pending=$('memberAccessPending'),members=$('memberAccessMembers');
  pending.replaceChildren();members.replaceChildren();
  if(!snapshot.pending.length)pending.append(item('p','access-help','申請はありません。'));
  for(const p of snapshot.pending){
   const frame=cardFrame(String(p.name||'名前なし'),'利用申請','承認待ち');
   frame.details.append(cardLine('氏名カナ：'+(p.nameKana||'未登録')));
   if(p.requestedAt)frame.details.append(cardLine('📅 申請日：'+
    (window.SMDate?.dateTimeJst?.(p.requestedAt,false)||String(p.requestedAt))));
   const accept=item('button','btn-green','承認');
   accept.type='button';accept.addEventListener('click',()=>decide(p,true));
   const reject=item('button','btn-danger','却下');
   reject.type='button';reject.addEventListener('click',()=>decide(p,false));
   frame.actions.append(accept,reject);
   pending.append(frame.card);
  }
  const adminCount=snapshot.members.filter(m=>m.active&&m.role==='admin').length;
  for(const m of snapshot.members){
   const frame=cardFrame(String(m.name||'名前なし'),'',m.active?'':'停止中');
   frame.card.classList.add('member-access-card-v1656');
   frame.details.append(cardLine('氏名カナ：'+(m.nameKana||'未登録')));
   frame.details.append(cardLine('LINE ID：'+(m.lineUserId||'未紐付け')));
   frame.details.append(cardLine('📅 利用登録日：'+(
    m.registeredAt?(window.SMDate?.dateTimeJst?.(m.registeredAt,false)||String(m.registeredAt)):'未記録')));
   const isSelf=m.memberId===actorMemberId;
   const soleAdmin=m.role==='admin'&&adminCount<=1;
   // Keep every control visible. Do not allow role changes to the signed-in
   // admin or the sole admin, and never withdraw any administrator.
   const roleLocked=isSelf||!m.active||soleAdmin;
   const select=item('select','live-access-select');
   select.setAttribute('aria-label',m.name+' さんの権限');
   for(const [value,label] of Object.entries(ROLE_LABEL))
    select.add(new Option(label,value));
   select.value=m.role;
   select.disabled=roleLocked;
   frame.head.append(select); // upper-right of the participant-style card

   const edit=item('button','btn-blue','修正');
   edit.type='button';edit.disabled=!m.active;
   edit.addEventListener('click',()=>{
    if(edit.disabled||busy||prompt)return;
    openMemberEditor(m);
   });
   const change=item('button','btn-blue','権限変更');
   change.type='button';change.disabled=true;
   select.addEventListener('change',()=>{
    change.disabled=roleLocked||select.value===m.role;
   });
   change.addEventListener('click',()=>{
    if(roleLocked||select.disabled||change.disabled||busy||prompt)return;
    setRole(m,select);
   });
   const withdraw=item('button','btn-danger','退会');
   withdraw.type='button';
   withdraw.disabled=isSelf||!m.active||m.role==='admin'||snapshot.withdrawEnabled!==true;
   if(withdraw.disabled)withdraw.title='退会できません';
   withdraw.setAttribute('aria-label',m.name+' さんの退会');
   withdraw.addEventListener('click',()=>{
    if(withdraw.disabled||busy||prompt)return;
    withdrawMember(m);
   });
   frame.actions.append(edit,change,withdraw);
   members.append(frame.card);
  }
  renderHistory(snapshot.withdrawn);
  renderWithdrawPreviewV1624(snapshot.members);
 }

 // v0.16.24: Display-only example. This function never calls a mutation API.
 function renderWithdrawPreviewV1624(members){
   const section=$('memberAccessWithdrawPreviewV1624');
   if(!section)return;
   section.hidden=window.SM_STAGE_WITHDRAW_PREVIEW!==true||actorRole!=='admin';
   if(section.hidden)return;
   const checkButton=$('memberAccessWithdrawCheckButtonV1627');
   checkButton.hidden=window.SM_STAGE_WITHDRAW_CHECK!==true;
   const result=$('memberAccessWithdrawCheckResultV1627');
   result.hidden=true;result.textContent='';
   const count=members.filter(m=>m.active&&m.role!=='admin'&&m.memberId!==actorMemberId).length;
   $('memberAccessWithdrawPreviewStatusV1624').textContent=count
     ?'確認対象になり得る一般メンバー・当番担当は'+count+'名です。今回は退会しません。'
     :'現在、確認対象となる一般メンバー・当番担当はいません。管理者本人は対象外です。';
 }
 async function checkWithdrawConditionsV1627(){
   if(busy||prompt||actorRole!=='admin'||window.SM_STAGE_WITHDRAW_CHECK!==true)return;
   await run('退会条件を確認しています…',async()=>{
     const data=await api('/api/member/manage/withdraw/check',{});
     if(data?.readOnly!==true||data?.withdrawEnabled!==false||
       !Number.isInteger(data?.adminCount)||!Number.isInteger(data?.eligibleCandidateCount)||
       data.eligibleCandidateCount<0)throw Error('退会条件の確認結果が不正です。');
     const lines=[
       '登録管理者：'+data.adminCount+'名',
       '退会候補：'+data.eligibleCandidateCount+'名',
       '退会処理：無効（今回実行しません）'
     ];
     if(data.eligibleCandidateCount===0)lines.push('現在、退会可能な対象者はいません。');
     const result=$('memberAccessWithdrawCheckResultV1627');
     result.textContent=lines.join('\n');
     result.hidden=false;
   });
 }
 async function previewWithdrawV1624(){
   if(busy||prompt||actorRole!=='admin'||window.SM_STAGE_WITHDRAW_PREVIEW!==true)return;
   const first=await ask({title:'退会の確認（1/2）',
     message:'表示例のメンバーを使って確認します。\n実際の登録情報は変更しません。',
     label:'次へ'});
   if(!first)return;
   const second=await ask({title:'最後の確認（2/2）',
     message:'これは確認画面のテストです。\n退会処理・データ削除は行いません。',
     label:'確認を終える'});
   if(!second)return;
   toast('確認できました。退会はしていません。');
 }
 async function load(){
   ensureAdmin();
   const data=await api('/api/member/manage/list');
   if(!Array.isArray(data?.pending)||!Array.isArray(data?.members))throw Error('メンバー一覧を読み込めませんでした。');
   render(data);return data;
 }
 async function refresh(first){
   return run(first?'読み込み中です…':'一覧を更新しています…',async()=>{
     await load();status('');
   },first?'':'更新しました。');
 }
 async function mutate(path,payload,title,verify){
   return run(title+'を保存しています…',async()=>{
     try{await api(path,payload);}
     catch(error){
       if(isUncertain(error)||error?.status===409){
         error.mutationUncertain=isUncertain(error);
         try{await load();}catch(_){status('「更新」で最新状態を確認してください。');}
       }
       throw error;
     }
     let data;
     try{data=await load();}
     catch(e){e.appliedButRefreshFailed=true;throw e;}
     if(!verify(data)){const e=new Error('結果を確認できませんでした。');e.appliedButRefreshFailed=true;throw e;}
     status('');
   },title+'しました。');
 }
 async function decide(p,approve){
   if(busy||prompt)return;
   const confirmed=await ask({title:approve?'【登録の承認】':'【登録の却下】',
     message:p.name+' さんを'+(approve?'承認':'却下')+'しますか？',
     label:approve?'承認する':'却下する',danger:!approve});
   if(!confirmed)return;
   await mutate('/api/member/manage/decide',
     {requestId:p.requestId,approve,operationId:crypto.randomUUID()},
     approve?'承認':'却下',
     data=>!data.pending.some(x=>x.requestId===p.requestId));
 }
 // Registered member name and optional kana are the editable application fields.
 // Never edit LINE identity, memberId, roles, historical attendance or money.
 function openMemberEditor(m){
   if(busy||prompt||!m.active||actorRole!=='admin')return;
   editingMember=m;
   $('memberAccessEditNameV1656').value=m.name||'';
   $('memberAccessEditKanaV1657').value=m.nameKana||'';
   $('memberAccessEditStatusV1656').textContent='';
   editDialog.showModal();
   $('memberAccessEditNameV1656').focus({preventScroll:true});
 }
 editForm.addEventListener('submit',async event=>{
   event.preventDefault();
   if(busy||prompt||!editingMember)return;
   const m=editingMember;
   const name=$('memberAccessEditNameV1656').value.normalize('NFKC').replace(/[\s\u00a0\u3000]+/g,'');
   const nameKana=$('memberAccessEditKanaV1657').value.normalize('NFKC').replace(/[\s\u00a0\u3000]+/g,'');
   if(!name||name.length>30||/[\r\n<>]/.test(name)){
    $('memberAccessEditStatusV1656').textContent='氏名を1～30文字で入力してください。';
    return;
   }
   if(nameKana&&(nameKana.length>60||!(/^[ァ-ヶー・]+$/).test(nameKana))){
    $('memberAccessEditStatusV1656').textContent='氏名カナは全角カタカナで入力してください。';
    return;
   }
   editDialog.close();editingMember=null;
   if(name===m.name&&nameKana===(m.nameKana||''))return;
   await mutate('/api/member/manage/edit',{
      memberId:m.memberId,displayName:name,expectedName:m.name,
      nameKana,expectedKana:m.nameKana||'',operationId:crypto.randomUUID()
     },'修正',data=>data.members.some(x=>x.memberId===m.memberId&&x.name===name&&x.nameKana===nameKana));
 });
 /** v0.16.53: only the verified administrator may withdraw another
  * active nonadmin member from the connected test workbook. Never retry
  * automatically after a network/timeout/error/processing state. */
 async function withdrawMember(m){
   if(busy||prompt||actorRole!=='admin'||!m.active||
      m.role==='admin'||m.memberId===actorMemberId)return;
   const confirmed=await ask({title:'【退会確認】',
     message:m.name+' さんを退会させますか？\n過去の記録は保持します。',
     label:'退会する',danger:true});
   if(!confirmed)return;
   const operationId=crypto.randomUUID();
   await mutate('/api/member/manage/withdraw',
     {memberId:m.memberId,confirmMemberId:m.memberId,operationId},
     '退会',data=>{
      const disappeared=!data.members.some(x=>x.memberId===m.memberId);
      const historical=Array.isArray(data.withdrawn)&&
       data.withdrawn.some(x=>x.memberId===m.memberId&&x.state==='completed');
      return disappeared&&historical;
     });
 }
 async function setRole(m,select){
   if(busy||prompt||m.memberId===actorMemberId||!m.active||select.value===m.role)return;
   const role=select.value,label=select.options[select.selectedIndex]?.text||role;
   const confirmed=await ask({title:'【権限の変更】',message:m.name+' さんを「'+label+'」に変更しますか？',label:'変更する'});
   if(!confirmed)return; // Keep the pending local selection and enabled Change button.
   await mutate('/api/member/manage/role',
     {memberId:m.memberId,role,operationId:crypto.randomUUID()},
     '役割変更',
     data=>data.members.some(x=>x.memberId===m.memberId&&x.role===role));
 }
 async function open(){
   if(busy||prompt)return;
   ensureAdmin();
   const parent=$('manageDialog');if(parent?.open)parent.close();
   if(!dialog.open)dialog.showModal();
   await refresh(true);
 }
 $('memberAccessTitle').textContent='🔐 メンバー権限管理';
 // v0.16.23: collapsed disclosure, shown only when history is supported.
 const actions=dialog.querySelector('.modal-actions');
 const detail=item('details','access-history-v2');detail.id='memberAccessHistoryV2';
 detail.hidden=true;
 detail.append(item('summary','','退会履歴を見る'));
 const history=item('div','');history.id='memberAccessWithdrawnV2';
 detail.append(history);
 dialog.insertBefore(detail,actions);
 $('memberAccessRefresh').className='btn-blue';
 $('memberAccessRefresh').textContent='🔄 更新';
 $('memberAccessWithdrawPreviewButtonV1624').addEventListener('click',()=>previewWithdrawV1624());
 $('memberAccessWithdrawCheckButtonV1627').addEventListener('click',()=>checkWithdrawConditionsV1627());
 document.body.classList.add('access-v2-active');
 $('manageAccess').addEventListener('click',()=>open().catch(e=>showError(e)));
 $('memberAccessRefresh').addEventListener('click',()=>refresh(false));
 $('memberAccessClose').addEventListener('click',()=>{if(!busy&&!prompt&&dialog.open)dialog.close();});
 window.SMLiveAccess=Object.freeze({
   // Check-only LIFF link: open the admin panel after initial load releases its lock.
   async openFromCheckLink(){
     if(window.SM_STAGE_WITHDRAW_CHECK!==true||actorRole!=='admin')return false;
     await open();
     const checkButton=$('memberAccessWithdrawCheckButtonV1627');
     if(checkButton&&!checkButton.hidden)checkButton.scrollIntoView?.({block:'center'});
     return true;
   },
   setup(o){
     api=o?.api;actorRole=o?.actor?.role||'';actorMemberId=o?.actor?.memberId||'';
     $('manageAccess').hidden=actorRole!=='admin';
     $('manageSchedules').hidden=actorRole!=='admin';
     if(actorRole!=='admin'&&dialog.open)dialog.close();
   }
 });
})(window);