#!/usr/bin/env node
'use strict';
/* v0.16.69: Exercise the real GAS mutation on backdated reimbursement and
 * actual live.js schedule weekday logic. No network, Sheets, or Drive writes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=x=>fs.readFileSync(path.join(root,x),'utf8');
const gas=read('gas-staging/コード.gs'),live=read('live.js'),
 html=read('live.html'),css=read('stage-ui.css'),ux=read('stage-ui.js'),
 worker=read('cloudflare-worker/worker.js');
let n=0;const ok=(condition,message)=>{assert.ok(condition,message);n++};
new Function(gas);new Function(live);n+=2;

const start=gas.indexOf('function mutateLedger_('),end=gas.indexOf('\n/**\n * Cash audit',start);
ok(start>=0&&end>start,'actual GAS ledger mutation handler available');
let writes=0,calculations=0;
let stored=[
 {rowId:'OPEN',kind:'opening',date:'2026-11-01',status:'confirmed',balance:10000},
 {rowId:'P-19',kind:'practice',date:'2026-11-19',status:'confirmed',
  income:1000,expense:0,balance:11000,version:3},
];
const fail_=(code,message)=>{throw Object.assign(new Error(message),{smCode:code})};
const entries_=()=>stored.map(r=>({...r}));
const str_=v=>String(v??'').trim();
const mutation=new Function('entries_','str_','dateAllowed_','jpy_','fail_','balanceRecalc_','writeLedger_',
 gas.slice(start,end)+'\nreturn mutateLedger_;')(
 entries_,str_,date=>{if(date>'2026-11-20')fail_('BAD_REQUEST','future')},
 v=>{const x=Number(v);if(!Number.isSafeInteger(x)||x<0)fail_('BAD_REQUEST','invalid money');return x},
 fail_,rows=>{calculations++;return rows},(_ss,rows)=>{writes++;stored=rows.map(r=>({...r}))});
let thrown=null;
try{mutation({}, {memberId:'DUTY',role:'duty'},{
 action:'add',kind:'reimbursement',rowId:'R-TEST-00000001',
 date:'2026-11-18',item:'シャトル',payee:'全力太郎',amount:5200
})}catch(e){thrown=e}
ok(thrown?.smCode==='LOCKED'&&
 thrown.message==='指定した精算日より後の日付に確定済みの収支が存在するため、登録できません。',
 '18th reimbursement is refused for the confirmed row on the 19th with a concrete reason');
ok(writes===0&&calculations===0&&stored.length===2,
 'rejected backdated reimbursement is rejected BEFORE balance calculations and has no ledger side effects');
const allowed=mutation({}, {memberId:'DUTY',role:'duty'},{
 action:'add',kind:'reimbursement',rowId:'R-TEST-00000002',
 date:'2026-11-20',item:'シャトル',payee:'全力太郎',amount:5200
});
ok(allowed.ok&&writes===1&&stored.length===3,
 'subsequent-date reimbursement is still allowed by the new narrow preflight');
ok(worker.includes("'CONFLICT','VERSION_CONFLICT'")&&
 !ux.includes("if(e?.code==='LOCKED')return {title:'内容が変わりました'")&&
 ux.includes("if(e?.status===409)return"),
 'unrelated optimistic-concurrency 409 error presentation remains untouched');
ok(!worker.includes("authorizeStagingReceiptDriveV1669"),
 'Drive authorization helper is never exposed as a Worker route');
ok(gas.includes('function authorizeStagingReceiptDriveV1669(){')&&
 gas.includes('return stageReceiptAuthorizeV1666_();')&&
 gas.includes("if(sheetId!=='1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac')"),
 'manual Drive preflight is public in Apps Script but still staging-ID guarded');
const match=html.match(/<span class="payout-date-field"><input id="scheduleDate" class="dialog-input" type="date" lang="ja" required><small id="scheduleWeekday" class="weekday-hint" aria-live="polite"><\/small><\/span>/);
ok(!!match,'practice schedule creation/edit shares the compact in-field weekday control');
ok(css.includes('.stage-ui #scheduleEditDialog #scheduleWeekday{')&&
 css.includes('position:absolute;top:50%;left:calc(10.5ch + 9px);right:auto;')&&
 css.includes('.stage-ui #scheduleEditDialog #scheduleDate:disabled + #scheduleWeekday{'),
 'schedule field weekday uses payout position and honors disabled visuals');
ok(css.includes('.stage-ui #reimbursementReceipt::file-selector-button,')&&
 css.includes('.stage-ui #ledgerReimbursementReceipt::file-selector-button{')&&
 css.includes('padding-block:4px!important;'),
 'only visible receipt chooser buttons gain modest vertical padding');
const w={};vm.runInNewContext(read('date-format.js'),{window:w,Date,Intl});
const data={
 scheduleDate:{value:'2026-11-19'},
 scheduleWeekday:{textContent:'stale'},
 payoutDate:{value:'2026-11-20'},payoutWeekday:{textContent:''}
};
const $=id=>data[id];
const syncStart=live.indexOf('function syncPayoutWeekday_(');
const syncEnd=live.indexOf('function openEditor(',syncStart);
const scheduleStart=live.indexOf('function updateScheduleWeekday_(');
const scheduleEnd=live.indexOf('function openScheduleEditor_(',scheduleStart);
ok(syncStart>=0&&scheduleStart>=0,'real date display formatters found');
const fn=new Function('$','window','scheduleDateValid_',
 live.slice(syncStart,syncEnd)+live.slice(scheduleStart,scheduleEnd)+
 '\nreturn {syncPayoutWeekday_,updateScheduleWeekday_};')(
 $,w,day=>/^\d{4}-\d{2}-\d{2}$/.test(day));
fn.updateScheduleWeekday_();
ok(data.scheduleWeekday.textContent==='（木）',
 '2026/11/19 schedule creation shows only 木 immediately after date');
data.scheduleDate.value='2026-11-20';fn.updateScheduleWeekday_();
ok(data.scheduleWeekday.textContent==='（金）',
 'changing the schedule date immediately updates the right weekday');
data.scheduleDate.value='';fn.updateScheduleWeekday_();
ok(data.scheduleWeekday.textContent==='',
 'clearing the schedule date removes the stale weekday');
ok(html.includes('stage-ui.css?v=1667-near1668-sched1669')&&
 html.includes('live.js?v=1667-sched1669'),
 'LINE WebView picks up fresh weekday JS/CSS without changing other screens');
console.log('PASS '+n+'/'+n+' finance chronological error, Drive preflight, schedule weekday and picker padding');
