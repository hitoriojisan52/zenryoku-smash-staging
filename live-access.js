/** 全力☆スマッシュ v0.16.2 — staged administrator access management for live.html.
 * The server performs authorization; this module never trusts a UI-only role check.
 * No LINE user ID or channel secret is persisted in the browser.
 */
(function(){'use strict';
 const $=id=>document.getElementById(id);
 let api=null,authenticatedRole='',authenticatedMemberId='',busy=false;
 function node(tag,cls,label){const e=document.createElement(tag);if(cls)e.className=cls;if(label!==undefined)e.textContent=label;return e;}
 function status(message){$('memberAccessStatus').textContent=message||'';}
 function button(label,handler,cls='btn-blue'){
   const e=node('button',cls,label);e.type='button';
   e.addEventListener('click',async()=>{if(busy)return;busy=true;e.disabled=true;try{await handler();}catch(err){status(err.message||String(err));}finally{busy=false;e.disabled=false;}});
   return e;
 }
 function ensureAdmin(){if(authenticatedRole!=='admin'||!api)throw Error('管理者以外は権限管理を利用できません');}
 async function load(){
   ensureAdmin();
   const data=await api('/api/member/manage/list');
   if(!Array.isArray(data.pending)||!Array.isArray(data.members))throw Error('管理情報の応答を確認できません');
   const pending=$('memberAccessPending'),members=$('memberAccessMembers');
   pending.replaceChildren();members.replaceChildren();
   if(!data.pending.length)pending.append(node('p','access-help','承認待ちの申請はありません。'));
   for(const p of data.pending){
     const row=node('div','live-access-row'),name=node('span','live-access-name',p.name);
     row.append(name,
       button('承認',async()=>{if(!confirm(p.name+'さんを一般メンバーとして承認しますか？'))return;
         await api('/api/member/manage/decide',{requestId:p.requestId,approve:true,operationId:crypto.randomUUID()});
         status('承認しました。');await load();}),
       button('却下',async()=>{if(!confirm(p.name+'さんの申請を却下しますか？'))return;
         await api('/api/member/manage/decide',{requestId:p.requestId,approve:false,operationId:crypto.randomUUID()});
         status('却下しました。');await load();},'btn-outline'));
     pending.append(row);
   }
   for(const m of data.members){
     const row=node('div','live-access-row'),name=node('span','live-access-name',m.name+(m.active?'':'（停止中）')),
       select=node('select','live-access-select');select.setAttribute('aria-label',m.name+'さんの権限');
     for(const [value,label] of [['member','一般メンバー'],['duty','当番担当'],['admin','管理者']])select.add(new Option(label,value));
     select.value=m.role;select.disabled=!m.active;
     row.append(name,select,button('変更',async()=>{
       ensureAdmin();if(!m.active||select.value===m.role)return;
       if(!confirm(m.name+'さんの権限を変更しますか？'))return;
       await api('/api/member/manage/role',{memberId:m.memberId,role:select.value,operationId:crypto.randomUUID()});
       status('権限を変更しました。');await load();
     }));
     if(m.active&&m.memberId!==authenticatedMemberId){
       row.append(button('退会',async()=>{
         ensureAdmin();
         if(!confirm(m.name+'さんの登録情報を削除します。過去の試合・収支履歴は保持されます。続行しますか？'))return;
         if(prompt('誤操作防止のため「退会」と入力してください')!=='退会')return;
         await api('/api/member/manage/withdraw',{memberId:m.memberId,confirmMemberId:m.memberId,operationId:crypto.randomUUID()});
         status('退会処理が完了しました。');await load();
       },'btn-danger'));
     }
     members.append(row);
   }
   const archive=$('memberAccessWithdrawn');
   if(archive){
     archive.replaceChildren();
     if(!Array.isArray(data.withdrawn)||!data.withdrawn.length)
       archive.append(node('p','access-help','退会履歴はありません。'));
     else for(const w of data.withdrawn){
       const row=node('div','live-access-row');
       const suffix=w.state==='completed'?'（退会済み）':'（処理中・管理者による確認が必要）';
       row.append(node('span','live-access-name',w.name+suffix),node('span','access-help',w.withdrawnAt||''));
       archive.append(row);
     }
   }
 }
 async function open(){
   ensureAdmin();const parent=$('manageDialog');if(parent?.open)parent.close();const dialog=$('memberAccessDialog');if(!dialog.open)dialog.showModal();
   status('管理情報を取得しています…');
   try{await load();status('');}catch(e){status(e.message||String(e));}
 }
 function setup(args){
   api=args.api;authenticatedRole=args.actor?.role||'';authenticatedMemberId=args.actor?.memberId||'';
   $('manageAccess').hidden=authenticatedRole!=='admin';
   $('manageSchedules').hidden=authenticatedRole!=='admin'; // schedule CRUD will be wired separately
   if(authenticatedRole!=='admin'&&$('memberAccessDialog').open)$('memberAccessDialog').close();
 }
 $('manageAccess').addEventListener('click',()=>open().catch(e=>status(e.message||String(e))));
 $('memberAccessRefresh').addEventListener('click',()=>load().then(()=>status('更新しました。')).catch(e=>status(e.message||String(e))));
 $('memberAccessClose').addEventListener('click',()=>$('memberAccessDialog').close());
 window.SMLiveAccess={setup};
})();