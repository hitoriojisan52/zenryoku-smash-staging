/**
 * Connected smoke-test UI based on v0.7. No demo fallback: do not confuse
 * fake data with live club finances. LINE ID token is kept only in memory.
 * Business permission and concurrency decisions are always server-side.
 */
'use strict';
const M=window.SmashModel,$=id=>document.getElementById(id),yen=n=>Number(n).toLocaleString('ja-JP')+'円';
const CONFIG=window.SMASH_CONFIG||{};
const S={token:'',actor:null,overview:null,practiceId:'',loading:false,pending:new Set(),ledger:null,ledgerRow:null,mode:'add',modalTarget:null,timer:null,updateEpoch:0,paymentActive:0,paymentQueue:[],paymentNeedsRefresh:false};
const PERF_MODE=(()=>{
 const q=new URLSearchParams(location.search||'');let state=q.get('liff.state')||'';
 if(state.includes('?'))state=state.slice(state.indexOf('?')+1);
 return q.get('perf')==='1'||new URLSearchParams(state).get('perf')==='1';
})();
const today=()=>{const a=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return `${a.year}-${a.month}-${a.day}`;};
const uuid=()=>crypto.randomUUID();
const safeText=s=>String(s??'');
function toast(message){
 const e=$('toast');if(!e)return;
 let label=message;
 if(PERF_MODE&&/更新しました|保存しました/.test(message)&&S.lastPerf){
   const phase=name=>Number(new RegExp(name+';dur=([0-9]+)').exec(S.lastPerf.serverTiming)?.[1]||0);
   const seconds=ms=>(ms/1000).toFixed(1)+'秒';
   const post=phase('gas_post'),content=phase('gas_content');
    label+='（通信 '+seconds(S.lastPerf.totalMs)+' / LINE '+seconds(phase('line'))+
      ' / GAS '+seconds(phase('gas'))+
      (post||content?' / GAS POST '+seconds(post)+' / 応答GET '+seconds(content):'')+'）';
 }
 e.textContent=label;e.classList.add('show');
 clearTimeout(S.timer);S.timer=setTimeout(()=>e.classList.remove('show'),PERF_MODE?4200:2500);
}
function renderGasProfile_(timings){
 if(!PERF_MODE||!timings||typeof timings!=='object')return;
 const panel=$('perfBreakdown'),out=$('perfBreakdownText');if(!panel||!out)return;
 const ms=key=>Number.isSafeInteger(timings[key])&&timings[key]>=0?timings[key]+'ms':'—';
 const phases=[
  ['スプレッドシート取得','spreadsheetOpenMs'],['会員確認','memberAuthMs'],
  ['ロック待ち','lockWaitMs'],['操作履歴照合','auditReadMs'],
  ['日程読込','practiceReadMs'],['収支表読込','ledgerReadMs'],
  ['参加者読込','attendeeReadMs'],['集金記録読込','paymentReadMs'],
  ['整合性・計算','validationMs'],['集金記録保存','paymentWriteMs'],
  ['収支表保存','ledgerWriteMs'],['操作履歴保存','auditWriteMs'],
  ['GAS処理計','handlerMs']
 ];
 out.textContent=phases.map(([name,key])=>name+'：'+ms(key)).join('\n');
 panel.hidden=false;panel.open=true;
}
function dialog(id){const e=$(id);if(e&&!e.open)e.showModal();}
function close(id){if($(id)?.open)$(id).close();}
function gateEdit(){if(!S.actor||!['duty','admin'].includes(S.actor.role))throw new Error('当番チームの権限がありません');}
async function call(path,payload={}){
 if(!S.token||!CONFIG.apiBaseUrl)throw new Error('LINE認証またはAPI設定がありません');
 const url=CONFIG.apiBaseUrl.replace(/\/$/,'')+path;
 // Invalidate responses from reads that started before a write.
 if(['/api/payment','/api/category','/api/adjustment','/api/expense','/api/ledger/change','/api/schedule/change'].includes(path))S.updateEpoch++;
 const startedAt=performance.now();
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+S.token},body:JSON.stringify(payload),cache:'no-store'});
 if(PERF_MODE){
   S.lastPerf={path,totalMs:Math.round(performance.now()-startedAt),
     serverTiming:response.headers.get('Server-Timing')||''};
   console.info('[STAGE PERF]',S.lastPerf.path,S.lastPerf.totalMs+'ms',S.lastPerf.serverTiming);
 }
 let value;try{value=await response.json();}catch{throw new Error('サーバーからの応答を読み取れません');}
 if(!response.ok||!value.ok){const err=new Error(value.error||'処理を完了できませんでした');err.status=response.status;throw err;}
 return value.data;
}
// Collection checkboxes are independent. Only up to two requests leave this page
// concurrently. Apps Script's lock remains the source of truth for the ledger.
const MAX_PAYMENT_IN_FLIGHT=2;
function syncPaymentControls(){
 const pending=S.pending.size>0,ledger=S.overview?.ledger;
 for(const id of ['date','refresh','reimbursementBtn','manageBtn']){
   const el=$(id);if(el)el.disabled=pending;
 }
 if($('confirm'))$('confirm').disabled=pending||!ledger||ledger.status==='confirmed'||S.overview?.practice?.date>today();
 for(const id of ['adjustment','expense']){
   const el=$(id);if(el)el.disabled=pending||!ledger||ledger.status==='confirmed';
 }
 // A failed payment requires a manual reconciliation. Disable every unchecked
 // row as well as the in-flight rows until the latest overview is fetched.
 const list=$('list');
 if(list&&typeof list.querySelectorAll==='function'){
   for(const checkbox of list.querySelectorAll('.participant-card input[type="checkbox"]')){
     const id=checkbox.closest('.participant-card')?.dataset?.id;
     checkbox.disabled=!ledger||ledger.status==='confirmed'||S.paymentNeedsRefresh||S.pending.has(id);
   }
 }
}
function drainPaymentQueue_(){
 if(S.paymentNeedsRefresh){
   while(S.paymentQueue.length){
     const item=S.paymentQueue.shift(),error=new Error('未送信の集金変更は中断しました。更新で状態を確認してください。');
     error.notSent=true;item.reject(error);
   }
   return;
 }
 while(S.paymentActive<MAX_PAYMENT_IN_FLIGHT&&S.paymentQueue.length){
   const job=S.paymentQueue.shift();
   S.paymentActive++;
   Promise.resolve().then(()=>{job.onStart();return job.action();})
     .then(job.resolve,error=>{
       // Set the fault BEFORE freeing the slot; otherwise a queued third write
       // could start between an HTTP error and the caller's catch handler.
       S.paymentNeedsRefresh=true;
       drainPaymentQueue_(); // cancel unsent requests before another slot is freed
       job.reject(error);
     }).finally(()=>{S.paymentActive--;drainPaymentQueue_();});
 }
}
function paymentCall_(action,onStart){
 return new Promise((resolve,reject)=>{
   S.paymentQueue.push({action,onStart,resolve,reject});
   drainPaymentQueue_();
 });
}
async function showPaymentError_(error){
 if(error?.notSent)return;
 await window.SMStageUX.showError(error);
}
async function guard(action,label='処理中です…'){
 if(S.pending.size){toast('集金処理中です。完了後に操作してください。');return;}
 try{await window.SMStageUX.run(label,action);}
 catch(e){
   await window.SMStageUX.showError(e);
   if(e.status===409)await reload(false).catch(()=>{});
 }
}
async function boot(){
 for(const id of ['confirm','reimbursementBtn','manageBtn','refresh','adjustment','expense','newLedgerRow'])$(id).disabled=true;
 try{
  if(!CONFIG.liveLiffId||CONFIG.liveLiffId.includes('REPLACE_')||!CONFIG.apiBaseUrl||CONFIG.apiBaseUrl.includes('REPLACE_'))throw new Error('runtime-config.js の設定が必要です');
  if(!window.liff)throw new Error('LINE SDKを読み込めませんでした');
  await liff.init({liffId:CONFIG.liveLiffId});
  if(!liff.isLoggedIn()){liff.login({redirectUri:location.href});return;}
  S.token=liff.getIDToken();if(!S.token)throw new Error('LINE IDトークンを取得できません');
  S.actor=await call('/api/session');gateEdit();
  window.SMLiveAccess?.setup({api:call,actor:S.actor});
  for(const id of ['reimbursementBtn','manageBtn','refresh','adjustment','expense'])$(id).disabled=false;
  await reload(true);setInterval(()=>{if(!document.hidden&&!S.paymentNeedsRefresh&&S.pending.size===0&&!S.loading&&!window.SMStageUX.isBusy())reload(false).catch(()=>{});},8000);
  toast('接続しました');
 }catch(e){
  $('list').textContent=e.message;throw e;
 }
}
async function reload(refreshDates){
 if(S.loading||S.pending.size)return;S.loading=true;
 const epoch=S.updateEpoch,selected=S.practiceId;
 try{
   const d=await call('/api/overview',{practiceId:S.practiceId});
   if(epoch!==S.updateEpoch||S.pending.size||selected!==S.practiceId)return;
   if(refreshDates||!S.practiceId){$('date').replaceChildren(...d.practices.map(p=>new Option(`${window.SMDate.date(p.date)} ${p.startTime}～${p.endTime}`,p.practiceId)));}
   S.practiceId=d.practice.practiceId;$('date').value=S.practiceId;S.overview=d;
   S.paymentNeedsRefresh=false;
   renderHome();syncPaymentControls();
 }finally{S.loading=false;}
}
function renderHome(){const v=S.overview;if(!v)return;const {practice,ledger,participants}=v;
 $('place').textContent='場所：'+practice.place;$('hours').textContent='時間：'+practice.hours+'h';
 $('count').textContent='参加者：'+v.attendingCount+'名';$('completedCount').textContent='集金完了：'+v.completedCount+'名';
 if(document.activeElement!==$('adjustment'))$('adjustment').value=ledger?.adjustment??0;
 if(document.activeElement!==$('expense'))$('expense').value=ledger?.expense??0;
 const homeLocked=!ledger||ledger.status==='confirmed';
 const reason=$('collectionLockReason');
 if(reason){
   reason.textContent=!ledger?'この開催日は集金・収支データが未作成のため、集金操作はできません。':ledger.status==='confirmed'?'この開催日の収支は確定済みです。確定解除は管理者が収支表から実施してください。':'';
   reason.hidden=!reason.textContent;
 }
 $('confirm').disabled=homeLocked||practice.date>today();$('confirm').textContent=ledger?.status==='confirmed'?'確定済':'収支を確定';
 $('adjustment').disabled=homeLocked;$('expense').disabled=homeLocked;
 const list=$('list'),pos=list.scrollTop;list.replaceChildren();
 for(const p of M.sortParticipants(participants)){
   const card=document.createElement('div');card.className='participant-card'+(p.collectionCompleted?' checked':'');card.dataset.id=p.participantId;
   const info=document.createElement('div');info.className='info';const nameRow=document.createElement('div');nameRow.className='name-row';
   const name=document.createElement('span');name.className='name';name.textContent=(p.number ? (p.number+'. ') : '')+M.normalizeName(p.name);
   const cat=document.createElement('span');cat.className='type long-press-type';cat.textContent=M.CATEGORY_LABEL[p.category]||p.category;cat.title='長押しで変更';
   const amt=document.createElement('span');amt.className='amount';amt.textContent='('+yen(p.fee)+')';
   nameRow.append(name,cat,amt);info.append(nameRow);
   if(p.memo){const memo=document.createElement('div');memo.className='meta';memo.textContent='📝 '+p.memo;info.append(memo);}
   const wrapper=document.createElement('div');wrapper.className='checkbox-container';
   const cb=document.createElement('input');cb.type='checkbox';cb.checked=!!p.collectionCompleted;
   cb.disabled=homeLocked||S.paymentNeedsRefresh||S.pending.has(p.participantId);
   cb.setAttribute('aria-label',M.normalizeName(p.name)+' 集金');
   const state=document.createElement('span');state.className='payment-checkbox-state';state.hidden=true;
   state.setAttribute('role','status');state.setAttribute('aria-live','polite');
   cb.addEventListener('change',()=>setPayment(p,cb,card).catch(showPaymentError_));
   wrapper.append(state,cb);card.append(info,wrapper);list.append(card);setupLongPress(cat,p);
 }list.scrollTop=pos;updateFooter();
}
function updateFooter(){const v=S.overview;if(!v)return;const rows=v.participants.filter(p=>p.attending);const complete=rows.filter(p=>p.collectionCompleted);
 const collected=complete.reduce((a,p)=>a+p.fee,0),expected=rows.reduce((a,p)=>a+p.fee,0),adj=Number($('adjustment').value)||0,expense=Number($('expense').value)||0;
 $('income').textContent='集金額：'+yen(collected)+' / '+yen(expected);$('adjustmentDisplay').textContent='当日補正：('+(adj>=0?'+':'')+yen(adj)+')';
 $('expenseDisplay').textContent='支出：'+yen(expense);
 // Optimistic wallet estimate uses server-posted balance plus local amount deltas, without treating today's delta as the whole wallet.
 const posting=v.ledger;const localIncome=collected+adj;
 const provisional=(posting?.balance??0)+(localIncome-(posting?.income??0))-(expense-(posting?.expense??0));
 $('balance').textContent=posting?'残金：'+yen(provisional):'残金：—';
 $('completedCount').textContent='集金完了：'+complete.length+'名';
}
async function setPayment(p,cb,card){
 gateEdit();const id=p.participantId;
 if(S.pending.has(id))return;
 if(S.paymentNeedsRefresh){
   cb.checked=!!p.collectionCompleted;toast('保存状態を確認するため「更新」を押してください。');return;
 }
 const before=p.collectionCompleted,checked=cb.checked,version=p.paymentVersion;
 const practiceId=S.practiceId,request={operationId:uuid(),practiceId,participantId:id,
   completed:checked,expectedVersion:version,profileTimings:PERF_MODE};
 S.pending.add(id);cb.disabled=true;card.classList.add('payment-saving');
 const state=card.querySelector('.payment-checkbox-state');
 if(state){state.hidden=false;state.textContent='順番待ち…';}
 syncPaymentControls();
 p.collectionCompleted=checked;card.classList.toggle('checked',checked);updateFooter();
 try{
   // Only two requests in flight. GAS still serializes financial mutations.
   // Validate inside the queued job. A malformed 200 response must block
   // unsubmitted payments BEFORE a request slot becomes free.
   const saved=await paymentCall_(
     async()=>{
       const result=await call('/api/payment',request);
       if(result?.practiceId!==practiceId||result?.participantId!==id||result.completed!==checked||
          result.version!==version+1||!Number.isSafeInteger(result.ledgerVersion)||
          !Number.isSafeInteger(result.balance)||!Number.isSafeInteger(result.income)){
         const e=new Error('保存結果を確認できませんでした。「更新」で最新状態をご確認ください。');
         e.appliedButRefreshFailed=true;throw e;
       }
       return result;
     },
     ()=>{if(state)state.textContent='保存中…';}
   );
   p.paymentVersion=saved.version;
   const ledger=S.overview?.ledger;
   // Responses may arrive in a different order than committed financial writes.
   if(ledger&&saved.ledgerVersion>ledger.version){
     ledger.version=saved.ledgerVersion;ledger.income=saved.income;ledger.balance=saved.balance;
   }
   updateFooter();renderGasProfile_(saved.gasTimings);toast('集金処理を更新しました');
 }catch(e){
   S.paymentNeedsRefresh=true;
   // A failed POST may already have committed. Revert only known rejection or
   // unsent queued actions, never an ambiguous network failure.
   const definitelyNotSaved=e.notSent||(Number.isInteger(e.status)&&e.status>=400&&e.status<500);
   if(definitelyNotSaved){
     p.collectionCompleted=before;cb.checked=before;card.classList.toggle('checked',before);
   }
   updateFooter();
   drainPaymentQueue_(); // Stop the queued, unsubmitted financial writes.
   throw e;
 }finally{
   S.pending.delete(id);card.classList.remove('payment-saving');
   if(state){state.textContent='';state.hidden=true;}
   cb.disabled=S.paymentNeedsRefresh||S.overview?.ledger?.status==='confirmed';
   syncPaymentControls();
 }
}
function setupLongPress(element,p){let timer=null,started=false;
 const stop=()=>{if(timer)clearTimeout(timer);timer=null;};
 element.addEventListener('pointerdown',event=>{if(event.button!==0)return;started=true;stop();timer=setTimeout(()=>{if(started&&!S.pending.size&&!S.paymentNeedsRefresh&&S.overview?.ledger?.status==='open'){$('categoryPerson').textContent=M.normalizeName(p.name);$('categorySelect').value=p.category;S.modalTarget=p;dialog('categoryDialog');}},650);});
 for(const ev of ['pointerup','pointercancel','pointerleave'])element.addEventListener(ev,()=>{started=false;stop();});
 element.addEventListener('contextmenu',event=>event.preventDefault());
}
async function saveCategory(){
 await guard(async()=>{
   gateEdit();const p=S.modalTarget;if(!p)return;
   const category=$('categorySelect').value;close('categoryDialog');
   const key='category:'+p.participantId;
   S.pending.add(key);
   try{
     const oldFee=p.fee;
     const saved=await call('/api/category',{operationId:uuid(),practiceId:S.practiceId,participantId:p.participantId,category,expectedVersion:p.categoryVersion});
     if(saved?.participantId!==p.participantId||saved.category!==category||
       !Number.isSafeInteger(saved.categoryVersion)||!Number.isSafeInteger(saved.fee)||
       !Number.isSafeInteger(saved.ledgerVersion)||!Number.isSafeInteger(saved.balance)){
       const e=new Error('保存結果を確認できませんでした。「更新」で最新状態をご確認ください。');e.appliedButRefreshFailed=true;throw e;
     }
     p.category=category;p.fee=saved.fee;p.categoryVersion=saved.categoryVersion;
     const ledger=S.overview?.ledger;
     if(ledger){
       if(p.collectionCompleted)ledger.income+=saved.fee-oldFee;
       ledger.balance=saved.balance;ledger.version=saved.ledgerVersion;
     }
     renderHome();toast('参加区分を更新しました');
   }finally{S.pending.delete(key);}
 });
}
async function saveAmount(kind){
 await guard(async()=>{
   const v=S.overview,ledger=v?.ledger;if(!ledger)throw new Error('収支行がありません');gateEdit();
   const el=$(kind==='adjustment'?'adjustment':'expense'),value=Number(el.value),old=ledger[kind];
   if(!Number.isSafeInteger(value)||kind==='expense'&&value<0){el.value=old;throw new Error('金額を確認してください');}
   S.pending.add('amount');el.disabled=true;updateFooter();
   try{
     const saved=await call(kind==='adjustment'?'/api/adjustment':'/api/expense',
       {operationId:uuid(),practiceId:S.practiceId,value,expectedVersion:ledger.version});
     if(saved?.practiceId!==S.practiceId||!Number.isSafeInteger(saved.ledgerVersion)||
       !Number.isSafeInteger(saved.income)||!Number.isSafeInteger(saved.expense)||
       !Number.isSafeInteger(saved.adjustment)||!Number.isSafeInteger(saved.balance)){
       const e=new Error('保存結果を確認できませんでした。「更新」で最新状態をご確認ください。');e.appliedButRefreshFailed=true;throw e;
     }
     Object.assign(ledger,{version:saved.ledgerVersion,income:saved.income,expense:saved.expense,
       adjustment:saved.adjustment,balance:saved.balance});
     el.value=ledger[kind];updateFooter();
     toast((kind==='adjustment'?'当日補正':'当日支出')+'を更新しました');
   }catch(e){if(!e.appliedButRefreshFailed){el.value=old;updateFooter();}throw e;
   }finally{S.pending.delete('amount');el.disabled=false;}
 });
}
async function openLedger(){await guard(async()=>{gateEdit();close('manageDialog');$('demoRole').closest('.role-controls').hidden=true;
 $('ledgerMonth').value=today().slice(0,7);await loadLedger();dialog('ledgerDialog');});}
