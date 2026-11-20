#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=root('live.js'),html=root('live.html'),visitor=root('visitor-approval.js'),access=root('live-access-v2.js');
let n=0;const ok=(cond,label)=>{assert.ok(cond,label);n++};
new Function(js);new Function(visitor);new Function(access);n+=3;
const section=(start,end)=>{const a=js.indexOf(start),b=js.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return js.slice(a,b)};
for(const [name,next,dialog,load] of [
 ['openLedger','loadLedger','ledgerDialog','loadLedger()'],
 ['openCash','resetCashCounts','cashDialog','refreshCashSnapshot_()'],
 ['openScheduleMaster_','updateScheduleWeekday_','scheduleDialog','loadScheduleMaster_()'],
 ['openParticipantManager_','switchParticipantDate_','participantDialog','loadParticipants_()'],
 ['openVisitorForm_','visitorFormDraft_','visitorDialog',"call('/api/visitor/practices')"]
]){
 const s=section('async function '+name+'(',name==='openCash'?'function '+next+'(':
  name==='openLedger'?'async function '+next+'(':
  name==='openScheduleMaster_'?'function '+next+'(':
  name==='openParticipantManager_'?'async function '+next+'(':'function '+next+'(');
 ok(s.indexOf("dialog('"+dialog+"')")<s.indexOf('await softRead_'),
  name+' displays the dialog before awaiting remote data');
 ok(s.includes(load),name+' retains original authenticated read');
 ok(!s.includes('await guard('),name+' does not invoke global modal spinner');
}
const helper=section('async function softRead_(', 'function gateEdit(');
ok(helper.includes('await work()')&&helper.includes("if(!$(dialogId)?.open"),
 'late responses do not present errors on closed dialogs');
ok(helper.includes('window.SMStageUX.showError(e)'),
 'failed read uses persistent error dialog only when still open');
const amount=section('async function saveAmount(', 'async function openLedger(');
ok(!amount.includes('await guard('),'amount changes use no full-screen spinner');
ok(amount.includes('expectedVersion:ledger.version')&&amount.includes('operationId:uuid()'),
 'amount save retains server ledger-version and idempotency safeguards');
ok(amount.includes("S.pending.add('amount')")&&amount.includes("syncPaymentControls()"),
 'amount writes protect concurrent ledger-version conflicts');
ok(amount.includes('S.paymentNeedsRefresh=true')&&amount.includes('showError(e)'),
 'uncertain amount writes block further writes and require reconciliation');
ok(js.includes("S.pending.has('amount')||S.pending.has(id)"),
 'checkboxes cannot race an amount write with a stale ledger version');
ok(html.includes('id="ledgerEditWeekday"')&&
 js.includes("syncPayoutWeekday_('ledgerEditDate','ledgerEditWeekday')")&&
 js.includes("addEventListener('change',()=>syncPayoutWeekday_('ledgerEditDate'"),
 'other-ledger date weekday appears and updates on date selection');
ok(html.includes('placeholder="例：団体戦費用捻出"'),
 'other-ledger label uses requested expense example');
ok(!html.includes('id="visitorMineHistoryToggle"')&&
 !visitor.includes("$('visitorMineHistoryToggle')"),
 'visitor request history button and handler removed');
ok(visitor.indexOf("$('visitorAdminDialog').showModal()")<
 visitor.indexOf('try{await loadAdmin();}'),
 'visitor admin dialog opens before remote list load');
ok(access.includes("$('memberAccessPending').textContent='登録申請を読み込んでいます…'")&&
 access.includes("if(first){")&&access.includes("try{await load();"),
 'member-access initial read shows inline loading and keeps Close available');
ok(html.includes('live.js?v=1676-responsive')&&html.includes('visitor-approval.js?v=1676-responsive'),
 'both changed modules have refreshed WebView cache keys');
console.log('PASS '+n+'/'+n+' responsive screen openings, inline finance save and visitor/date controls');
