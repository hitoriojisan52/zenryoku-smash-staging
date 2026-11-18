/* v0.16.40 — visitor status and administrator decision UI.
 * Only a server-derived memberId is allowed to see their own requests.
 * No local role flag grants approval; GAS validates admin on each call.
 */
(function(w){
 'use strict';
 const $=id=>document.getElementById(id);
 let api=null,actor=null,selected=null,refreshAfterDecision=null;
 const STATUS={pending:'承認待ち',approved:'承認済み',rejected:'却下済み'};
 const node=(tag,cls,txt)=>{
  const e=document.createElement(tag);if(cls)e.className=cls;
  if(txt!==undefined)e.textContent=String(txt);
  return e;
 };
 const busy=async(label,fn)=>{
  try{return await w.SMStageUX.run(label,fn);}
  catch(e){await w.SMStageUX.showError(e);return null;}
 };
 function empty(label){
  const el=node('p','stage-system-message stage-system-message--info',label);
  el.setAttribute('role','status');el.setAttribute('aria-live','polite');
  return el;
 }
 function card(data,admin){
  const el=node('article','visitor-review-card');
  const header=node('div','visitor-review-heading');
  header.append(node('strong','',data.name));
  const state=STATUS[data.status]||'状態を確認してください';
  header.append(node('span','visitor-status visitor-status--'+(STATUS[data.status]?data.status:'pending'),state));
  el.append(header);
  const details=[
   data.date?(w.SMDate.date(data.date)+' '+(data.place||'')):'開催日：登録がありません',
   data.requestedAt?'申請日時：'+(w.SMDate.dateTimeJst(data.requestedAt,false)||'日時を確認できません'):'',
   admin?'申請者：'+(data.requestedByName||'不明'):'',
   data.nameKana?'カナ：'+data.nameKana:'',
   data.memo?'備考：'+data.memo:''
  ].filter(Boolean).join('\n');
  el.append(node('p','visitor-review-info',details));
  if(admin){
   const actions=node('div','visitor-review-actions');
   for(const [action,label] of [['approve','承認'],['reject','却下']]){
    const button=node('button',action==='reject'?'btn-danger':'btn-green',label);
    button.type='button';button.disabled=(data.status==='rejected')||
      (action==='approve'&&data.status!=='pending');
    if(!button.disabled)button.addEventListener('click',()=>openConfirm(data,action));
    actions.append(button);
   }
   el.append(actions);
  }
  return el;
 }
 function render(container,rows,admin){
  const target=$(container);target.replaceChildren();
  if(!rows.length){target.append(empty(admin?'審査対象のビジター申請はありません。':'ビジターの申請履歴はありません。'));return;}
  rows.forEach(r=>target.append(card(r,admin)));
 }
 async function loadMine(){
  if(!api)return;
  const result=await api('/api/visitor/mine');
  if(!Array.isArray(result?.requests)||
    result.requests.some(r=>!r.requestId||!STATUS[r.status]))
   throw Error('ビジター申請状況の取得結果が不正です。');
  render('visitorMineCards',result.requests,false);
  return result.requests;
 }
 async function loadAdmin(){
  if(actor?.role!=='admin')throw Error('管理者のみ閲覧できます');
  const result=await api('/api/visitor/admin-list');
  if(!Array.isArray(result?.requests)||
    result.requests.some(r=>!r.requestId||!STATUS[r.status]))
   throw Error('ビジター管理情報の取得結果が不正です。');
  render('visitorAdminCards',result.requests,true);
  return result.requests;
 }
 function openConfirm(data,action){
  if(actor?.role!=='admin'||!STATUS[data.status]||data.status==='rejected'||
     (action==='approve'&&data.status!=='pending'))return;
  selected={requestId:data.requestId,practiceId:data.practiceId,
   expectedVersion:data.version,action};
  const decision=action==='approve'?'承認':'却下';
  $('visitorDecisionTitle').textContent='【ビジター'+decision+'の確認】';
  $('visitorDecisionText').textContent=data.name+'さん（'+
   (data.date?w.SMDate.date(data.date):'開催日未確認')+'）を'+decision+'しますか？'+
   (action==='reject'?'承認済みの場合は参加者一覧から除外します。却下後は再承認できません。':'承認後、参加者一覧に反映されます。');
  $('visitorDecisionConfirm').textContent=decision+'する';
  $('visitorDecisionConfirm').className=action==='reject'?'btn-danger':'btn-green';
  $('visitorDecisionDialog').showModal();
 }
 async function decide(){
  const choice=selected;selected=null;
  $('visitorDecisionDialog').close();
  if(!choice)return;
  await busy('ビジターの審査結果を保存しています…',async()=>{
   const result=await api('/api/visitor/decide',{
    ...choice,operationId:crypto.randomUUID()
   });
   if(result?.requestId!==choice.requestId||
      result.status!==(choice.action==='approve'?'approved':'rejected')||
      result.version!==choice.expectedVersion+1)
    throw Error('審査結果を確認できません。「更新」で状態を確認してください。');
   await loadAdmin();
   if(refreshAfterDecision)await refreshAfterDecision();
  });
 }
 function bind(){
  $('visitorMineRefresh').addEventListener('click',()=>busy('申請状況を更新しています…',loadMine));
  $('visitorAdminMenu').addEventListener('click',()=>busy('ビジター申請を読み込んでいます…',async()=>{
   await loadAdmin();$('manageDialog').close();$('visitorAdminDialog').showModal();
  }));
  $('visitorAdminRefresh').addEventListener('click',()=>busy('申請を更新しています…',loadAdmin));
  $('visitorAdminClose').addEventListener('click',()=>$('visitorAdminDialog').close());
  $('visitorDecisionCancel').addEventListener('click',()=>{
   selected=null;$('visitorDecisionDialog').close();
  });
  $('visitorDecisionConfirm').addEventListener('click',decide);
  $('visitorDecisionDialog').addEventListener('cancel',()=>{selected=null});
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
