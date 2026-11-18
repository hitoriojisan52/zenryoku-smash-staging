#!/usr/bin/env node
'use strict';
/* v0.16.46: immutable inventory of all existing modal workflows. A Close
 * layout change must never delete or accidentally reuse another action.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const html=read('live.html'),match=read('match.html'),js=read('dialog-close.js'),
 ui=read('live.js'),access=read('live-access-v2.js'),vis=read('visitor-approval.js'),
 style=read('stage-ui.css');
let n=0;const ok=(v,s)=>{assert.ok(v,s);n++;};
const dialogMap={
 modal:['closeModal'],categoryDialog:['cancelCategory','saveCategory'],
 reimbursementDialog:['cancelReimbursement'],
 manageDialog:['cashCounter','openLedger','manageSchedules','managePeople','manageAttendance',
  'visitorRegisterMenu','visitorAdminMenu','matchManage','manageAccess','closeManage'],
 memberAccessDialog:['memberAccessRefresh','memberAccessClose',
  'memberAccessWithdrawPreviewButtonV1624','memberAccessWithdrawCheckButtonV1627'],
 cashDialog:['cashReset','cashSave','cashClose'],
 cashResetDialog:['cashResetCancel','cashResetConfirm'],
 cashSaveDialog:['cashSaveCancel','cashSaveConfirm'],
 visitorDialog:['visitorMineRefresh','visitorCancel','visitorSubmit'],
 visitorConfirmDialog:['visitorConfirmCancel','visitorConfirmSave'],
 visitorAdminDialog:['visitorAdminRefresh','visitorAdminClose'],
 visitorDecisionDialog:['visitorDecisionCancel','visitorDecisionConfirm'],
 visitorMineEditDialog:['visitorMineEditCancel','visitorMineEditSave'],
 visitorMineDeleteDialog:['visitorMineDeleteCancel','visitorMineDeleteSave'],
 attendanceDialog:['attendanceReload','attendanceCancel','attendanceSave'],
 participantDialog:['participantClose','participantReload'],
 participantEditDialog:['participantEditCancel','participantEditSave'],
 participantDeleteDialog:['participantDeleteCancel','participantDeleteConfirm'],
 scheduleDialog:['scheduleAdd','scheduleReload','scheduleClose'],
 scheduleEditDialog:['scheduleEditCancel','scheduleEditSubmit'],
 scheduleActionDialog:['scheduleActionCancel','scheduleActionSubmit'],
 ledgerDialog:['prevMonth','nextMonth','newLedgerRow','closeLedger'],
 ledgerEditDialog:['cancelLedgerEdit','submitLedgerEdit'],
 confirmActionDialog:['cancelConfirmAction','doConfirmAction'],
 accessConfirmV2:['accessConfirmCancelV2','accessConfirmOkayV2'],
 stageBusyDialog:[],
 stageErrorDialog:['stageErrorOkay']
};
const blocks=[...html.matchAll(/<dialog\s[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/dialog>/g)];
ok(blocks.length===27,'expected 27 operational modal surfaces (no modal removed)');
ok(Object.keys(dialogMap).length===27,'inventory intentionally covers every dialog');
for(const [id,body] of blocks){
 ok(Object.hasOwn(dialogMap,id),'new or removed dialog must be reviewed: '+id);
 const controls=[...body.matchAll(/<button\b[^>]*\bid="([^"]+)"/g)].map(x=>x[1]);
 const missing=dialogMap[id].filter(x=>!controls.includes(x));
 ok(!missing.length,'all original control IDs retained for '+id+': '+missing.join(','));
 ok(new Set(controls).size===controls.length,'no repeated control IDs in '+id);
 if(id!=='stageBusyDialog'){
  ok(Boolean(/<h2\b/.exec(body)),'modal retains its title: '+id);
  ok(controls.some(x=>/Close|Cancel|close|cancel|Okay/.test(x))||
     /キャンセル|閉じる|いいえ/.test(body),
     'modal still offers a legitimate close/cancel/acknowledge path: '+id);
 }
}
const allIds=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
ok(new Set(allIds).size===allIds.length,'entire management page has no duplicate IDs');
for(const id of ['scheduleAdd','scheduleReload','participantReload','memberAccessRefresh',
 'visitorAdminRefresh','attendanceReload','newLedgerRow']){
 ok(js.includes("'"+id+"'"),'shared toolbar has explicit original action: '+id);
 ok((ui+access+vis).includes("'"+id+"'"),
  'reparented action remains bound by application logic: '+id);
}
for(const id of ['scheduleAdd','participantClose','visitorMineRefresh','memberAccessRefresh',
 'visitorAdminRefresh','participantReload','attendanceReload','newLedgerRow']){
 ok(html.includes('id="'+id+'"'),'critical originally-visible control still exists: '+id);
}
ok(!js.includes("position:absolute")&&!style.includes('.stage-close-row'),
 'old overlapping Close row cannot be used');
ok(match.includes('id="accessQrButton"')&&match.includes('id="accessShareCopy"')===false&&
 match.includes('id="accessQrCopy"')&&match.includes('id="accessShareClose"'),
 'QR issue, copy and Close all retained');
ok(match.includes('id="matchConfirmCancel"')&&match.includes('id="matchConfirmOk"')&&
 match.includes('id="matchConfirmClose"'),
 'match confirmations retain both possible outcomes and the new Close');
ok(js.includes("cancel.click()")&&js.includes('if(dialog.inert||!dialog.open'),
 'new Close delegates to real Cancel and respects screen lock');
console.log('PASS '+n+'/'+n+' original staging modal action IDs and event route inventory');
