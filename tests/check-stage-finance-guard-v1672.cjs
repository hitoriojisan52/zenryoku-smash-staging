#!/usr/bin/env node
'use strict';
/* Real GAS accounting handlers, last-confirmed same-day undo, practice deletion
 * boundary, explicit zero-amount UI validation and schedule publish rejection. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');
const gas=read('gas-staging/コード.gs'),ui=read('live.js'),html=read('live.html');
let n=0;
const ok=(v,msg)=>{assert.ok(v,msg);n++};
const reject=(fn,code,fragment)=>{
 assert.throws(fn,e=>e?.smCode===code&&(!fragment||e.message.includes(fragment)));n++;
};
new Function(gas);new Function(ui);n+=2;
const fail_=(code,message)=>{throw Object.assign(Error(message),{smCode:code})};
const today_=()=> '2026-11-19',str_=v=>String(v??'').trim();
const helper=gas.slice(gas.indexOf('function ledgerChronologyCompare_('),gas.indexOf('function balanceRecalc_('));
const helpers=new Function('today_','fail_',helper+
 '\nreturn {ledgerChronologyCompare_,ledgerPriorPending_,ledgerLaterConfirmed_,ledgerCanUnlock_};')(today_,fail_);
const compare=helpers.ledgerChronologyCompare_;
const base=[
 {rowId:'OPENING',date:'2026-11-01',kind:'opening',status:'confirmed',version:1},
 {rowId:'P-18',date:'2026-11-18',kind:'practice',status:'confirmed',version:1},
 {rowId:'R-19',date:'2026-11-19',kind:'reimbursement',status:'confirmed',version:1},
 {rowId:'O-19',date:'2026-11-19',kind:'other',status:'confirmed',version:1},
 {rowId:'O-OPEN',date:'2026-11-19',kind:'other',status:'open',version:1}
].map(r=>({...r,income:0,expense:0,balance:1000,label:r.rowId,confirmedBy:'担当',adjustment:0}));
let stored=base.map(r=>({...r})),writes=0;
const entries_=()=>stored.map(r=>({...r}));
const row_=(rows,id)=>{const v=rows.find(x=>x.rowId===id);if(!v)fail_('NOT_FOUND','not found');return v};
const expectVersion_=(a,b)=>{if(a!==b)fail_('CONFLICT','stale')};
const unlockable_=r=>{if(r.status==='confirmed')fail_('LOCKED','finalized')};
const dateAllowed_=d=>{if(d>today_())fail_('BAD_REQUEST','future')};
const jpy_=v=>{const x=Number(v);if(!Number.isSafeInteger(x)||x<0)fail_('BAD_REQUEST','money');return x};
const mutateSource=gas.slice(gas.indexOf('function mutateLedger_('),gas.indexOf('\n/**\n * Cash audit'));
const mutate=new Function('entries_','row_','expectVersion_','unlockable_','dateAllowed_',
 'ledgerPriorPending_','ledgerLaterConfirmed_','balanceRecalc_','writeLedger_',
 'str_','fail_','norm_','jpy_',mutateSource+'\nreturn mutateLedger_;')(
 entries_,row_,expectVersion_,unlockable_,dateAllowed_,helpers.ledgerPriorPending_,
 helpers.ledgerLaterConfirmed_,list=>list.sort(compare),(_ss,rows)=>{writes++;stored=rows.map(r=>({...r}))},
 str_,fail_,str_,jpy_);
const act=(action,id,extras={})=>mutate({}, {role:'admin',name:'管理者'},{
 action,rowId:id,expectedVersion:stored.find(x=>x.rowId===id)?.version??1,...extras});
ok(!helpers.ledgerCanUnlock_(stored,stored.find(x=>x.rowId==='P-18')),
 'prior date is not unlockable if a later date has confirmed rows');
ok(!helpers.ledgerCanUnlock_(stored,stored.find(x=>x.rowId==='R-19'))&&
 helpers.ledgerCanUnlock_(stored,stored.find(x=>x.rowId==='O-19')),
 'same-day final confirmed row alone becomes unlockable');
reject(()=>act('unlock','R-19'),'LOCKED','後に確定された収支');
ok(writes===0,'rejected undo cannot write anything');
const unlocked=act('unlock','O-19');
ok(unlocked.ok&&stored.find(x=>x.rowId==='O-19').status==='open'&&writes===1,
 'admin may undo most recent confirmed row and its version increases');
ok(helpers.ledgerCanUnlock_(stored,stored.find(x=>x.rowId==='R-19')),
 'after last-row undo the preceding same-day confirmed row becomes eligible');
reject(()=>act('delete','P-18'),'LOCKED'); // must unlock before deletion
act('unlock','R-19');act('unlock','P-18');
reject(()=>act('delete','P-18'),'FORBIDDEN','練習日程マスタ');
const countBefore=writes;
reject(()=>mutate({}, {role:'admin',name:'管理者'},{
 action:'add',kind:'practice',practiceId:'P-18'}),'BAD_REQUEST','登録区分');
ok(writes===countBefore,'practice-row delete and re-entry attempts never write ledger');
reject(()=>mutate({}, {role:'admin',name:'管理者'},{
 action:'add',kind:'other',rowId:'O-VALID-00000001',date:'2026-11-19',
 label:'シャトル',income:0,expense:0}),'BAD_REQUEST','1円以上');
ok(writes===countBefore,'zero/zero rejected server-side without ledger write');
const other=mutate({}, {role:'admin',name:'管理者'},{
 action:'add',kind:'other',rowId:'O-VALID-00000002',date:'2026-11-19',
 label:'シャトル',income:300,expense:0});
ok(other.ok&&writes===countBefore+1,'positive income without expense remains valid');
const monthSource=gas.slice(gas.indexOf('function monthLedger_('),gas.indexOf('\n\n/**',gas.indexOf('function monthLedger_(')));
const month=new Function('entries_','today_','str_','fail_','ledgerChronologyCompare_','deletedPracticeLedgerIds_',
 monthSource+'\nreturn monthLedger_;')(entries_,today_,str_,fail_,compare,()=>[]);
let table=month({}, {role:'admin'}, {month:'2026-11'}).data.rows;
ok(table.some(r=>r.rowId==='P-18'&&r.canUnlock===false)&&
 table.some(r=>r.rowId==='O-VALID-00000002'&&r.canUnlock===false),
 'month response includes global canUnlock flags using actual chronology');
ok(ui.includes('button.disabled=future||r.canUnlock!==true')&&
 ui.includes("const canDelete=!future&&r.kind!=='practice'"),
 'frontend independently disables forbidden undo/delete operations');

const start=gas.indexOf('function scheduleChange_('),
 end=gas.indexOf('\n\n/**',start);
ok(start>=0&&end>start,'schedule mutation isolatable');
let scheduleWrites=0,ledgerWrites=0;
const schedule=new Function('str_','scheduleRows_','sheet_','scheduleArchiveHas_','expectVersion_',
 'entries_','fail_','today_','balanceRecalc_','writeLedger_',gas.slice(start,end)+'\nreturn scheduleChange_;')(
 str_,()=>[{practiceId:'PR-CHECK',date:'2026-11-25',version:2,enabled:false,rowNumber:2,
  place:'検証体育館',startTime:'09:00',endTime:'13:00',hours:4,remark:''}],
 ()=>({getRange:()=>({setValues(){scheduleWrites++}})}),()=>false,expectVersion_,
 ()=>[{rowId:'O-LATER',date:'2026-11-28',kind:'other',status:'confirmed',balance:2000}],
 fail_,today_,list=>list,()=>{ledgerWrites++});
reject(()=>schedule({}, {role:'admin',memberId:'ADMIN'},{
 action:'confirm',practiceId:'PR-CHECK',expectedVersion:2}), 'LOCKED','開催日より後');
ok(scheduleWrites===0&&ledgerWrites===0,'future-confirmed schedule guard rejects BEFORE any writes');

const fStart=ui.indexOf('function updateLedgerAmountValidity_('),
 fEnd=ui.indexOf('function updateEditorKind(',fStart);
ok(fStart>=0&&fEnd>fStart,'validation function is available');
const nodes={ledgerKind:{value:'other'},ledgerEditIncome:{value:'0'},
 ledgerEditExpense:{value:'0',setCustomValidity(s){this.message=s}}};
const fn=new Function('$',ui.slice(fStart,fEnd)+'\nreturn updateLedgerAmountValidity_;')(
 id=>nodes[id]);
ok(!fn()&&nodes.ledgerEditExpense.message.includes('1円以上'),
 'client 0/0 validation is reported before spinner');
nodes.ledgerEditIncome.value='250';
ok(fn()&&nodes.ledgerEditExpense.message==='',
 'client positive amount clears validation error');
ok(html.includes('id="ledgerEditDate" type="date" class="dialog-input" required')&&
 html.includes('id="ledgerEditLabel" type="text" maxlength="100" class="dialog-input" placeholder="例：団体戦費用捻出" required')&&
 !html.includes('value="practice">練習日（削除行を再登録）')&&
 !html.includes('id="homeHistoryToggle"'),
 'date/label required; obsolete practice category and collection history removed');
ok(ui.includes("if(!$('ledgerEditForm').reportValidity())return;")&&
 ui.indexOf("if(!$('ledgerEditForm').reportValidity())return;")<ui.indexOf('await guard(async()=>{',ui.indexOf('async function submitEditor(')),
 'nonzero validation interrupts submission before spinner is shown');
console.log('PASS '+n+'/'+n+' legacy ledger order, same-day final undo, deletion, schedule and early input validation');
