/* v0.16.14 isolated administrator UI; shared modal, busy state, state recovery. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),UI=window.SMSandboxUI;
 let api=null,actorRole='',actorMemberId='';
 // This is an inert UI rehearsal. The API module continues to block actual withdrawal.
 const WITHDRAW_PREVIEW_MEMBER_ID='M-TEST-WITHDRAW-1618';
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
     // Show a rehearsal only for the exact synthetic target. No withdrawal API is called.
     if(m.memberId===WITHDRAW_PREVIEW_MEMBER_ID&&m.active&&m.role!=='admin'&&m.memberId!==actorMemberId){
       const practice=node('button','btn-outline sb-withdraw-preview','退会の確認テスト');
       practice.type='button';
       practice.setAttribute('aria-label',m.name+' さんの退会確認テスト');
       practice.addEventListener('click',()=>previewWithdrawal(m).catch(e=>UI.showError(e)));
       const note=node('span','sb-preview-hint','※ 退会は行いません');
       row.append(practice,note);
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
 async function previewWithdrawal(member){
   // Never accept an arbitrary member ID, even for the rehearsal.
   if(UI.isBusy()||actorRole!=='admin'||member?.memberId!==WITHDRAW_PREVIEW_MEMBER_ID||
      member?.role==='admin'||!member?.active||member.memberId===actorMemberId)return;
   const step1=await UI.confirm({
     title:'退会の確認（1/2）',
     message:member.name+' さんの退会手順を試します。\n今回は確認だけです。',
     confirmLabel:'次へ'
   });
   if(!step1)return;
   const step2=await UI.confirm({
     title:'最後の確認（2/2）',
     message:member.name+' さん\nまだ退会は実行しません。',
     confirmLabel:'確認を終える'
   });
   if(!step2)return;
   // No fetch/POST/worker/GAS mutation, under any outcome.
   UI.toast('確認できました。退会はしていません。');
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