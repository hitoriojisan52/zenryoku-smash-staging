/** v1.0: duty/admin-only match operation screen. LIFF auth + Worker/GAS in a test deployment. */
'use strict';
const $=id=>document.getElementById(id),CFG=window.SMASH_CONFIG||{};
const S={token:'',actor:null,view:null,practiceId:'',busy:false,timer:0,drafts:new Map(),draftUndo:new Map()};
const clone=o=>JSON.parse(JSON.stringify(o));
const initialDraft=()=>({lookaheadCount:5,enabledCourts:[1,2,3],excludedIds:[],fixedGroups:[]});
function upcomingMatchPractices_(rows){return window.SMDate.upcomingPractices(rows);}
function matchNoUpcoming_(){
 S.practiceId='';S.view=null;
 $('matchBody').replaceChildren();
 $('matchControls').hidden=true;
 $('matchHeader').textContent='本日以降の練習日程がありません';
}
function draft(){if(!S.drafts.has(S.practiceId))S.drafts.set(S.practiceId,initialDraft());return S.drafts.get(S.practiceId);}
function settings(){return S.view?.session?.settings||draft();}
function notice(msg){const el=$('matchToast');el.textContent=msg;el.classList.add('visible');clearTimeout(S.timer);S.timer=setTimeout(()=>el.classList.remove('visible'),2200);}
function errText(e){return e?.message||String(e);}
function ambiguousMutationFailure(e){return !e.status||e.status>=500;}
async function mutation(path,payload){
 if(!isDuty())throw Error('対戦表の操作は当番担当・管理者のみ利用できます');
 try{return await request(path,payload);}
 catch(e){
   if(!ambiguousMutationFailure(e)||!payload.operationId)throw e;
   // The original request may have committed before its reply was lost. Never
   // retry with a NEW operation ID merely because the connection failed.
   let verification;
   try{verification=await request('/api/match/operation',{
     practiceId:payload.practiceId,operationId:payload.operationId});}
   catch(_){const err=Error('通信が途切れ、操作結果を確認できません。通信回復後に「更新」で最新の状態を確認してください。');
     err.code='OPERATION_UNKNOWN';throw err;}
   if(verification.applied){
     try{const latest=await request('/api/match/get',{practiceId:payload.practiceId});
       latest.recoveredOperation=true;return latest;}
     catch(_){const err=Error('操作は保存済みと確認できましたが、最新情報を取得できません。画面の「更新」を押してください。');
       err.code='APPLIED_REFRESH_FAILED';throw err;}
   }
   const err=Error('操作が反映されたことを確認できませんでした。最新の内容を確認してから再操作してください。');
   err.code='OPERATION_UNCONFIRMED';throw err;
 }
}