async function loadLedger(){const month=$('ledgerMonth').value,ledger=await call('/api/ledger',{month});S.ledger=ledger;const b=$('ledgerBody');b.replaceChildren();
 const rows=[{rowId:'CARRY-'+month,date:month+'-01',label:'前月繰越',income:0,expense:0,balance:ledger.carried,confirmedBy:'',kind:'carry',status:'confirmed'},...ledger.rows.filter(r=>r.kind!=='opening')];
 for(const r of rows){const tr=document.createElement('tr');
  for(const v of [window.SMDate.date(r.date),r.label,yen(r.income),yen(r.expense),yen(r.balance),r.confirmedBy||'']){const td=document.createElement('td');td.textContent=v;tr.append(td);}
  const actions=document.createElement('td');const buttons=[];
  if(r.kind!=='carry'){
    if(r.status==='confirmed'&&S.actor.role==='admin')buttons.push(['解除','unlock']);
    else if(r.status!=='confirmed'){
      if(r.kind!=='practice')buttons.push(['修正','edit']);
      buttons.push(['削除','delete'],['確定','confirm']);
    }
  }
  for(const [label,act] of buttons){const btn=document.createElement('button');btn.type='button';btn.className=act==='delete'?'btn-danger':'btn-outline';btn.textContent=label;btn.addEventListener('click',()=>ledgerAction(act,r));actions.append(btn);}
  if(!buttons.length){const label=document.createElement('small');label.textContent=r.kind==='carry'?'－':r.status==='confirmed'?'確定済み':'操作不可';label.className='muted';actions.append(label);}
  tr.append(actions);b.append(tr);
 }
 $('ledgerTotal').textContent='残金：'+yen(ledger.closingBalance);$('nextMonth').disabled=month>=today().slice(0,7);
}
function ledgerAction(act,row){if(act==='edit'){openEditor(row);return;}S.modalTarget={act,row};$('confirmActionTitle').textContent=act==='confirm'?'収支を確定':act==='unlock'?'確定解除':'収支を削除';$('confirmActionText').textContent=row.label;dialog('confirmActionDialog');}
async function executeLedgerAction(){close('confirmActionDialog');await guard(async()=>{
 const {act,row}=S.modalTarget;await call('/api/ledger/change',{operationId:uuid(),action:act,rowId:row.rowId,expectedVersion:row.version});
 toast((act==='confirm'?'確定':act==='unlock'?'確定解除':'削除')+'しました');if($('ledgerDialog').open)await loadLedger();await reload(false);
});}
function openEditor(row=null,kind='reimbursement'){
 S.ledgerRow=row;S.mode=row?'edit':'add';$('ledgerEditTitle').textContent=row?'収支を修正':'収支を追加';
 const targetKind=row?.kind||kind;$('ledgerKind').value=targetKind;$('ledgerKind').disabled=!!row;
 $('ledgerPayoutDate').value=row?.date||today();$('ledgerReimbursementItem').value=row?.item||'';$('ledgerReimbursementPayee').value=row?.payee||'';
 $('ledgerReimbursementAmount').value=row?.expense??'';$('ledgerEditDate').value=row?.date||today();$('ledgerEditLabel').value=row?.label||'';
 $('ledgerEditIncome').value=row?.income??0;$('ledgerEditExpense').value=row?.expense??0;
 $('ledgerReimbursementReceipt').disabled=true;$('ledgerCurrentReceipt').textContent='';
 const choices=$('ledgerPractice');choices.replaceChildren();
 const existing=new Set((S.ledger?.rows||[]).filter(r=>r.kind==='practice').map(r=>r.practiceId));
 for(const p of S.overview?.practices||[]){if(p.date<=today()&&!existing.has(p.practiceId))choices.append(new Option(window.SMDate.date(p.date)+' '+p.place,p.practiceId));}
 if(targetKind==='practice'&&!choices.length){toast('再登録できる練習日はありません');return;}
 updateEditorKind();dialog('ledgerEditDialog');
}
function updateEditorKind(){const kind=$('ledgerKind').value,practice=kind==='practice',reimb=kind==='reimbursement';
 $('ledgerReimbursementFields').hidden=!reimb;$('ledgerGeneralFields').hidden=reimb;$('practiceChoice').hidden=!practice;
 for(const id of ['ledgerPayoutDate','ledgerReimbursementItem','ledgerReimbursementPayee','ledgerReimbursementAmount'])$(id).required=reimb;
 for(const id of ['ledgerEditDate','ledgerEditLabel','ledgerEditIncome','ledgerEditExpense'])$(id).disabled=practice;
 if(practice){const id=$('ledgerPractice').value,info=S.overview.practices.find(x=>x.practiceId===id);if(info){$('ledgerEditDate').value=info.date;$('ledgerEditLabel').value=info.place;$('ledgerEditIncome').value='0';$('ledgerEditExpense').value='0';}}
 $('submitLedgerEdit').textContent=practice?'再登録する':reimb?'精算を登録':S.mode==='edit'?'変更する':'登録する';
}
function getReimbursementPayload(prefix){return {date:$(prefix==='ledger'?'ledgerPayoutDate':'payoutDate').value,
 item:$(prefix==='ledger'?'ledgerReimbursementItem':'reimbursementItem').value.trim(),
 payee:M.normalizeName($(prefix==='ledger'?'ledgerReimbursementPayee':'reimbursementPayee').value),
 amount:Number($(prefix==='ledger'?'ledgerReimbursementAmount':'reimbursementAmount').value)};}
