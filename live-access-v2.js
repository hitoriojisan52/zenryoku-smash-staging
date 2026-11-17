/* v0.16.19 opt-in member administration UI for the existing staging LIVE page.
 * Enabled ONLY when ?accessUi=v2 is present. Original stage UI stays unchanged.
 * No withdrawal mutation endpoint, no rich-menu sync, no test fixture member IDs.
 */
(function () {
 'use strict';
 if(window.SM_STAGE_ACCESS_V2!==true)return;
 const $=id=>document.getElementById(id);
 const dialog=$('memberAccessDialog'),confirmDialog=$('accessConfirmV2');
 const cancel=$('accessConfirmCancelV2'),okay=$('accessConfirmOkayV2'),toastEl=$('toast');
 let api=null,actorRole='',actorMemberId='',busy=false,prompt=null,toastTimer=null;
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
 okay.addEventListener('click',()=>confirmDialog.close('yes'));
 dialog.addEventListener('cancel',event=>{if(busy||prompt)event.preventDefault();});
 function ask(o,error){
   if(busy||prompt)return Promise.resolve(false);
   const d=o||{};
   $('accessConfirmTitleV2').textContent=d.title||(error?'操作できませんでした':'確認');
   $('accessConfirmMessageV2').textContent=d.message||'';
   okay.textContent=d.label||(error?'閉じる':'実行する');
   okay.className=d.danger&&!error?'access-danger-v2':'btn-blue';
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
 function renderHistory(list){
   const section=$('memberAccessHistoryV2'),history=$('memberAccessWithdrawnV2');
   const supported=Array.isArray(list);
   section.hidden=!supported;history.replaceChildren();
   if(!supported)return;
   if(!list.length){history.append(item('p','access-help','退会履歴はありません。'));return;}
   for(const m of list){
     const row=item('div','live-access-row');
     row.append(item('span','live-access-name',String(m.name||'名前なし')+(m.state==='completed'?'（退会済み）':'（確認中）')));
     if(m.withdrawnAt)row.append(item('span','access-help',window.SMDate?.dateTimeJst?.(m.withdrawnAt)||String(m.withdrawnAt)));
     history.append(row);
   }
 }
 function render(snapshot){
   const pending=$('memberAccessPending'),members=$('memberAccessMembers');
   pending.replaceChildren();members.replaceChildren();
   if(!snapshot.pending.length)pending.append(item('p','access-help','申し込みはありません。'));
   for(const p of snapshot.pending){
     const row=item('div','live-access-row');
     row.append(item('span','live-access-name',p.name));
     const accept=item('button','btn-blue','承認');
     accept.type='button';accept.addEventListener('click',()=>decide(p,true));
     const reject=item('button','btn-outline','却下');
     reject.type='button';reject.addEventListener('click',()=>decide(p,false));
     row.append(accept,reject);pending.append(row);
   }
   for(const m of snapshot.members){
     const row=item('div','live-access-row'),label=item('span','live-access-name',m.name+(m.active?'':'（停止中）'));
     const select=item('select','live-access-select');
     select.setAttribute('aria-label',m.name+' さんの役割');
     for(const [v,t] of [['member','一般メンバー'],['duty','当番担当'],['admin','管理者']])select.add(new Option(t,v));
     select.value=m.role;
     const isSelf=m.memberId===actorMemberId;
     if(isSelf||!m.active){
       const current=item('span','stage-role-readonly',select.options[select.selectedIndex]?.text||'現在の役割');
       const note=item('small','stage-role-note',isSelf?'自分の権限は変更できません。':'停止中のため変更できません。');
       row.append(label,current,note);members.append(row);
       continue;
     }
     const change=item('button','btn-blue','変更');change.type='button';change.disabled=true;
     select.addEventListener('change',()=>{change.disabled=select.value===m.role;});
     change.addEventListener('click',()=>setRole(m,select));
     row.append(label,select,change);members.append(row);
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
   const confirmed=await ask({title:approve?'登録の承認':'登録の却下',
     message:p.name+' さんの申し込みを'+(approve?'承認':'却下')+'しますか？',
     label:approve?'承認する':'却下する',danger:!approve});
   if(!confirmed)return;
   await mutate('/api/member/manage/decide',
     {requestId:p.requestId,approve,operationId:crypto.randomUUID()},
     approve?'承認':'却下',
     data=>!data.pending.some(x=>x.requestId===p.requestId));
 }
 async function setRole(m,select){
   if(busy||prompt||m.memberId===actorMemberId||!m.active||select.value===m.role)return;
   const role=select.value,label=select.options[select.selectedIndex]?.text||role;
   const confirmed=await ask({title:'役割の変更',message:m.name+' さんを「'+label+'」に変更しますか？',label:'変更する'});
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
 $('memberAccessTitle').textContent='👥 メンバー管理';
 for(const h of dialog.querySelectorAll('h3')){
   h.textContent=h.nextElementSibling?.id==='memberAccessPending'?'登録の申し込み':'メンバーの役割';
 }
 const help=dialog.querySelector('.access-help');if(help)help.hidden=true;
 const actions=dialog.querySelector('.modal-actions');
 const detail=item('details','access-history-v2');detail.id='memberAccessHistoryV2';detail.hidden=true;
 const summary=item('summary','', '退会履歴を見る');detail.append(summary,item('div','',''));detail.children[1].id='memberAccessWithdrawnV2';
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
   setup(o){
     api=o?.api;actorRole=o?.actor?.role||'';actorMemberId=o?.actor?.memberId||'';
     $('manageAccess').hidden=actorRole!=='admin';
     $('manageSchedules').hidden=actorRole!=='admin';
     if(actorRole!=='admin'&&dialog.open)dialog.close();
   }
 });
})(window);