async function request(path,payload={}){
 if(!S.token||!CFG.apiBaseUrl)throw Error('LINE認証またはAPI設定がありません');
 const res=await fetch(CFG.apiBaseUrl.replace(/\/$/,'')+path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+S.token},body:JSON.stringify(payload),cache:'no-store'});

 if(path==='/api/match/bootstrap'){
   const names={line:'workerLine',gas:'workerGas',gas_post:'workerGasPost',gas_content:'workerGasContent'};
   const header=res.headers.get('Server-Timing')||'';
   for(const value of header.split(',')){
     const match=/^\s*(line|gas|gas_post|gas_content);dur=(\d+(?:\.\d+)?)\s*$/.exec(value);
     if(match){
       const ms=Number(match[2]);
       if(Number.isFinite(ms)&&ms>=0&&ms<=300000)Startup.timings[names[match[1]]]=Math.round(ms);
     }
   }
 }
 let data;try{data=await res.json();}catch{throw Error('API応答を取得できません');}
 if(!res.ok||!data.ok){const e=Error(data.error||'操作できませんでした');e.code=data.code;e.status=res.status;throw e;}return data.data;
}
const isDuty=()=>['duty','admin'].includes(S.actor?.role);
const operationId=()=>crypto.randomUUID();
function matchProcessingUi_(active,label='処理中です…'){
 const main=document.querySelector('main.match-container'),layer=$('matchBusyOverlay');
 if(!main||!layer)return;
 main.inert=active; main.setAttribute('aria-busy',String(active));
 document.body.classList.toggle('match-is-processing',active);
 const labelEl=$('matchBusyLabel');
 if(labelEl)labelEl.textContent=active?label:'処理中です…';
 layer.hidden=!active;
}
async function runMatchProcessing_(fn){
 if(S.busy || SMMatchConfirm.isOpen())return;
 S.busy=true;matchProcessingUi_(true);
 try{return await fn();}
 finally{S.busy=false;matchProcessingUi_(false);}
}
// The QR share operation can use the same screen-wide lock.
window.SMMatchBusy={run:runMatchProcessing_};
async function guard(fn){
 if(S.busy || SMMatchConfirm.isOpen())return;
 await runMatchProcessing_(async()=>{
 try{await fn();}
 catch(e){
   if(e.status===409 || e.code==='VERSION_CONFLICT'){
     try{await load();}catch{render();}
   }else render();
   await SMMatchConfirm.showError(e,label);
 }
 });
}
function el(tag,cls,content){const node=document.createElement(tag);if(cls)node.className=cls;if(content!==undefined)node.textContent=content;return node;}
function label(id){const p=S.view?.numberMap?.[id];if(p)return p.number+' '+p.name;return S.view?.session?.people?.find(p=>p.participationId===id)?.name||id;}
function renderRound(r,active){const section=el('section','match-round'+(active?' current':''));const status=r.state==='running'?'進行中':r.state==='planned'?'予定':r.state==='completed'?'完了':'未実施';
 section.append(el('h2','',`第${r.roundNumber}試合｜${status}`));
 for(const c of r.courts){const court=el('div','match-court');court.append(el('strong','',`第${c.courtNumber}コート`),el('div','match-team',c.teamA.map(label).join('・')),el('div','match-versus','VS'),el('div','match-team',c.teamB.map(label).join('・')));section.append(court);}return section;
}
function validateDraft(d){
 if(!Number.isInteger(d.lookaheadCount)||d.lookaheadCount<1||d.lookaheadCount>10)throw Error('先行生成数は1～10です');
 if(!d.enabledCourts.length||d.enabledCourts.length>4||new Set(d.enabledCourts).size!==d.enabledCourts.length||d.enabledCourts.some(n=>n<1||n>4))throw Error('コートは1～4面で設定してください');
 const allowed=new Set((S.view?.participants||[]).map(p=>p.participationId)),used=new Set();
 d.fixedGroups.forEach(g=>{if(![2,3].includes(g.participationIds.length))throw Error('固定グループは2～3名です');g.participationIds.forEach(id=>{if(!allowed.has(id)||used.has(id))throw Error('固定グループに重複があります');used.add(id);});});
}
function draftEdit(fn){if(!isDuty())throw Error('対戦表の設定変更は当番担当・管理者のみ利用できます');const old=clone(draft()),next=clone(old);fn(next);validateDraft(next);
 const stack=S.draftUndo.get(S.practiceId)||[];stack.push(old);S.draftUndo.set(S.practiceId,stack);
 S.drafts.set(S.practiceId,next);render();notice('設定を変更しました');}