async function submitEditor(event){event.preventDefault();await guard(async()=>{
 gateEdit();const kind=$('ledgerKind').value;let payload={operationId:uuid(),action:S.mode==='edit'?'edit':'add',kind};
 if(S.mode==='edit'){payload.rowId=S.ledgerRow.rowId;payload.expectedVersion=S.ledgerRow.version;}
 else if(kind!=='practice')payload.rowId=(kind==='reimbursement'?'R-':'O-')+uuid();
 if(kind==='reimbursement')Object.assign(payload,getReimbursementPayload('ledger'));
 else if(kind==='practice')payload.practiceId=$('ledgerPractice').value;
 else Object.assign(payload,{date:$('ledgerEditDate').value,label:$('ledgerEditLabel').value.trim(),income:Number($('ledgerEditIncome').value),expense:Number($('ledgerEditExpense').value)});
 await call('/api/ledger/change',payload);close('ledgerEditDialog');toast(S.mode==='edit'?'修正しました':'登録しました');await loadLedger();await reload(false);
});}
async function submitReimbursement(event){event.preventDefault();await guard(async()=>{
 gateEdit();await call('/api/ledger/change',{operationId:uuid(),action:'add',kind:'reimbursement',rowId:'R-'+uuid(),...getReimbursementPayload('header')});
 close('reimbursementDialog');$('reimbursementForm').reset();toast('立替精算を登録しました');await reload(false);
});}

