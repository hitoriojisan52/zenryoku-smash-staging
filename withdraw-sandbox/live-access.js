/* v0.16.34 sandbox default preview with explicit synthetic withdrawal test for synthetic 1630 member. No withdrawal mutation. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),UI=window.SMSandboxUI;
 let api=null,actorRole='',actorMemberId='';
 // UI preview is restricted to exactly one synthetic member on the isolated sheet.
 const WITHDRAW_PREVIEW_MEMBER_ID='M-TEST-WITHDRAW-1630';
 const WITHDRAW_PREVIEW_NAME='退会追加検証用（架空1630）';
 function node(tag,cls,value){
   const e=document.createElement(tag);if(cls)e.className=cls;
   if(value!==undefined)e.textContent=String(value);
   return e;
 }
 function status(s){$('memberAccessStatus').textContent=String(s||'');}
 function ensureAdmin(){if(actorRole!=='admin'||!api)throw Error('管理者以外は権限管理を利用できません。');}
 async function load(){
   ensureAdmin();
   const data=await api('/api/member/manage/list');
   if(!Array.isArray(data?.pending)||!Array.isArray(data?.members))throw Error('管理情報の応答が不正です。');
   const pending=$('memberAccessPending'),members=$('memberAccessMembers'),history=$('memberAccessWithdrawn');
   pending.replaceChildren();members.replaceChildren();history.replaceChildren();
   if(!data.pending.length)pending.append(node('p','access-help','申し込みはありません。'));
   for(const p of data.pending){
     const row=node('div','live-access-row'),name=node('span','live-access-name',p.name);
     const accept=node('button','btn-blue','承認'),reject=node('button','btn-outline','却下');
     accept.type=reject.type='button';
     accept.addEventListener('click',()=>decide(p,true));
     reject.addEventListener('click',()=>decide(p,false));
     row.append(name,accept,reject);pending.append(row);
   }
   for(const m of data.members){
     const row=node('div','live-access-row');
     const name=node('span','live-access-name',m.name+(m.active?'':'（停止中）'));
     const select=node('select','live-access-select');
     select.setAttribute('aria-label',m.name+' さんの権限');
     for(const [value,label] of [['member','一般メンバー'],['duty','当番担当'],['admin','管理者']])select.add(new Option(label,value));
     select.value=m.role;
     const immutable=!m.active||m.memberId===actorMemberId;
     select.disabled=immutable;
     const change=node('button','btn-blue','変更');change.type='button';change.disabled=true;
     select.addEventListener('change',()=>{change.disabled=immutable||select.value===m.role;});
     change.addEventListener('click',()=>setRole(m,select));
     row.append(name,select,change);
     // Default is read-only preview. The special execution query is never an authorization boundary.
     if(isWithdrawalPreviewTarget(m)){
       const exec=window.SMWithdrawSandbox?.withdrawUiEnabled===true;
       const action=node('button','sb-withdraw-action',
         exec?'架空1630を退会させる（実行テスト）':'退会確認（画面テスト）');
       action.type='button';
       action.setAttribute('aria-label',m.name+(exec?' の架空データ削除テスト':' の確認画面テスト'));
       action.addEventListener('click',()=>(
         exec?executeWithdrawalV1634(m):previewWithdrawalV1631(m)
       ).catch(e=>UI.showError(e)));
       const note=node('span','sb-preview-hint',
         exec?'架空メンバー1名限定・登録情報を削除':'画面テストのみ・退会処理は無効');
       row.append(action,note);
     }
     members.append(row);
   }
   if(!Array.isArray(data.withdrawn)||!data.withdrawn.length)history.append(node('p','access-help','退会履歴はありません。'));
   else for(const w of data.withdrawn){
     const row=node('div','live-access-row');
     row.append(node('span','live-access-name',String(w.name||'名称未設定')+(w.state==='completed'?'（退会済み）':'（処理中・確認が必要）')),
       node('span','access-help',UI.formatDate(w.withdrawnAt)));
     history.append(row);
   }
   return data;
 }
 async function refresh(){
   return UI.run('一覧を更新しています…',async()=>{await load();status('');},{success:'更新しました。'});
 }
 async function mutate(path,payload,description){
   return UI.run(description+'を処理しています…',async()=>{
     try{await api(path,payload);}
     catch(error){
       if(UI.isUncertain(error)||error?.status===409){
         error.mutationUncertain=UI.isUncertain(error);
         try{await load();status('最新状態を再取得しました。操作の結果を確認してください。');}
         catch(_){status('最新状態を取得できませんでした。もう一度「更新」を押してください。');}
       }
       throw error;
     }
     try{await load();}
     catch(error){
       error.appliedButRefreshFailed=true;
       status('更新は受け付けられましたが、一覧を再取得できません。「更新」で確認してください。');
       throw error;
     }
     status('');
   },{success:description+'しました。'});
 }
 async function decide(p,approve){
   if(UI.isBusy())return;
   const title=approve?'申し込みの承認':'申し込みの却下';
   const confirmed=await UI.confirm({
     title,
     message:p.name+' さんの申し込みを'+(approve?'承認':'却下')+'しますか？',
     confirmLabel:approve?'承認する':'却下する',danger:!approve
   });
   if(!confirmed)return;
   await mutate('/api/member/manage/decide',{
     requestId:p.requestId,approve,operationId:crypto.randomUUID()
   },approve?'承認':'却下');
 }
 async function setRole(m,select){
   if(UI.isBusy()||m.memberId===actorMemberId||!m.active||select.value===m.role)return;
   const role=select.value;
   const label=select.options[select.selectedIndex]?.text||role;
   const confirmed=await UI.confirm({
     title:'メンバー権限の変更',
     message:m.name+' さんを「'+label+'」に変更しますか？',
     confirmLabel:'変更する'
   });
   if(!confirmed){
     // Cancellation does not commit to GAS, nor does it discard the user's pending selection.
     // The original 'change' button state is retained so the user can retry confirmation.
     return;
   }
   await mutate('/api/member/manage/role',{
     memberId:m.memberId,role,operationId:crypto.randomUUID()
   },'権限変更');
 }
 function isWithdrawalPreviewTarget(m){
   return actorRole==='admin'&&m?.memberId===WITHDRAW_PREVIEW_MEMBER_ID&&
     m?.name===WITHDRAW_PREVIEW_NAME&&m?.role==='member'&&m?.active===true&&
     m.memberId!==actorMemberId;
 }
 async function previewWithdrawalV1631(member){
   if(UI.isBusy()||!isWithdrawalPreviewTarget(member))return;
   const first=await UI.confirm({
     title:'退会の確認（1/2）',
     message:member.name+' さんの退会確認画面を試します。\nこれは画面テストで、実際の登録情報は変更しません。',
     confirmLabel:'次へ'
   });
   if(!first)return;
   const second=await UI.confirm({
     title:'最後の確認（2/2）',
     message:member.name+' さんの確認画面テストを終えます。\n退会処理・データ削除は一切行いません。',
     confirmLabel:'確認を完了（退会しません）',danger:true
   });
   if(!second)return;
   // Authoritative read-only recheck. This function NEVER calls a mutation endpoint.
   await UI.run('対象の状態を確認しています…',async()=>{
     const latest=await api('/api/member/manage/list');
     if(!Array.isArray(latest?.members)||!Array.isArray(latest?.withdrawn))
       throw new Error('退会対象の状態を確認できません。更新してください。');
     const selected=latest.members.filter(m=>m.memberId===WITHDRAW_PREVIEW_MEMBER_ID);
     if(selected.length!==1||!isWithdrawalPreviewTarget(selected[0])||
       latest.withdrawn.some(m=>m.memberId===WITHDRAW_PREVIEW_MEMBER_ID)){
       throw new Error('対象者の状態が変わりました。更新してから確認してください。');
     }
     status('');
   },{success:'確認できました。実際の退会処理は行っていません。'});
 }
 async function executeWithdrawalV1634(member){
   if(UI.isBusy()||!isWithdrawalPreviewTarget(member)||
      window.SMWithdrawSandbox?.withdrawUiEnabled!==true)return;
   const first=await UI.confirm({
     title:'退会の確認（1/2）',
     message:member.name+' さんを退会させます。\n検証専用シートから登録情報を削除します。',
     confirmLabel:'次へ'
   });
   if(!first)return;
   const second=await UI.confirm({
     title:'最後の確認（2/2）',
     message:member.name+' さんの登録行を削除します。\nこの操作は取り消せません。',
     confirmLabel:'退会を実行（架空1630）',danger:true
   });
   if(!second)return;
   const operationId=crypto.randomUUID();
   await UI.run('退会処理中です…',async()=>{
     const before=await api('/api/member/manage/list');
     if(!Array.isArray(before?.members)||!Array.isArray(before?.withdrawn))
       throw new Error('退会対象の状態を確認できません。更新してください。');
     const selected=before.members.filter(m=>m.memberId===WITHDRAW_PREVIEW_MEMBER_ID);
     if(selected.length!==1||!isWithdrawalPreviewTarget(selected[0])||
        before.withdrawn.some(w=>w.memberId===WITHDRAW_PREVIEW_MEMBER_ID)){
       await load();
       throw new Error('退会対象の状態が変わりました。更新してから確認してください。');
     }
     let response;
     try{
       response=await api('/api/member/manage/withdraw',{
         memberId:WITHDRAW_PREVIEW_MEMBER_ID,
         confirmMemberId:WITHDRAW_PREVIEW_MEMBER_ID,
         operationId
       });
     }catch(error){
       if(UI.isUncertain(error)||error?.status===409){
         error.mutationUncertain=UI.isUncertain(error);
         try{await load();status('最新状態を再取得しました。退会結果を確認してください。');}
         catch(_){status('「更新」で最新状態を確認してください。');}
       }
       throw error;
     }
     try{
       const after=await load();
       const completed=(after?.withdrawn||[]).some(w=>w.memberId===WITHDRAW_PREVIEW_MEMBER_ID&&w.state==='completed');
       const exists=(after?.members||[]).some(m=>m.memberId===WITHDRAW_PREVIEW_MEMBER_ID);
       if(response?.status!=='withdrawn'||response?.memberId!==WITHDRAW_PREVIEW_MEMBER_ID||exists||!completed)
         throw new Error('退会結果を確認できません。最新の一覧を確認してください。');
     }catch(error){
       error.appliedButRefreshFailed=true;throw error;
     }
     status('');
   },{success:'架空メンバー1630の退会を確認しました。'});
 }
 async function start(){
   // This runs inside the initial UI.run() lock. Never skip loading because UI is busy.
   ensureAdmin();
   $('memberAccessDialog').hidden=true;
   $('memberAccessRefresh').disabled=true;
   status('読み込み中…');
   try {
     await load();
     status('');
     $('memberAccessDialog').hidden=false;
     $('memberAccessRefresh').disabled=false;
   } catch (error) {
     status('読み込めませんでした。');
     // Keep the list hidden until a successful retry finishes.
     throw error;
   }
 }
 $('memberAccessRefresh').addEventListener('click',()=>refresh().catch(e=>UI.showError(e)));
 window.SMLiveAccess=Object.freeze({
   start:start,
   setup(o){
     api=o?.api;actorRole=o?.actor?.role||'';actorMemberId=o?.actor?.memberId||'';
     // Wait for the first successful data fetch before showing the management list.
     $('memberAccessDialog').hidden=true;
     $('memberAccessRefresh').disabled=true;
   }
 });
})();