function selectOptions(id,people,placeholder,finished){const sel=$(id);sel.replaceChildren(new Option(placeholder,''));people.forEach(p=>sel.add(new Option(p.number+' '+p.displayName,p.participationId)));sel.disabled=finished;}
function render(){const v=S.view,s=v?.session,editable=isDuty();const body=$('matchBody');body.replaceChildren();$('matchControls').hidden=!editable;for(const b of $('matchControls').querySelectorAll('button, input, select')){if(!editable)b.disabled=true;}
 if(!v){$('matchHeader').textContent='読み込み中…';return;}
 if(!s){
  const count=(v.participants||[]).length;
  $('matchHeader').textContent='対戦表未作成';
  const text=editable
   ?count===0
    ?'この開催日の参加者はまだ登録されていません。4名以上の参加登録後に対戦表を作成できます。'
    :count<4
     ?'参加者は現在'+count+'名です。対戦表の作成には4名以上必要です。'
     :''
   :'対戦表の作成をお待ちください。';
  if(text){
   const kind=editable&&count<4?'stage-system-message--warning':'stage-system-message--info';
   const message=el('p','stage-system-message '+kind,text);
   message.setAttribute('role','status');message.setAttribute('aria-live','polite');
   body.append(message);
  }
 }
 else{const finished=s.sessionState==='finished';$('matchHeader').textContent=finished?'対戦表の進行は終了しました':s.sessionState==='ready'?'試合開始前':`第${s.currentRound}試合`;
   const rounds=v.visibleRounds||[];if(!rounds.length)body.append(el('p','','対戦予定はありません。'));rounds.forEach((r,i)=>body.append(renderRound(r,i===0)));}
 if(!editable)return;
 const finished=s?.sessionState==='finished',cfg=settings(),main=$('mainMatchAction');
 if(!s){main.textContent='📋 対戦表作成';main.dataset.command='create';main.disabled=(v.participants||[]).length<4;}
 else if(s.sessionState==='ready'){main.textContent='🏸 試合開始';main.dataset.command='start';main.disabled=false;}
 else if(s.sessionState==='running'){main.textContent='⏭️ 次の試合へ';main.dataset.command='advance';main.disabled=!s.rounds.some(r=>r.state==='planned');}
 else{main.textContent='進行終了済み';main.dataset.command='';main.disabled=true;}
 $('undoMatch').disabled=s?!(Array.isArray(s.undoHistory)?s.undoHistory.length:(s.lastAction?.before?1:0)):
   !(S.draftUndo.get(S.practiceId)||[]).length;
 $('finishMatch').disabled=!s||finished;$('regenerateMatch').disabled=!s||finished;
 $('deleteMatch').disabled=!s; // Deletion also works after progression has finished.
 $('lookahead').value=cfg.lookaheadCount;
 const courts=$('courtChips');courts.replaceChildren();for(let n=1;n<=4;n++){const chip=el('label'),box=document.createElement('input');box.type='checkbox';box.value=n;box.checked=cfg.enabledCourts.includes(n);box.disabled=finished;chip.append(box,document.createTextNode(n+'面'));courts.append(chip);}
 $('saveLookahead').disabled=$('saveCourts').disabled=$('addFixedGroup').disabled=finished;
 const roster=v.participants||[],people=$('matchPeople');people.replaceChildren();roster.forEach(p=>{const row=el('div','match-person');row.append(el('span','',`${p.number} ${p.displayName}`));const select=document.createElement('select');select.add(new Option('参加','include'));select.add(new Option('除外','exclude'));select.value=cfg.excludedIds.includes(p.participationId)?'exclude':'include';select.disabled=finished;
  select.addEventListener('change',()=>guard(async()=>{if(s){await change('status',{participationId:p.participationId,status:select.value});notice('状態を変更しました');}else draftEdit(d=>{d.excludedIds=select.value==='include'?d.excludedIds.filter(id=>id!==p.participationId):[...new Set([...d.excludedIds,p.participationId])];});}));row.append(select);people.append(row);});
 const groupBox=$('currentGroups');groupBox.replaceChildren();cfg.fixedGroups.forEach(g=>{const row=el('div','fixed-row'),btn=el('button','btn-outline','解除');row.append(el('span','',`${g.participationIds.length===3?'トリオ':'ペア'}：${g.participationIds.map(label).join('・')}`));btn.disabled=finished;btn.addEventListener('click',()=>guard(async()=>{const fixedGroups=settings().fixedGroups.filter(x=>x.groupId!==g.groupId);if(s)await change('groups',{fixedGroups});else draftEdit(d=>{d.fixedGroups=fixedGroups;});notice('固定グループを解除しました');}));row.append(btn);groupBox.append(row);});
 ['groupMember1','groupMember2','groupMember3'].forEach((id,i)=>selectOptions(id,roster,`${i+1}人目${i===2?'（任意）':''}`,finished));
}
async function load(){if(!S.practiceId)return;S.view=await request('/api/match/get',{practiceId:S.practiceId});if(S.view.session){S.drafts.delete(S.practiceId);S.draftUndo.delete(S.practiceId);}render();}
async function change(action,payload={}){if(!isDuty())throw Error('対戦表の操作は当番担当・管理者のみ利用できます');const s=S.view?.session;if(!s)throw Error('対戦表がありません');S.view=await mutation('/api/match/change',{practiceId:S.practiceId,action,expectedSessionVersion:s.sessionVersion,expectedSettingsVersion:s.settingsVersion,operationId:operationId(),...payload});render();}
const Startup={scriptStarted:performance.now(),timings:{}};
async function timedStartup(key,fn){
 const start=performance.now();
 try{return await fn();}finally{Startup.timings[key]=Math.round(performance.now()-start);}
}
// v0.16 staging: members share one LIFF; read-only members use existing safe APIs.
async function openGeneralMemberView16_(){
 const result=await request('/api/match/practices');
 const choices=upcomingMatchPractices_(result.practices);
 const selector=$('matchPractice');
 selector.replaceChildren(...choices.map(p=>
  new Option(window.SMDate.practiceLabel(p),p.practiceId)));
 if(choices.length){
  S.practiceId=choices[0].practiceId;selector.value=S.practiceId;
  await load();
 }else matchNoUpcoming_();
 window.SMAccess?.setup({api:request,role:S.actor.role,getPracticeId:()=>S.practiceId});
 setInterval(()=>{if(!S.busy&&!document.hidden&&S.practiceId)load().catch(()=>{});},12000);
}
async function init(){
 // The initial LINE login + schedule + match read is a foreground operation.
 // Passive polling remains non-blocking; save actions use runMatchProcessing_.
 S.busy=true;
 matchProcessingUi_(true,'読み込み中です…');
 try{
  if(!CFG.liffId||CFG.liffId.includes('REPLACE_')||!CFG.apiBaseUrl||CFG.apiBaseUrl.includes('REPLACE_'))throw Error('runtime-config.js を設定してください');
  if(!window.liff)throw Error('LINE SDKを読み込めません');
  $('matchHeader').textContent='LINE認証を確認しています…';
  await timedStartup('liff',()=>liff.init({liffId:CFG.liffId}));
  if(!liff.isLoggedIn()){liff.login({redirectUri:location.href});return;}
  S.token=liff.getIDToken();if(!S.token)throw Error('LINE認証を取得できません');
  $('matchHeader').textContent='利用者情報・練習日程を読み込んでいます…';
  if(CFG.useMatchBootstrap===true){
    $('matchHeader').textContent='利用者情報・日程・対戦表をまとめて読み込んでいます…';
    const requested=new URLSearchParams(location.search).get('practiceId')||'';
    const data=await timedStartup('bootstrap',()=>request('/api/match/bootstrap',{practiceId:requested}));
    // v0.15.11: GAS-side breakdown is optional for compatibility with v0.15.8.
    if(data?.bootstrapTimings && typeof data.bootstrapTimings==='object'){
      const keys={practicesReadMs:'gasPractices',matchRevisionReadMs:'gasRevision',
        attendeeReadMs:'gasAttendees',lineupRenderMs:'gasRender',bootstrapTotalMs:'gasTotal',
        sheetOpenMs:'gasSheetOpen',memberAuthMs:'gasMemberAuth',dispatchTotalMs:'gasDispatch'};
      for(const [source,target] of Object.entries(keys)){
        const ms=data.bootstrapTimings[source];
        if(typeof ms==='number'&&Number.isFinite(ms)&&ms>=0&&ms<=300000)
          Startup.timings[target]=Math.round(ms);
      }
    }
    if(!data||!data.actor||!Array.isArray(data.practices))throw Error('一括取得の応答形式が不正です');
    S.actor=data.actor;
    if(!isDuty()){if(CFG.accessFeaturesEnabled===true){await openGeneralMemberView16_();return;} $('matchHeader').textContent='当番チーム所属者・管理者専用です';return;}
    const choices=upcomingMatchPractices_(data.practices);
    const selector=$('matchPractice');
    selector.replaceChildren(...choices.map(p=>
     new Option(window.SMDate.practiceLabel(p),p.practiceId)));
    if(choices.length){
      const selected=data.selectedPracticeId;
      if(!data.view||data.view.practiceId!==selected)
       throw Error('一括取得した対戦表の内容が不正です');
      S.practiceId=choices[0].practiceId;selector.value=S.practiceId;
      if(selected===S.practiceId){S.view=data.view;render();}
      else await timedStartup('match',()=>load());
    }else matchNoUpcoming_();
  }else{
  const parallelStart=performance.now();
  const [actor,choices]=await Promise.all([
   timedStartup('member',()=>request('/api/session')),
   timedStartup('practices',()=>request('/api/match/practices'))
  ]);
  Startup.timings.parallel=Math.round(performance.now()-parallelStart);
  S.actor=actor;
  if(!isDuty()){if(CFG.accessFeaturesEnabled===true){await openGeneralMemberView16_();return;} $('matchHeader').textContent='当番チーム所属者・管理者専用です';return;}
  const eligible=upcomingMatchPractices_(choices.practices);
  const selector=$('matchPractice');
  selector.replaceChildren(...eligible.map(p=>
   new Option(window.SMDate.practiceLabel(p),p.practiceId)));
  if(eligible.length){
   S.practiceId=eligible[0].practiceId;selector.value=S.practiceId;
   $('matchHeader').textContent='対戦表を読み込んでいます…';
   await timedStartup('match',()=>load());
  }else matchNoUpcoming_();
  }
  if(CFG.accessFeaturesEnabled===true)window.SMAccess?.setup({api:request,role:S.actor.role,getPracticeId:()=>S.practiceId});
  setInterval(()=>{if(!S.busy&&!SMMatchConfirm.isOpen()&&!document.hidden&&!$('courtSettings').open&&!$('participantSettings').open)load().catch(()=>{});},9000);
 }catch(e){if(CFG.accessFeaturesEnabled===true&&(e.code==='UNAUTHORIZED'||e.message==='利用登録が確認できません')){ $('matchHeader').textContent='初回利用の登録申請';window.SMAccess?.showRegistration({api:request});return; }
  $('matchHeader').textContent='対戦表を読み込めませんでした';
  // Close the blocking layer BEFORE the error modal, so the error is operable.
  S.busy=false;
  matchProcessingUi_(false);
  await SMMatchConfirm.showError(e,label);
 }
 finally{
  S.busy=false;
  matchProcessingUi_(false);
 }
}

