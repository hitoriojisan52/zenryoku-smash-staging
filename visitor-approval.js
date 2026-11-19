/* v0.16.42 — visitor request/member and admin cards share participant-list layout.
 * Registered member IDs come from verified LINE authentication, never the UI.
 * Pending request: requester can withdraw. Approved: requester can edit details.
 * Rejected: terminal. Server enforces finance, match, version and ownership.
 */
(function(w){
 'use strict';
 const $=id=>document.getElementById(id);
 const STATUS=Object.freeze({pending:'承認待ち',approved:'承認済み',rejected:'却下済み'});
 const formatRequestedAt_=(value)=>{
  const text=w.SMDate.dateTimeJst(value,false);
  return /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(text)?text:'日時を確認できません';
 };
 let api=null,actor=null,selected=null,editTarget=null,deleteTarget=null;
 let refreshAfterDecision=null,mineRows=[],adminRows=[],mineDates=[],adminDates=[];
 const node=(tag,cls,text)=>{
  const el=document.createElement(tag);if(cls)el.className=cls;
  if(text!==undefined)el.textContent=String(text);
  return el;
 };
 const busy=async(label,fn)=>{
  try{return await w.SMStageUX.run(label,fn);}
  catch(e){await w.SMStageUX.showError(e);return null;}
 };
 const empty=label=>{
  const el=node('p','stage-system-message stage-system-message--info',label);
  el.setAttribute('role','status');el.setAttribute('aria-live','polite');
  return el;
 };
 const shortDate=r=>r.date?w.SMDate.date(r.date)+' '+(r.place||''):'開催日：登録がありません';
 const practiceOption=r=>w.SMDate.practiceLabel?r.date?w.SMDate.practiceLabel(r):shortDate(r):shortDate(r);
 function optionsFor(rows,id,practices){
  const select=$(id),previous=select.value,today=w.SMDate.todayJst();
  const unique=new Map();
  // Do not delete historical requests; only hide past dates from selectors.
  for(const p of w.SMDate.upcomingPractices(practices)){
   if(p.practiceId&&!unique.has(p.practiceId))
    unique.set(p.practiceId,{date:p.date,startTime:p.startTime||'',label:practiceOption(p)});
  }
  for(const r of rows){
   if(!r.practiceId||!r.date||r.date<today||unique.has(r.practiceId))continue;
   unique.set(r.practiceId,{date:r.date,startTime:r.startTime||'',label:practiceOption(r)});
  }
  const options=[...unique].sort((a,b)=>a[1].date.localeCompare(b[1].date)||
   a[1].startTime.localeCompare(b[1].startTime)||a[0].localeCompare(b[0]));
  select.replaceChildren(...(options.length?options.map(([value,item])=>{
   const option=node('option','',item.label);option.value=value;return option;
  }):[node('option','','本日以降の開催日がありません')]));
  select.value=unique.has(previous)?previous:(options[0]?.[0]||'');
  return rows.filter(r=>r.practiceId===select.value);
 }
 function card(data,admin){
  const card=node('article','participant-card-item visitor-review-card');
  const head=node('div','participant-card-title visitor-review-heading');
  const who=node('span','participant-card-person');
  who.append(node('span','participant-card-name','👤 '+data.name),
    node('span','participant-card-category','ビジター'));
  // Only the requesting member's visitor registration page adds an explicit
  // approval-state badge. Admin review and regular roster preserve v7 layout.
  if(!admin)who.append(node('span','visitor-status visitor-status--'+data.status,
    STATUS[data.status]||'状態を確認してください'));
  const attendance=data.status==='approved'?
    (data.attending===true?'参加':data.attending===false?'欠席':'未確認'):
    data.status==='pending'?'受付中':'対象外';
  head.append(who,node('span','participant-card-attendance '+(
    data.status==='approved'&&data.attending===true?'is-attending':'is-absent'),attendance));
  const content=node('div','participant-card-content');
  const info=node('div','participant-card-info');
  const details=node('div','participant-card-details visitor-review-info');
  const fields=[
   shortDate(data),
   '📅 申請日：'+formatRequestedAt_(data.requestedAt),
   admin?'👤 申請者：'+(data.requestedByName||'不明'):''
  ].filter(Boolean);
  for(const field of fields)details.append(node('span','',field));
  info.append(details);
  if(data.memo)info.append(node('div','participant-card-memo','📝 '+data.memo));
  const actions=node('div','participant-card-buttons visitor-review-actions');
  if(admin){
   for(const [action,label] of [['approve','承認'],['reject','却下']]){
    const button=node('button',action==='reject'?'btn-danger':'btn-green',label);
    button.type='button';button.disabled=(data.status==='rejected')||
     (action==='approve'&&data.status!=='pending');
    if(!button.disabled)button.addEventListener('click',()=>openConfirm(data,action));
    actions.append(button);
   }
  }else{
   const edit=node('button','participant-btn-edit','修正');
   const remove=node('button','participant-btn-delete','削除');
   edit.type='button';remove.type='button';
   edit.disabled=data.status!=='approved';
   remove.disabled=data.status!=='pending';
   if(!edit.disabled)edit.addEventListener('click',()=>openEdit(data));
   if(!remove.disabled)remove.addEventListener('click',()=>openDelete(data));
   actions.append(edit,remove);
  }
  content.append(info,actions);
  card.append(head,content);
  return card;
 }
 function render(container,rows,admin){
  const target=$(container);target.replaceChildren();
  if(!rows.length){
   target.append(empty(admin?'この開催日の審査対象はありません。':'この開催日のビジター申請はありません。'));
   return;
  }
  rows.forEach(r=>target.append(card(r,admin)));
 }
 function renderMine(){
  render('visitorMineCards',optionsFor(mineRows,'visitorMinePractice',mineDates),false);
 }
 function renderAdmin(){
  render('visitorAdminCards',optionsFor(adminRows,'visitorAdminPractice',adminDates),true);
 }
 async function loadMine(){
  if(!api)return [];
  const result=await api('/api/visitor/mine');
  if(!Array.isArray(result?.requests)||result.requests.some(r=>!r.requestId||
     !STATUS[r.status]||!r.practiceId||!Number.isSafeInteger(r.version)))
   throw Error('ビジター申請状況の取得結果が不正です。');
  if(result.practices!==undefined&&!Array.isArray(result.practices))
   throw Error('開催日一覧を確認できません');
  mineDates=result.practices||[];
  mineRows=result.requests;renderMine();return mineRows;
 }
 async function loadAdmin(){
  if(actor?.role!=='admin')throw Error('管理者のみ閲覧できます');
  const result=await api('/api/visitor/admin-list');
  if(!Array.isArray(result?.requests)||result.requests.some(r=>!r.requestId||
     !STATUS[r.status]||!r.practiceId||!Number.isSafeInteger(r.version)))
   throw Error('ビジター管理情報の取得結果が不正です。');
  if(result.practices!==undefined&&!Array.isArray(result.practices))
   throw Error('開催日一覧を確認できません');
  adminDates=result.practices||[];
  adminRows=result.requests;renderAdmin();return adminRows;
 }
 function openConfirm(data,action){
  if(actor?.role!=='admin'||!STATUS[data.status]||data.status==='rejected'||
     (action==='approve'&&data.status!=='pending'))return;
  selected={requestId:data.requestId,practiceId:data.practiceId,
   expectedVersion:data.version,action};
  const label=action==='approve'?'承認':'却下';
  $('visitorDecisionTitle').textContent='【ビジター'+label+'の確認】';
  $('visitorDecisionText').textContent=data.name+'さん（'+
   (data.date?w.SMDate.date(data.date):'開催日未確認')+'）を'+label+'しますか？'+
   (action==='reject'?'承認済みの場合は参加者一覧から除外します。却下後は再承認できません。':'承認後、参加者一覧に反映されます。');
  $('visitorDecisionConfirm').textContent=label+'する';
  $('visitorDecisionConfirm').className=action==='reject'?'btn-danger':'btn-green';
  $('visitorDecisionDialog').showModal();
 }
 async function decide(){
  const choice=selected;selected=null;$('visitorDecisionDialog').close();
  if(!choice)return;
  await busy('ビジターの審査結果を保存しています…',async()=>{
   const result=await api('/api/visitor/decide',{...choice,operationId:crypto.randomUUID()});
   if(result?.requestId!==choice.requestId||
      result.status!==(choice.action==='approve'?'approved':'rejected')||
      result.version!==choice.expectedVersion+1)
    throw Error('審査結果を確認できません。「更新」で状態を確認してください。');
   await loadAdmin();
   if(refreshAfterDecision)await refreshAfterDecision();
  });
 }
 function openEdit(data){
  if(data.status!=='approved')return;
  editTarget={requestId:data.requestId,expectedVersion:data.version};
  $('visitorMineEditName').value=data.name||'';
  $('visitorMineEditKana').value=data.nameKana||'';
  $('visitorMineEditMemo').value=data.memo||'';
  $('visitorMineEditAttendance').value=data.attending===false?'absent':'attend';
  $('visitorMineEditDialog').showModal();
 }
 async function saveEdit(event){
  event.preventDefault();
  const current=editTarget;if(!current)return;
  const name=$('visitorMineEditName').value.normalize('NFKC').replace(/[\s\u3000]+/g,'');
  const nameKana=$('visitorMineEditKana').value.normalize('NFKC').replace(/[\s\u3000]+/g,'');
  const memo=$('visitorMineEditMemo').value.trim();
  if(!name||name.length>60||nameKana.length>100||memo.length>200){
   await w.SMStageUX.showError(Error('お名前・カナ・備考を確認してください。'));return;
  }
  editTarget=null;$('visitorMineEditDialog').close();
  await busy('ビジター情報を修正しています…',async()=>{
   const result=await api('/api/visitor/modify',{
    ...current,action:'edit',operationId:crypto.randomUUID(),
    name,nameKana,memo,category:'visitor',
    attending:$('visitorMineEditAttendance').value==='attend'
   });
   if(result?.requestId!==current.requestId||result.status!=='approved'||
      result.version!==current.expectedVersion+1)
    throw Error('修正結果を確認できません。申請状況を更新してください。');
   await loadMine();
   if(refreshAfterDecision)await refreshAfterDecision();
  });
 }
 function openDelete(data){
  if(data.status!=='pending')return;
  deleteTarget={requestId:data.requestId,expectedVersion:data.version};
  $('visitorMineDeleteText').textContent=data.name+'さんの承認待ち申請を削除しますか？'+
   '削除後は管理者による承認ができなくなります。';
  $('visitorMineDeleteDialog').showModal();
 }
 async function deleteMine(){
  const current=deleteTarget;deleteTarget=null;$('visitorMineDeleteDialog').close();
  if(!current)return;
  await busy('承認待ちの申請を削除しています…',async()=>{
   const result=await api('/api/visitor/modify',{
    ...current,action:'delete',operationId:crypto.randomUUID()
   });
   if(result?.requestId!==current.requestId||result.status!=='withdrawn'||
      result.version!==current.expectedVersion+1)
    throw Error('削除結果を確認できません。申請状況を更新してください。');
   await loadMine();
  });
 }
 function bind(){
  $('visitorMinePractice').addEventListener('change',renderMine);
  $('visitorAdminPractice').addEventListener('change',renderAdmin);
  $('visitorMineRefresh').addEventListener('click',()=>busy('申請状況を更新しています…',loadMine));
  $('visitorAdminMenu').addEventListener('click',()=>busy('ビジター申請を読み込んでいます…',async()=>{
   $('visitorAdminPractice').value='';
   await loadAdmin();$('manageDialog').close();$('visitorAdminDialog').showModal();
  }));
  $('visitorAdminRefresh').addEventListener('click',()=>busy('申請を更新しています…',loadAdmin));
  $('visitorAdminClose').addEventListener('click',()=>$('visitorAdminDialog').close());
  $('visitorDecisionCancel').addEventListener('click',()=>{selected=null;$('visitorDecisionDialog').close()});
  $('visitorDecisionConfirm').addEventListener('click',decide);
  $('visitorDecisionDialog').addEventListener('cancel',()=>{selected=null});
  $('visitorMineEditCancel').addEventListener('click',()=>{editTarget=null;$('visitorMineEditDialog').close()});
  $('visitorMineEditForm').addEventListener('submit',saveEdit);
  $('visitorMineDeleteCancel').addEventListener('click',()=>{deleteTarget=null;$('visitorMineDeleteDialog').close()});
  $('visitorMineDeleteSave').addEventListener('click',deleteMine);
  $('visitorMineDeleteDialog').addEventListener('cancel',()=>{deleteTarget=null});
  $('visitorMineEditDialog').addEventListener('cancel',()=>{editTarget=null});
 }
 bind();
 w.SMVisitor=Object.freeze({
  setup(options){
   api=options.api;actor=options.actor;
   refreshAfterDecision=options.onDecision||null;
   $('visitorAdminMenu').hidden=actor?.role!=='admin';
  },
  loadMine,loadAdmin
 });
})(window);
