/* Pure domain helpers. All money in integer JPY. DEMO SETTINGS, not production fees. */
(function(root){
'use strict';
const CATEGORY_ORDER=Object.freeze({member:0,student:1,visitor:2,duty:3,shuttle:4});
const CATEGORY_LABEL=Object.freeze({member:'メンバー',student:'学生',visitor:'ビジター',duty:'当番担当',shuttle:'シャトル担当'});
const DEMO_BASE_FEES=Object.freeze({member:800,student:400,visitor:1000,duty:400,shuttle:400});
function normalizeName(name){return String(name??'').normalize('NFKC').replace(/\s|\u00a0|\u3000/gu,'').trim();}
function sortParticipants(rows){const collator=new Intl.Collator('ja',{sensitivity:'base',numeric:true});return [...rows].sort((a,b)=>{const aRank=CATEGORY_ORDER[a.category]??99,bRank=CATEGORY_ORDER[b.category]??99;return aRank-bRank||collator.compare(normalizeName(a.nameKana||a.name),normalizeName(b.nameKana||b.name))||String(a.participantId).localeCompare(String(b.participantId));});}
function feeForCategory(category,hours=4){const base=DEMO_BASE_FEES[category];if(base===undefined)throw new Error('未定義の参加区分');const multiplier=hours===4?1:hours===3?7/8:hours===2?6/8:null;if(multiplier===null)throw new Error('未定義の練習時間');return Math.ceil(base*multiplier/100)*100;}
function applyCollectionCompletion(rows,participantId,completed){return rows.map(p=>p.participantId===participantId?{...p,collectionCompleted:!!completed}:p);}
function applyAttendance(rows,participantId,attending){return rows.map(p=>p.participantId===participantId?{...p,attending:!!attending}:p);}
function applyCategoryChange(rows,participantId,newCategory,hours=4){return rows.map(p=>p.participantId===participantId?{...p,category:newCategory,fee:feeForCategory(newCategory,hours)}:p);}
function yenAmount(value,label='金額',allowNegative=false){const n=Number(value);if(value===''||value===null||value===undefined||!Number.isSafeInteger(n)||(!allowNegative&&n<0))throw new Error(label+'は'+(allowNegative?'整数':'0以上の整数')+'で入力してください');return n;}
/** Completed indicates collection HANDLING is done, not the existence of an individual cash receipt. */
function totals(rows,expense=0,adjustment=0){const attending=rows.filter(p=>p.attending);const completedRows=attending.filter(p=>p.collectionCompleted);const completedFee=completedRows.reduce((s,p)=>s+yenAmount(p.fee,'参加費'),0);const expected=attending.reduce((s,p)=>s+yenAmount(p.fee,'参加費'),0);const extraIncome=yenAmount(adjustment,'当日補正',true),spent=yenAmount(expense,'当日支出');return {attending:attending.length,completed:completedRows.length,completedFee,adjustment:extraIncome,income:completedFee+extraIncome,expected,expense:spent,netChange:completedFee+extraIncome-spent};}
function validIsoDate(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))return false;const d=new Date(String(date)+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===String(date);}
/** A reimbursement is a new wallet cash-out on the PAYMENT date, not a purchase-time cash expense. */
function createReimbursement(input,existing=[]){const date=String(input.date||'');if(!validIsoDate(date))throw new Error('精算日を正しい日付で入力してください');const item=String(input.item||'').trim(),payee=normalizeName(input.payee),confirmedBy=normalizeName(input.confirmedBy);if(!item||!payee||!confirmedBy)throw new Error('費目・立替者・確認者は必須です');const amount=yenAmount(input.amount,'精算額');if(amount<=0)throw new Error('精算額は1円以上で入力してください');const transactionId=String(input.transactionId||'').trim(),operationId=String(input.operationId||'').trim();if(!transactionId||!operationId)throw new Error('取引ID・操作IDが必要です');if(existing.some(t=>t.operationId===operationId))throw new Error('同じ精算操作が登録済みです');if(existing.some(t=>t.transactionId===transactionId))throw new Error('取引IDが重複しています');return {transactionId,operationId,date,item,payee,amount,confirmedBy,posted:true};}
/** Whole-wallet ledger in chronological order. Opening cash is CARRY-FORWARD, never income. */
function buildLedger({openingBalance,openingDate,practiceInfo,practiceState,reimbursements=[]}){
 const opening=yenAmount(openingBalance,'引継残高');if(!validIsoDate(openingDate))throw new Error('引継日が不正です');
 const rows=[{rowId:'OPENING',date:openingDate,sortAt:openingDate+'T00:00:00',label:'前回からの引継',income:0,expense:0,confirmedBy:'',kind:'opening'}];
 for(const [practiceId,info] of Object.entries(practiceInfo)){
  const data=practiceState[practiceId];if(!data)continue;
  if(!validIsoDate(info.date)||info.date<openingDate)throw new Error('引継日より前の練習日はこの台帳に登録できません');
  const t=totals(data.rows,data.expense,data.adjustment);
  rows.push({rowId:'P-'+practiceId,practiceId,date:info.date,sortAt:info.date+'T'+(info.endTime||'23:59')+':00',label:info.place,income:t.income,expense:t.expense,confirmedBy:data.confirmedBy||'',kind:'practice',status:data.status||'open'});
 }
 for(const t of reimbursements){
  if(!validIsoDate(t.date)||t.date<openingDate)throw new Error('引継日より前の立替精算日はこの台帳に登録できません');
  rows.push({rowId:t.transactionId,date:t.date,sortAt:t.date+'T'+(t.time||'23:59')+':30',label:'立替精算：'+t.item+'（'+t.payee+'）',income:0,expense:yenAmount(t.amount,'精算額'),confirmedBy:t.confirmedBy,kind:'reimbursement',transactionId:t.transactionId});
 }
 const priority={opening:0,practice:1,reimbursement:2};
 rows.sort((a,b)=>a.sortAt.localeCompare(b.sortAt)||(priority[a.kind]-priority[b.kind])||a.rowId.localeCompare(b.rowId));
 let running=opening;
 return rows.map(r=>{if(r.kind!=='opening')running+=r.income-r.expense;return {...r,balance:running};});
}
function balanceOnDate(ledger,date){if(!validIsoDate(date))throw new Error('日付が不正です');const eligible=ledger.filter(r=>r.date<=date);return eligible.length?eligible[eligible.length-1].balance:null;}
const api={CATEGORY_ORDER,CATEGORY_LABEL,DEMO_BASE_FEES,normalizeName,sortParticipants,feeForCategory,applyCollectionCompletion,applyAttendance,applyCategoryChange,yenAmount,totals,validIsoDate,createReimbursement,buildLedger,balanceOnDate};
if(typeof module!=='undefined'&&module.exports)module.exports=api;root.SmashModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