$('matchPractice').addEventListener('change',()=>guard(async()=>{S.practiceId=$('matchPractice').value;await load();}));
$('refreshMatch').addEventListener('click',()=>guard(load));
$('mainMatchAction').addEventListener('click',()=>guard(async()=>{
 const kind=$('mainMatchAction').dataset.command;if(kind==='create'){
  const cfg=clone(draft());validateDraft(cfg);
  S.view=await mutation('/api/match/create',{practiceId:S.practiceId,operationId:operationId(),...cfg});S.drafts.delete(S.practiceId);S.draftUndo.delete(S.practiceId);render();notice('対戦表を作成しました');
 }else if(kind==='start'||kind==='advance'){await change(kind);notice(kind==='start'?'試合を開始しました':'次の試合へ進みました');}
}));
$('undoMatch').addEventListener('click',()=>guard(async()=>{
 const s=S.view?.session;if(!s){const stack=S.draftUndo.get(S.practiceId);if(!stack?.length)return;S.drafts.set(S.practiceId,stack.pop());render();notice('前の操作に戻しました');return;}
 await change('undo',{targetOperationId:s.undoHistory?.at(-1)?.operationId||s.lastAction?.operationId});notice('前の操作に戻しました');
}));
$('finishMatch').addEventListener('click',async()=>{if(S.busy)return;const ok=await SMMatchConfirm.ask({title:'【進行終了の確認】',message:'対戦表を閉じて進行を終了しますか？\n未開始の試合は実施済みに含まれません。',confirmLabel:'進行終了',danger:true});if(!ok)return;await guard(async()=>{await change('finish');notice('進行を終了しました');});});
$('regenerateMatch').addEventListener('click',async()=>{if(S.busy)return;const ok=await SMMatchConfirm.ask({title:'【対戦表再生成の確認】',message:'未開始の試合をすべて再生成しますか？\n現在進行中・完了済みの試合は維持します。',confirmLabel:'再生成する'});if(!ok)return;await guard(async()=>{await change('regenerate');notice('対戦表を再生成しました');});});
// A deleted match must reopen participant editing, without touching money or
// attendance. Do not retry an ambiguous POST with a new operationId.
$('deleteMatch').addEventListener('click',async()=>{
 if(S.busy||!isDuty()||!S.view?.session)return;
 const current=S.view.session,practiceId=S.practiceId;
 const confirmed=await SMMatchConfirm.ask({
  title:'【対戦表の削除】',
  message:'この開催日の対戦表を削除しますか？',
  confirmLabel:'削除する',danger:true
 });
 if(!confirmed)return;
 await guard(async()=>{
  if(practiceId!==S.practiceId)throw Error('開催日が変わりました。もう一度確認してください');
  const next=await mutation('/api/match/delete',{
   practiceId,expectedSessionVersion:current.sessionVersion,
   expectedSettingsVersion:current.settingsVersion,operationId:operationId()
  });
  if(next?.practiceId!==practiceId||next?.session){
   throw Error('対戦表の削除結果が確認できません。更新して確認してください');
  }
  S.view=next;S.drafts.delete(practiceId);S.draftUndo.delete(practiceId);
  render();notice('対戦表を削除しました');
 });
});

$('saveLookahead').addEventListener('click',()=>guard(async()=>{const count=Number($('lookahead').value);if(safeState()){await change('lookahead',{count});notice('先行生成数を変更しました');}else draftEdit(d=>{d.lookaheadCount=count;});}));
$('saveCourts').addEventListener('click',()=>guard(async()=>{const enabledCourts=Array.from($('courtChips').querySelectorAll('input:checked')).map(x=>Number(x.value));if(safeState()){await change('courts',{enabledCourts});notice('コート設定を変更しました');}else draftEdit(d=>{d.enabledCourts=enabledCourts;});}));
$('addFixedGroup').addEventListener('click',()=>guard(async()=>{
 const ids=['groupMember1','groupMember2','groupMember3'].map(id=>$(id).value).filter(Boolean);
 if(![2,3].includes(ids.length)||new Set(ids).size!==ids.length)throw Error('異なる2～3名を選択してください');
 const fixedGroups=settings().fixedGroups.concat([{groupId:'G-'+operationId(),participationIds:ids}]);
 if(safeState()){await change('groups',{fixedGroups});notice('固定グループを追加しました');}else draftEdit(d=>{d.fixedGroups=fixedGroups;});
}));
const safeState=()=>Boolean(S.view?.session);
init();