// v0.16.37b: legacy v7 surface, new ID-based cash audit backend.
// This optional check stores denomination snapshots, NEVER mutates ledger money.
const CASH=window.SMCashReconcile;
const CASH_LABELS={10000:'1万円札',5000:'5千円札',1000:'千円札',500:'500円玉',100:'100円玉',
  50:'50円玉',10:'10円玉',5:'5円玉',1:'1円玉'};
let cashSnapshot=null,cashCountsState=null;
function blankCashCounts(){
 return Object.fromEntries(CASH.DENOMINATIONS.map(n=>[n,0]));
}
function prepareCashDenominations(){
 const box=$('cashDenominations');if(!CASH){$('cashCounter').disabled=true;return;}
 cashCountsState=blankCashCounts();box.replaceChildren();
 for(const denom of CASH.DENOMINATIONS){
  const item=document.createElement('div');item.className='cash-denom';
  const label=document.createElement('span');label.className='cash-denom-label';label.textContent=CASH_LABELS[denom];
  const controls=document.createElement('div');controls.className='cash-controls';
  const minus=document.createElement('button');minus.type='button';minus.className='cash-count-btn cash-count-minus';minus.textContent='−';
  minus.setAttribute('aria-label',CASH_LABELS[denom]+'を1枚減らす');
  const count=document.createElement('span');count.id='cashCount'+denom;count.className='cash-count-display';count.textContent='0';
  const plus=document.createElement('button');plus.type='button';plus.className='cash-count-btn cash-count-plus';plus.textContent='+';
  plus.setAttribute('aria-label',CASH_LABELS[denom]+'を1枚増やす');
  const subtotal=document.createElement('span');subtotal.id='cashSubtotal'+denom;subtotal.className='cash-subtotal';subtotal.textContent='0円';
  minus.addEventListener('click',()=>changeCashCount(denom,-1));
  plus.addEventListener('click',()=>changeCashCount(denom,1));
  controls.append(minus,count,plus,subtotal);item.append(label,controls);box.append(item);
 }
}
function changeCashCount(denom,delta){
 if(!cashCountsState||!CASH||window.SMStageUX.isBusy())return;
 const current=cashCountsState[denom]||0;
 cashCountsState[denom]=Math.max(0,Math.min(9999,current+delta));
 renderCash();
}
function renderCash(){
 if(!CASH||!cashCountsState)return;
 const snap=cashSnapshot,status=$('cashStatus'),book=$('cashBook'),difference=$('cashDifference');
 const valid=!!(snap&&snap.found&&Number.isSafeInteger(snap.bookBalance));
 const actual=CASH.cashTotal(cashCountsState);
 for(const denom of CASH.DENOMINATIONS){
  $('cashCount'+denom).textContent=String(cashCountsState[denom]);
  $('cashSubtotal'+denom).textContent=yen(cashCountsState[denom]*denom);
 }
 $('cashActual').textContent=yen(actual);
 $('cashDateDisplay').textContent=snap?window.SMDate.date(snap.auditDate):'—';
 book.textContent=valid?yen(snap.bookBalance):'—';
 $('cashSave').disabled=!valid||snap.auditDate>today()||S.pending.size>0;
 difference.textContent=valid?
  (actual===snap.bookBalance?'0円 (一致！)':
   actual>snap.bookBalance?'+'+yen(actual-snap.bookBalance)+' (超過)':
    yen(actual-snap.bookBalance)+' (不足)'):'—';
 difference.className=!valid?'':actual===snap.bookBalance?'cash-same':
    actual>snap.bookBalance?'cash-surplus':'cash-shortage';
 status.textContent=!snap?'帳簿残金を読み込んでいます…':
  !snap.found?'⚠️ 指定された日付の行が「全体収支管理表」に見つかりません。':
  snap.updatedBy&&snap.savedBookBalance!==null&&snap.savedBookBalance!==snap.bookBalance?
  '前回確認後に帳簿残金が変わりました':'';
}
function validateCashSnapshot_(result,practiceId){
 if(!result||result.practiceId!==practiceId||result.auditDate!==S.overview?.practice?.date||
    typeof result.found!=='boolean'||!Number.isSafeInteger(result.version)||result.version<0||
    (result.found&&!Number.isSafeInteger(result.bookBalance))||!result.counts||
    typeof result.counts!=='object')
  throw new Error('現金確認データが一致しません。「更新」して再確認してください');
 const counts={};
 for(const denom of CASH.DENOMINATIONS){
  if(!Number.isSafeInteger(result.counts[denom])||result.counts[denom]<0||result.counts[denom]>9999)
   throw new Error('保存された枚数が不正です。管理者へご連絡ください');
  counts[denom]=result.counts[denom];
 }
 if(Object.keys(result.counts).length!==CASH.DENOMINATIONS.length)
  throw new Error('金種の種類が一致しません');
 return {result,counts};
}
async function refreshCashSnapshot_(){
 const practiceId=S.practiceId;
 cashSnapshot=null;renderCash();
 const response=await call('/api/cash/get',{practiceId});
 if(practiceId!==S.practiceId)throw new Error('開催日が変更されました。もう一度現金確認を開いてください');
 const validated=validateCashSnapshot_(response,practiceId);
 cashSnapshot=response;cashCountsState=validated.counts;renderCash();
}
async function openCash(){
 let ready=false;
 await guard(async()=>{
  gateEdit();if(!CASH)throw new Error('現金確認機能の読み込みに失敗しました');
  await refreshCashSnapshot_();
  ready=true;
 });
 if(ready){close('manageDialog');dialog('cashDialog');}
}
function resetCashCounts(){
 cashCountsState=blankCashCounts();renderCash();toast('枚数をリセットしました');
}
function showCashSaveConfirm(){
 if(!cashSnapshot?.found||cashSnapshot.auditDate>today())return;
 $('cashSaveMessage').textContent=window.SMDate.date(cashSnapshot.auditDate)+
  ' の金種枚数データを保存しますか？';
 dialog('cashSaveDialog');
}
async function saveCashAudit(){
 close('cashSaveDialog');
 const original=cashSnapshot;
 if(!original?.found)return;
 await guard(async()=>{
  gateEdit();
  const counts={...cashCountsState},actual=CASH.cashTotal(counts);
  let saved;
  try{
   saved=await call('/api/cash/save',{operationId:uuid(),practiceId:original.practiceId,
    counts,expectedVersion:original.version});
   if(saved?.practiceId!==original.practiceId||saved?.auditDate!==original.auditDate||
      saved.version!==original.version+1||saved.actual!==actual||
      !Number.isSafeInteger(saved.bookBalance)||saved.difference!==actual-saved.bookBalance||
      CASH.DENOMINATIONS.some(n=>saved?.counts?.[n]!==counts[n]))
    throw new Error('保存結果を確認できません。現金確認を閉じて開き直し、記録をご確認ください。');
  }catch(error){
   // The request may have committed even if the reply was lost. Block a
   // second save until a fresh snapshot has been read from GAS.
   cashSnapshot=null;renderCash();throw error;
  }
  cashSnapshot={...original,version:saved.version,bookBalance:saved.bookBalance,
    counts:saved.counts,savedBookBalance:saved.bookBalance,updatedBy:saved.updatedBy,
    updatedAt:saved.updatedAt};
  renderCash();toast('現金確認を保存しました');
 });
}


