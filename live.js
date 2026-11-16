/**
 * Connected smoke-test UI based on v0.7. No demo fallback: do not confuse
 * fake data with live club finances. LINE ID token is kept only in memory.
 * Business permission and concurrency decisions are always server-side.
 */
'use strict';
const M=window.SmashModel,$=id=>document.getElementById(id),yen=n=>Number(n).toLocaleString('ja-JP')+'円';
const CONFIG=window.SMASH_CONFIG||{};
const S={token:'',actor:null,overview:null,practiceId:'',loading:false,pending:new Set(),ledger:null,ledgerRow:null,mode:'add',modalTarget:null,timer:null};
const today=()=>{const a=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return `${a.year}-${a.month}-${a.day}`;};
const uuid=()=>crypto.randomUUID();
const safeText=s=>String(s??'');
function toast(message){const e=$('toast');if(!e)return;e.textContent=message;e.classList.add('show');clearTimeout(S.timer);S.timer=setTimeout(()=>e.classList.remove('show'),2500);}
function dialog(id){const e=$(id);if(e&&!e.open)e.showModal();}
function close(id){if($(id)?.open)$(id).close();}
function gateEdit(){if(!S.actor||!['duty','admin'].includes(S.actor.role))throw new Error('当番チームの権限がありません');}
async function call(path,payload={}){
 if(!S.token||!CONFIG.apiBaseUrl)throw new Error('LINE認証またはAPI設定がありません');
 const url=CONFIG.apiBaseUrl.replace(/\/$/,'')+path;
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+S.token},body:JSON.stringify(payload),cache:'no-store'});
 let value;try{value=await response.json();}catch{throw new Error('サーバーからの応答を読み取れません');}
 if(!response.ok||!value.ok){const err=new Error(value.error||'処理を完了できませんでした');err.status=response.status;throw err;}
 return value.data;
}
async function guard(action){try{await action();}catch(e){toast(e.message||String(e));if(e.status===409)await reload(false).catch(()=>{});}}
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
  await reload(true);setInterval(()=>{if(!document.hidden&&S.pending.size===0)reload(false).catch(()=>{});},8000);
  toast('接続しました');
 }catch(e){
  $('list').textContent=e.message;toast(e.message);
 }
}
async function reload(refreshDates){
 if(S.loading||S.pending.size)return;S.loading=true;
 try{
   const d=await call('/api/overview',{practiceId:S.practiceId});
   if(refreshDates||!S.practiceId){$('date').replaceChildren(...d.practices.map(p=>new Option(`${p.date.replace(/-/g,'/')} ${p.startTime}～${p.endTime}`,p.practiceId)));}
   S.practiceId=d.practice.practiceId;$('date').value=S.practiceId;S.overview=d;
   renderHome();
 }finally{S.loading=false;}
}
function renderHome(){const v=S.overview;if(!v)return;const {practice,ledger,participants}=v;
 $('place').textContent='場所：'+practice.place;$('hours').textContent='時間：'+practice.hours+'h';
 $('count').textContent='参加者：'+v.attendingCount+'名';$('completedCount').textContent='集金完了：'+v.completedCount+'名';
 if(document.activeElement!==$('adjustment'))$('adjustment').value=ledger?.adjustment??0;
 if(document.activeElement!==$('expense'))$('expense').value=ledger?.expense??0;
 const homeLocked=!ledger||ledger.status==='confirmed';
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
   const wrapper=document.createElement('div');wrapper.className='checkbox-container';const cb=document.createElement('input');cb.type='checkbox';cb.checked=!!p.collectionCompleted;cb.disabled=homeLocked;
   cb.addEventListener('change',()=>guard(async()=>setPayment(p,cb,card)));
   wrapper.append(cb);card.append(info,wrapper);list.append(card);setupLongPress(cat,p);
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
async function setPayment(p,cb,card){gateEdit();const id=p.participantId;if(S.pending.has(id))return;
 S.pending.add(id);cb.disabled=true;const before=p.collectionCompleted;p.collectionCompleted=cb.checked;card.classList.toggle('checked',cb.checked);updateFooter();
 try{
   await call('/api/payment',{operationId:uuid(),practiceId:S.practiceId,participantId:id,completed:cb.checked,expectedVersion:p.paymentVersion});
   toast('集金処理を更新しました');
 }catch(e){p.collectionCompleted=before;cb.checked=before;card.classList.toggle('checked',before);updateFooter();throw e;
 }finally{S.pending.delete(id);cb.disabled=S.overview?.ledger?.status==='confirmed';await reload(false).catch(()=>{});}
}
function setupLongPress(element,p){let timer=null,started=false;
 const stop=()=>{if(timer)clearTimeout(timer);timer=null;};
 element.addEventListener('pointerdown',event=>{if(event.button!==0)return;started=true;stop();timer=setTimeout(()=>{if(started&&S.overview?.ledger?.status==='open'){$('categoryPerson').textContent=M.normalizeName(p.name);$('categorySelect').value=p.category;S.modalTarget=p;dialog('categoryDialog');}},650);});
 for(const ev of ['pointerup','pointercancel','pointerleave'])element.addEventListener(ev,()=>{started=false;stop();});
 element.addEventListener('contextmenu',event=>event.preventDefault());
}
async function saveCategory(){await guard(async()=>{gateEdit();const p=S.modalTarget;if(!p)return;
 const category=$('categorySelect').value;close('categoryDialog');
 S.pending.add('category:'+p.participantId);
 try{await call('/api/category',{operationId:uuid(),practiceId:S.practiceId,participantId:p.participantId,category,expectedVersion:p.categoryVersion});toast('参加区分を更新しました');}
 finally{S.pending.delete('category:'+p.participantId);await reload(false);}
});}
async function saveAmount(kind){await guard(async()=>{
 const v=S.overview,ledger=v?.ledger;if(!ledger)throw new Error('収支行がありません');gateEdit();
 const el=$(kind==='adjustment'?'adjustment':'expense'),value=Number(el.value),old=ledger[kind];
 if(!Number.isSafeInteger(value)||kind==='expense'&&value<0){el.value=old;throw new Error('金額を確認してください');}
 S.pending.add('amount');el.disabled=true;updateFooter();
 try{
   await call(kind==='adjustment'?'/api/adjustment':'/api/expense',{operationId:uuid(),practiceId:S.practiceId,value,expectedVersion:ledger.version});toast((kind==='adjustment'?'当日補正':'当日支出')+'を更新しました');
 }catch(e){el.value=old;updateFooter();throw e;
 }finally{S.pending.delete('amount');el.disabled=false;await reload(false).catch(()=>{});}
});}
async function openLedger(){await guard(async()=>{gateEdit();close('manageDialog');$('demoRole').closest('.role-controls').hidden=true;
 $('ledgerMonth').value=today().slice(0,7);await loadLedger();dialog('ledgerDialog');});}
async function loadLedger(){const month=$('ledgerMonth').value,ledger=await call('/api/ledger',{month});S.ledger=ledger;const b=$('ledgerBody');b.replaceChildren();
 const rows=[{rowId:'CARRY-'+month,date:month+'-01',label:'前月繰越',income:0,expense:0,balance:ledger.carried,confirmedBy:'',kind:'carry',status:'confirmed'},...ledger.rows.filter(r=>r.kind!=='opening')];
 for(const r of rows){const tr=document.createElement('tr');
  for(const v of [r.date,r.label,yen(r.income),yen(r.expense),yen(r.balance),r.confirmedBy||'']){const td=document.createElement('td');td.textContent=v;tr.append(td);}
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
 for(const p of S.overview?.practices||[]){if(p.date<=today()&&!existing.has(p.practiceId))choices.append(new Option(p.date+' '+p.place,p.practiceId));}
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
function bind(){
 $('date').addEventListener('change',()=>{S.practiceId=$('date').value;guard(()=>reload(false));});$('refresh').addEventListener('click',()=>guard(()=>reload(true)));
 $('categoryDialog').addEventListener('close',()=>{S.modalTarget=null;});$('cancelCategory').addEventListener('click',()=>close('categoryDialog'));$('saveCategory').addEventListener('click',saveCategory);
 $('adjustment').addEventListener('change',()=>saveAmount('adjustment'));$('expense').addEventListener('change',()=>saveAmount('expense'));
 $('receiptBtn').addEventListener('click',()=>toast('領収書アップロードは未接続です'));
 $('confirm').addEventListener('click',()=>{if(!S.overview?.ledger)return;ledgerAction('confirm',S.overview.ledger);});
 $('reimbursementBtn').addEventListener('click',()=>{$('payoutDate').value=today();$('reimbursementReceipt').disabled=true;dialog('reimbursementDialog');});
 $('cancelReimbursement').addEventListener('click',()=>close('reimbursementDialog'));$('reimbursementForm').addEventListener('submit',submitReimbursement);
 $('manageBtn').addEventListener('click',()=>dialog('manageDialog'));$('closeManage').addEventListener('click',()=>close('manageDialog'));$('openLedger').addEventListener('click',openLedger);
 for(const id of ['cashCounter','manageSchedules','managePeople'])$(id).disabled=true;
 $('ledgerMonth').addEventListener('change',()=>guard(loadLedger));$('prevMonth').addEventListener('click',()=>shiftMonth(-1));$('nextMonth').addEventListener('click',()=>shiftMonth(1));
 $('closeLedger').addEventListener('click',()=>close('ledgerDialog'));$('newLedgerRow').addEventListener('click',()=>openEditor());
 $('ledgerKind').addEventListener('change',updateEditorKind);$('ledgerPractice').addEventListener('change',updateEditorKind);
 $('cancelLedgerEdit').addEventListener('click',()=>close('ledgerEditDialog'));$('ledgerEditForm').addEventListener('submit',submitEditor);
 $('cancelConfirmAction').addEventListener('click',()=>close('confirmActionDialog'));$('doConfirmAction').addEventListener('click',executeLedgerAction);
 $('closeModal').addEventListener('click',()=>close('modal'));
}
function shiftMonth(amount){const [year,month]=$('ledgerMonth').value.split('-').map(Number);const dt=new Date(Date.UTC(year,month-1+amount,1));const next=dt.toISOString().slice(0,7);if(next>today().slice(0,7))return;$('ledgerMonth').value=next;guard(loadLedger);}
bind();boot();

// Match screen launch: current selected practice, same LINE login context.
if(document.getElementById("matchManage")){document.getElementById("matchManage").addEventListener("click",()=>{window.location.href="match.html?practiceId="+encodeURIComponent(S.practiceId||"");});}