// v0.16.38a: old v7 surface, new fixed-ID practice schedule records.
const SC={rows:[],editing:null,action:null};
function scheduleDateLabel_(d){return window.SMDate.date(d);}
function scheduleDateValid_(d){return /^\d{4}-\d{2}-\d{2}$/.test(d)&&window.SMCashReconcile.validDate(d);}
function scheduleFormPayload_(){
 const date=$('scheduleDate').value.trim().replace(/\//g,'-');
 const match=/^(\d{1,2}):([0-5]\d)\s*-\s*(\d{1,2}):([0-5]\d)$/.exec($('scheduleTimeSlot').value.trim());
 const hours=Number($('scheduleHours').value),place=$('schedulePlace').value,remark=$('scheduleRemark').value.trim();
 if(!scheduleDateValid_(date)||date<today())throw new Error('本日以降の開催日を入力してください');
 if(!match||Number(match[1])>23||Number(match[3])>23)throw new Error('時間帯を確認してください');
 const startTime=String(Number(match[1])).padStart(2,'0')+':'+match[2],
   endTime=String(Number(match[3])).padStart(2,'0')+':'+match[4];
 const start=Number(startTime.slice(0,2))*60+Number(startTime.slice(3)),
   end=Number(endTime.slice(0,2))*60+Number(endTime.slice(3));
 if(end-start!==hours*60)throw new Error('時間帯と時間数が一致しません');
 if(!place||place.length>100||remark.length>200)throw new Error('開催場所・備考を確認してください');
 return {date,place,startTime,endTime,hours,remark};
}
function renderScheduleMaster_(){
 const list=$('scheduleList');list.replaceChildren();
 if(!SC.rows.length){
  const e=document.createElement('p');e.className='schedule-note';
  e.textContent='本日以降の開催予定はありません。';list.append(e);return;
 }
 for(const row of SC.rows){
  const card=document.createElement('div');card.className='schedule-card';
  const head=document.createElement('div');head.className='schedule-card-head';
  const title=document.createElement('span');title.textContent='📅 '+scheduleDateLabel_(row.date);
  const status=document.createElement('span');status.textContent=row.enabled?'✔ 確定済':'⏳ 未確定';
  status.style.color=row.enabled?'#2e7d32':'#666';head.append(title,status);
  const details=document.createElement('div');details.className='schedule-card-detail';
  const hours=document.createElement('span');hours.textContent='🕒 '+row.startTime+'-'+row.endTime+
   ' ('+row.hours+'h) @'+row.place;
  details.append(hours);
  if(row.remark){const memo=document.createElement('span');memo.textContent='📝 '+row.remark;details.append(memo);}
  const actions=document.createElement('div');actions.className='schedule-card-actions';
  for(const [action,label,css] of [['edit','修正','btn-outline'],['delete','削除','btn-danger'],['confirm',row.enabled?'確定済':'確定','btn-green']]){
   const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.className=css;
   btn.disabled=row.enabled;
   if(!row.enabled)btn.addEventListener('click',()=>action==='edit'?openScheduleEditor_(row):confirmScheduleAction_(action,row));
   actions.append(btn);
  }
  card.append(head,details,actions);list.append(card);
 }
}
async function loadScheduleMaster_(){
 const d=await call('/api/schedule/list');
 if(!Array.isArray(d?.schedules)||d.schedules.some(r=>!r?.practiceId||
   !scheduleDateValid_(r.date)||!Number.isSafeInteger(r.version)||typeof r.enabled!=='boolean')){
  throw new Error('練習日程マスタの取得結果を確認できません');
 }
 SC.rows=d.schedules.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
 renderScheduleMaster_();
}
async function openScheduleMaster_(){
 let loaded=false;
 await guard(async()=>{gateEdit();await loadScheduleMaster_();loaded=true;},'日程を読み込んでいます…');
 if(loaded){close('manageDialog');dialog('scheduleDialog');}
}
function openScheduleEditor_(row=null){
 SC.editing=row;
 $('scheduleEditTitle').textContent=row?'日程の修正':'日程の追加';
 $('scheduleDate').value=window.SMDate.date(row?.date||today(),false);
 $('scheduleTimeSlot').value=row?row.startTime+'-'+row.endTime:'9:00-13:00';
 $('scheduleHours').value=String(row?.hours||4);
 const place=$('schedulePlace');
 for(const option of Array.from(place.options))if(option.dataset.custom==='1')option.remove();
 if(row?.place&&!Array.from(place.options).some(option=>option.value===row.place)){
  const custom=new Option(row.place,row.place);custom.dataset.custom='1';place.add(custom);
 }
 place.value=row?.place||'曽谷公民館';$('scheduleRemark').value=row?.remark||'';
 dialog('scheduleEditDialog');
}
async function saveScheduleMaster_(event){
 event.preventDefault();
 const original=SC.editing;
 await guard(async()=>{
  gateEdit();
  const data=scheduleFormPayload_(),id=original?.practiceId||('PR-'+uuid());
  const result=await call('/api/schedule/change',{operationId:uuid(),action:original?'edit':'add',
   practiceId:id,expectedVersion:original?.version??0,...data});
  if(result?.practiceId!==id||result.action!==(original?'edit':'add')||
     result.version!==(original?original.version+1:1))
    throw new Error('保存結果を確認できません。最新の日程を読み直してください');
  close('scheduleEditDialog');SC.editing=null;
  await loadScheduleMaster_();
  toast(original?'日程を修正しました':'日程を追加しました');
 },'日程を保存しています…');
}
function confirmScheduleAction_(action,row){
 SC.action={action,row};
 $('scheduleActionTitle').textContent=action==='delete'?'【日程の削除】':'【日程の確定】';
 $('scheduleActionText').textContent=scheduleDateLabel_(row.date)+
  (action==='delete'?' の練習日程を削除しますか？':' の日程を受付対象に確定しますか？');
 $('scheduleActionSubmit').textContent=action==='delete'?'削除する':'確定する';
 $('scheduleActionSubmit').className=action==='delete'?'btn-danger':'btn-green';
 dialog('scheduleActionDialog');
}
async function executeScheduleAction_(){
 const target=SC.action;close('scheduleActionDialog');if(!target)return;
 await guard(async()=>{
  gateEdit();const {action,row}=target;
  const result=await call('/api/schedule/change',{operationId:uuid(),action,
    practiceId:row.practiceId,expectedVersion:row.version});
  if(result?.practiceId!==row.practiceId||result.action!==action||
     result.version!==row.version+1)
    throw new Error('操作結果を確認できません。最新の日程を読み直してください');
  SC.action=null;await loadScheduleMaster_();
  if(action==='confirm')await reload(true);
  toast(action==='delete'?'日程を削除しました':'日程を確定しました');
 },'日程を更新しています…');
}

function bind(){
 $('date').addEventListener('change',()=>{S.practiceId=$('date').value;guard(()=>reload(false));});$('refresh').addEventListener('click',()=>guard(()=>reload(true)));
 $('categoryDialog').addEventListener('close',()=>{S.modalTarget=null;});$('cancelCategory').addEventListener('click',()=>close('categoryDialog'));$('saveCategory').addEventListener('click',saveCategory);
 $('adjustment').addEventListener('change',()=>saveAmount('adjustment'));$('expense').addEventListener('change',()=>saveAmount('expense'));
 $('receiptBtn').addEventListener('click',()=>toast('領収書アップロードは未接続です'));
 $('confirm').addEventListener('click',()=>{if(!S.overview?.ledger)return;ledgerAction('confirm',S.overview.ledger);});
 $('reimbursementBtn').addEventListener('click',()=>{$('payoutDate').value=today();$('reimbursementReceipt').disabled=true;dialog('reimbursementDialog');});
 $('cancelReimbursement').addEventListener('click',()=>close('reimbursementDialog'));$('reimbursementForm').addEventListener('submit',submitReimbursement);
 $('manageBtn').addEventListener('click',()=>dialog('manageDialog'));$('closeManage').addEventListener('click',()=>close('manageDialog'));$('openLedger').addEventListener('click',openLedger);
 prepareCashDenominations();
 $('cashCounter').addEventListener('click',openCash);
 $('cashReset').addEventListener('click',()=>dialog('cashResetDialog'));
 $('cashResetCancel').addEventListener('click',()=>close('cashResetDialog'));
 $('cashResetConfirm').addEventListener('click',()=>{close('cashResetDialog');resetCashCounts();});
 $('cashSave').addEventListener('click',showCashSaveConfirm);
 $('cashSaveCancel').addEventListener('click',()=>close('cashSaveDialog'));
 $('cashSaveConfirm').addEventListener('click',saveCashAudit);
 $('cashClose').addEventListener('click',()=>{cashSnapshot=null;close('cashDialog');});

 $('manageSchedules').addEventListener('click',openScheduleMaster_);
 $('scheduleAdd').addEventListener('click',()=>openScheduleEditor_());
 $('scheduleClose').addEventListener('click',()=>close('scheduleDialog'));
 $('scheduleReload').addEventListener('click',()=>guard(loadScheduleMaster_,'日程を読み込んでいます…'));
 $('scheduleEditCancel').addEventListener('click',()=>close('scheduleEditDialog'));
 $('scheduleEditForm').addEventListener('submit',saveScheduleMaster_);
 $('scheduleActionCancel').addEventListener('click',()=>close('scheduleActionDialog'));
 $('scheduleActionSubmit').addEventListener('click',executeScheduleAction_);
 $('managePeople').disabled=true;
 $('ledgerMonth').addEventListener('change',()=>guard(loadLedger));$('prevMonth').addEventListener('click',()=>shiftMonth(-1));$('nextMonth').addEventListener('click',()=>shiftMonth(1));
 $('closeLedger').addEventListener('click',()=>close('ledgerDialog'));$('newLedgerRow').addEventListener('click',()=>openEditor());
 $('ledgerKind').addEventListener('change',updateEditorKind);$('ledgerPractice').addEventListener('change',updateEditorKind);
 $('cancelLedgerEdit').addEventListener('click',()=>close('ledgerEditDialog'));$('ledgerEditForm').addEventListener('submit',submitEditor);
 $('cancelConfirmAction').addEventListener('click',()=>close('confirmActionDialog'));$('doConfirmAction').addEventListener('click',executeLedgerAction);
 $('closeModal').addEventListener('click',()=>close('modal'));
}
function shiftMonth(amount){const [year,month]=$('ledgerMonth').value.split('-').map(Number);const dt=new Date(Date.UTC(year,month-1+amount,1));const next=dt.toISOString().slice(0,7);if(next>today().slice(0,7))return;$('ledgerMonth').value=next;guard(loadLedger);}
bind();
window.SMStageUX.run('読み込み中です…',boot)
 .then(()=>window.SMLiveAccess?.openFromCheckLink?.())
 .catch(e=>window.SMStageUX.showError(e));

// Match screen launch: current selected practice, same LINE login context.
if(document.getElementById("matchManage")){document.getElementById("matchManage").addEventListener("click",()=>{if(!CONFIG.liffId||CONFIG.liffId.includes("REPLACE_")){toast("対戦表LIFFが設定されていません");return;}window.location.href="https://liff.line.me/"+encodeURIComponent(CONFIG.liffId)+"?practiceId="+encodeURIComponent(S.practiceId||"");});}
