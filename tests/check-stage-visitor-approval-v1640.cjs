#!/usr/bin/env node
'use strict';
// Real v0.16.40 GAS visitor-request functions + participant deletion under a
// synthetic spreadsheet. No connected user data is written by these tests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const gas=read('gas-staging/コード.gs'),worker=read('cloudflare-worker/worker.js'),
 live=read('live.js'),html=read('live.html'),ui=read('visitor-approval.js');
let n=0;const ok=(v,m)=>{assert.ok(v,m);n++;},expect=(fn,code)=>{assert.throws(fn,e=>e.smCode===code,code);n++};
new Function(gas);new Function(ui);new Function(live);n+=3;
function source(a,b){const i=gas.indexOf(a),j=gas.indexOf(b,i+1);ok(i>=0&&j>i,'GAS source '+a);return gas.slice(i,j)}
const part=source('function participantChange_(','/* v0.16.38b: member-authenticated visitor proxy registration.'),
 visitor=source('function visitorRequests_(','function visitorRegister_(');
const rows={
 'ビジター申請':[],'ビジター審査アーカイブ':[],
 '出欠回答':[],'集金記録':[],'参加者操作アーカイブ':[],
 '練習日程':[],'メンバー':[['M-ADMIN','管理者','','TRUE',true],['M-ONE','依頼者','','TRUE',false],['M-OTHER','別会員','','TRUE',false]],
 '操作履歴':[],'全体収支管理表':[]
};
let events=[],matchLocked=false,ledgerStatus='open',ledgerIncome=0,ledgerWrites=0;
const str_=v=>String(v??'').trim(),norm_=str_,bool_=v=>v===true||v==='TRUE'||v===1||v==='1';
const safeCell_=s=>String(s||'').replace(/^[=+@]/,"'$&"),now_=()=> '2026/11/18 12:00';
const fail_=(code,msg)=>{const e=new Error(msg);e.smCode=code;throw e;},checkOpId_=p=>{if(!p.operationId)fail_('BAD_REQUEST','operationId');return p.operationId};
const sheet_=(_ss,name)=>{
 if(!rows[name])throw Error('MISSING SHEET '+name);
 const data=rows[name];
 return{
  getLastRow:()=>data.length+1,
  appendRow:value=>{data.push([...value]);events.push('append:'+name)},
  deleteRow:row=>{data.splice(row-2,1);events.push('delete:'+name)},
  getRange:(r,c,h=1,w=1)=>({
   getValues:()=>data.slice(r-2,r-2+h).map(a=>a.slice(c-1,c-1+w)),
   setValues:values=>{values.forEach((v,i)=>{const row=data[r+i-2];v.forEach((val,j)=>row[c-1+j]=val)});events.push('set:'+name)},
   setValue:value=>{data[r-2][c-1]=value;events.push('set:'+name)}
  })
 };
};
const sheetRows_=(ss,name)=>rows[name].map(r=>r.slice());
const practices_=()=>[{practiceId:'PR-STAGING-1121',date:'2026-11-21',place:'体育館',hours:4,enabled:true,startTime:'09:00'}];
const practice_=(ss,id)=>{const p=practices_().find(x=>x.practiceId===id);if(!p)fail_('NOT_FOUND','practice');return p};
const entries_=()=>ledgerStatus?[{rowId:'P-PR-STAGING-1121',kind:'practice',practiceId:'PR-STAGING-1121',status:ledgerStatus,income:ledgerIncome,
 balance:ledgerIncome,version:1,date:'2026-11-21',expense:0}]:[];
const paymentRows_=()=>rows['集金記録'].map(r=>r.slice());
const balanceRecalc_=(next,old)=>{if(ledgerStatus==='confirmed')fail_('LOCKED','confirmed balance');next.forEach(r=>r.balance=r.income-r.expense)};
const writeLedger_=(ss,next)=>{ledgerIncome=next[0].income;ledgerWrites++;events.push('write:ledger')};
const expectVersion_=(actual,expected)=>{if(Number(actual)!==Number(expected))fail_('VERSION_CONFLICT','version')};
const participantMatchLocked_=()=>matchLocked,participantArchivePending_=()=>false,fee_=()=>1000;
const SpreadsheetApp={flush:()=>events.push('flush')};
const audit_=()=>{events.push('audit')};
const env=['sheet_','sheetRows_','str_','norm_','bool_','safeCell_','now_','today_','fail_','checkOpId_',
 'practice_','practices_','entries_','paymentRows_','balanceRecalc_','writeLedger_',
 'expectVersion_','participantMatchLocked_','participantArchivePending_','fee_','SpreadsheetApp','audit_','SM'];
const values=[sheet_,sheetRows_,str_,norm_,bool_,safeCell_,now_,()=> '2026-11-18',fail_,checkOpId_,
 practice_,practices_,entries_,paymentRows_,balanceRecalc_,writeLedger_,
 expectVersion_,participantMatchLocked_,participantArchivePending_,fee_,SpreadsheetApp,audit_,{fees:{visitor:1000,member:800}}];
const actual=new Function(...env,part+'\n'+visitor+
 '\nreturn {visitorRequests_,visitorMine_,visitorAdminList_,visitorRequest_,visitorDecision_,participantChange_,visitorModify_,visitorHasApproved_}')(...values);
const A={memberId:'M-ADMIN',role:'admin'},M={memberId:'M-ONE',role:'member'},OTHER={memberId:'M-OTHER',role:'member'};
const base={requestId:'VR-ONE-12345678',participantId:'PV-ONE-12345678',
 practiceId:'PR-STAGING-1121',name:'テスト花子',nameKana:'',memo:'参加希望'};
const request=actual.visitorRequest_({},M,base);
ok(request.data.status==='pending'&&request.data.version===0,'member request is pending');
ok(rows['出欠回答'].length===0,'pending applicant never appears in attendance');
ok(actual.visitorMine_({},M).data.requests.length===1,'requester sees own request');
ok(actual.visitorMine_({},OTHER).data.requests.length===0,'other member cannot see another request');
expect(()=>actual.visitorAdminList_({},M),'FORBIDDEN');
ok(actual.visitorAdminList_({},A).data.requests.length===1,'admin sees applications and requester');
const replay=actual.visitorRequest_({},M,base);
ok(replay.data.requestId===base.requestId&&rows['ビジター申請'].length===1,'same request ID is idempotent');
expect(()=>actual.visitorRequest_({},OTHER,base),'CONFLICT');
expect(()=>actual.visitorDecision_({},M,{requestId:base.requestId,action:'approve',expectedVersion:0,operationId:'OP-APPROVE-001'}),'FORBIDDEN');
expect(()=>actual.visitorDecision_({},A,{requestId:base.requestId,action:'approve',expectedVersion:7,operationId:'OP-APPROVE-001'}),'VERSION_CONFLICT');
matchLocked=true;
expect(()=>actual.visitorDecision_({},A,{requestId:base.requestId,action:'approve',expectedVersion:0,operationId:'OP-APPROVE-001'}),'LOCKED');
matchLocked=false;
const approve=actual.visitorDecision_({},A,{requestId:base.requestId,action:'approve',expectedVersion:0,operationId:'OP-APPROVE-001'});
ok(approve.data.status==='approved'&&rows['出欠回答'].length===1,'approved creates one and only one visitor');
ok(actual.visitorRequests_({})[0].status==='approved','application is approved');
ok(actual.visitorHasApproved_({},base.practiceId,base.participantId),'approved participant linked to request');
const duplicate=actual.visitorDecision_({},A,{requestId:base.requestId,action:'approve',expectedVersion:0,operationId:'OP-APPROVE-001'});
ok(duplicate.data.status==='approved'&&rows['出欠回答'].length===1,'same operationId replay does not duplicate attendee');
expect(()=>actual.visitorDecision_({},A,{requestId:base.requestId,action:'approve',expectedVersion:1,operationId:'OP-APPROVE-002'}),'LOCKED');
expect(()=>actual.participantChange_({}, {memberId:'M-DUTY',role:'duty'},{practiceId:base.practiceId,participantId:base.participantId,action:'delete',expectedVersion:0,operationId:'OP-DELETE-001'}),'FORBIDDEN');
ok(rows['出欠回答'].length===1,'non-admin direct delete blocked to prevent status mismatch');
expect(()=>actual.participantChange_({},A,{practiceId:base.practiceId,participantId:base.participantId,
 action:'edit',expectedVersion:0,name:'テスト花子',nameKana:'',category:'member',attending:true,memo:''}),'LOCKED');
ok(rows['出欠回答'][0][4]==='visitor','approval-linked visitor cannot become member via edit');
ok(gas.includes("if(cat!=='visitor'&&/^PV-/.test(person)&&visitorHasApproved_(ss,id,person))"),
 'payment category change also guards approval-linked visitor type');
rows['集金記録'].push([base.practiceId,base.participantId,true,1,'M-ADMIN',now_()]);
ledgerIncome=1000;ledgerStatus='confirmed';
expect(()=>actual.visitorDecision_({},A,{requestId:base.requestId,action:'reject',expectedVersion:1,operationId:'OP-REJECT-001'}),'LOCKED');
ok(rows['集金記録'].length===1&&ledgerIncome===1000,'finalized payment and roster preserved');
ledgerStatus='open';matchLocked=true;
expect(()=>actual.visitorDecision_({},A,{requestId:base.requestId,action:'reject',expectedVersion:1,operationId:'OP-REJECT-001'}),'LOCKED');
matchLocked=false;
const rej=actual.visitorDecision_({},A,{requestId:base.requestId,action:'reject',expectedVersion:1,operationId:'OP-REJECT-001'});
ok(rej.data.status==='rejected'&&rej.data.version===2,'approved visitor can become finally rejected');
ok(rows['出欠回答'].length===0&&rows['集金記録'].length===0,'reject removes attendance and marked payment');
ok(ledgerIncome===0&&ledgerWrites===1,'paid rejection recalculates open ledger without refund functionality');
ok(events.includes('flush')&&rows['ビジター審査アーカイブ'].every(r=>r[7]==='completed'),
 'pre-write archive exists and is finalized');
expect(()=>actual.visitorDecision_({},A,{requestId:base.requestId,action:'approve',expectedVersion:2,operationId:'OP-APPROVE-003'}),'LOCKED');
expect(()=>actual.visitorDecision_({},A,{requestId:base.requestId,action:'reject',expectedVersion:2,operationId:'OP-REJECT-002'}),'LOCKED');
const rejectedReplay=actual.visitorDecision_({},A,{requestId:base.requestId,action:'reject',expectedVersion:1,operationId:'OP-REJECT-001'});
ok(rejectedReplay.data.status==='rejected'&&rows['出欠回答'].length===0,'completed operation can replay safely');
const base2={...base,requestId:'VR-TWO-12345678',participantId:'PV-TWO-12345678'};
actual.visitorRequest_({},M,base2);
ledgerStatus='confirmed';
expect(()=>actual.visitorDecision_({},A,{requestId:base2.requestId,action:'reject',expectedVersion:0,operationId:'OP-REJECT-003'}),'LOCKED');
ledgerStatus='open';
const rejPending=actual.visitorDecision_({},A,{requestId:base2.requestId,action:'reject',expectedVersion:0,operationId:'OP-REJECT-003'});
ok(rejPending.data.status==='rejected'&&rows['出欠回答'].length===0,'pending can reject without roster writes');
const base3={...base,requestId:'VR-THREE-12345678',participantId:'PV-THREE-12345678'};
actual.visitorRequest_({},M,base3);
actual.visitorDecision_({},A,{requestId:base3.requestId,action:'approve',expectedVersion:0,operationId:'OP-APPROVE-004'});
rows['集金記録'].push([base3.practiceId,base3.participantId,true,1,'M-ADMIN',now_()]);
ledgerIncome=1000;
const direct=actual.participantChange_({},A,{practiceId:base3.practiceId,participantId:base3.participantId,action:'delete',expectedVersion:0,operationId:'OP-DELETE-ADMIN'});
ok(direct.data.action==='delete'&&direct.data.visitorStatus==='rejected','admin attendance deletion delegates to visitor rejection');
ok(rows['出欠回答'].length===0&&rows['集金記録'].length===0&&ledgerIncome===0,
 'admin delete removes collected checked visitor and open ledger fee');
ok(actual.visitorRequests_({}).find(x=>x.requestId===base3.requestId).status==='rejected',
 'applicant sees rejected status after admin deletes from participant list');
// v0.16.42: a normal member can edit THEIR OWN approved visitor via
// participantChange_, including attendance and paid-cash ledger adjustments.
// No email exists in the visitor application or participant sheet.
const base4={...base,requestId:'VR-FOUR-12345678',participantId:'PV-FOUR-12345678'};
actual.visitorRequest_({},M,base4);
expect(()=>actual.visitorModify_({},M,{requestId:base4.requestId,action:'edit',
 expectedVersion:0,operationId:'OP-EDIT-PENDING-004',name:'修正前',attending:false}),'LOCKED');
expect(()=>actual.visitorModify_({},OTHER,{requestId:base4.requestId,action:'delete',
 expectedVersion:0,operationId:'OP-WITHDRAW-OTHER'}),'FORBIDDEN');
ledgerStatus='confirmed';
expect(()=>actual.visitorModify_({},M,{requestId:base4.requestId,action:'delete',
 expectedVersion:0,operationId:'OP-WITHDRAW-CONFIRMED'}),'LOCKED');
ledgerStatus='open';
actual.visitorDecision_({},A,{requestId:base4.requestId,action:'approve',
 expectedVersion:0,operationId:'OP-APPROVE-FOUR'});
ok(actual.visitorMine_({},M).data.requests.find(x=>x.requestId===base4.requestId).attending===true,
 'approved visitor shows actual participant-list attendance');
expect(()=>actual.visitorModify_({},OTHER,{requestId:base4.requestId,action:'edit',
 expectedVersion:1,operationId:'OP-EDIT-OTHER',name:'偽装',attending:false}),'FORBIDDEN');
expect(()=>actual.visitorModify_({},M,{requestId:base4.requestId,action:'delete',
 expectedVersion:1,operationId:'OP-DELETE-APPROVED'}),'LOCKED');
const change={requestId:base4.requestId,action:'edit',expectedVersion:1,
 operationId:'OP-EDIT-MEMBER-004',name:'変更済み花子',nameKana:'ヘンコウ',
 memo:'欠席のため連絡',category:'visitor',attending:false};
expect(()=>actual.visitorModify_({},M,{...change,category:'member'}),'LOCKED');
expect(()=>actual.visitorModify_({},M,{...change,attending:undefined}),'BAD_REQUEST');
ledgerStatus='confirmed';
expect(()=>actual.visitorModify_({},M,change),'LOCKED');
matchLocked=true;ledgerStatus='open';
expect(()=>actual.visitorModify_({},M,change),'LOCKED');
matchLocked=false;
rows['集金記録'].push([base4.practiceId,base4.participantId,true,1,'M-ADMIN',now_()]);
ledgerIncome=1000;
const edit=actual.visitorModify_({},M,change);
ok(edit.data.version===2&&edit.data.status==='approved',
 'requesting general member edits only approved visitor; approval unchanged');
ok(rows['出欠回答'].length===1&&rows['出欠回答'][0][5]===false,
 'same participant edit logic updates attendance to absent');
ok(rows['集金記録'].length===0&&ledgerIncome===0,
 'attendance change from paid to absent removes paid mark and reconciles open ledger');
ok(rows['出欠回答'][0][2]==='変更済み花子'&&
 rows['ビジター申請'].find(x=>x[0]===base4.requestId)[3]==='変更済み花子',
 'approval request and participant roster share updated name');
ok(actual.visitorMine_({},M).data.requests.find(x=>x.requestId===base4.requestId).attending===false,
 'my request UI shows updated absent status instead of always attended');
ok(rows['参加者操作アーカイブ'].some(r=>r[0]===change.operationId&&r[7]==='completed')&&
 rows['ビジター審査アーカイブ'].some(r=>r[0]===change.operationId&&r[7]==='completed'),
 'both visitor and participant changes are durably archived before finalizing');
const saved=ledgerWrites,again=actual.visitorModify_({},M,change);
ok(again.data.status==='approved'&&ledgerWrites===saved,
 'completed member edit operation safely replays without duplicate ledger changes');
expect(()=>actual.visitorModify_({},M,{...change,operationId:'OP-STALE-EDIT-005'}),'VERSION_CONFLICT');
const changedByDuty=actual.participantChange_({},A,{
 practiceId:base4.practiceId,participantId:base4.participantId,action:'edit',
 expectedVersion:1,operationId:'OP-ADMIN-EDIT-004',
 name:'管理者修正済み',nameKana:'',category:'visitor',attending:true,memo:'再参加'
});
ok(changedByDuty.data.version===2&&rows['出欠回答'][0][5]===true,
 'admin participant-list edit reuses same attendance mutation for approved visitor');
const afterAdmin=actual.visitorMine_({},M).data.requests.find(x=>x.requestId===base4.requestId);
ok(afterAdmin.name==='管理者修正済み'&&afterAdmin.attending===true&&afterAdmin.version===3,
 'requester sees admin participant-list corrections in visitor request details');
ok(rows['参加者操作アーカイブ'].some(r=>r[0]==='OP-ADMIN-EDIT-004'&&r[7]==='completed')&&
 rows['ビジター申請'].find(r=>r[0]===base4.requestId)[12]==='OP-ADMIN-EDIT-004',
 'admin mutation archives original roster and synchronizes request revision');
expect(()=>actual.visitorModify_({},M,{...change,operationId:'OP-STALE-AFTER-ADMIN',
 expectedVersion:2}),'VERSION_CONFLICT');
ok(actual.visitorMine_({},M).data.practices.some(p=>p.practiceId===base4.practiceId)&&
 actual.visitorAdminList_({},A).data.practices.some(p=>p.practiceId===base4.practiceId),
 'both applicant and admin APIs expose all practice dates for dropdowns');

const base5={...base,requestId:'VR-FIVE-12345678',participantId:'PV-FIVE-12345678'};
actual.visitorRequest_({},M,base5);
const withdrawn=actual.visitorModify_({},M,{requestId:base5.requestId,action:'delete',
 expectedVersion:0,operationId:'OP-WITHDRAW-005'});
ok(withdrawn.data.status==='withdrawn'&&
 actual.visitorMine_({},M).data.requests.every(x=>x.requestId!==base5.requestId)&&
 actual.visitorAdminList_({},A).data.requests.every(x=>x.requestId!==base5.requestId),
 'pending application removed from lists while archive is retained for recovery');
expect(()=>actual.visitorDecision_({},A,{requestId:base5.requestId,action:'approve',
 expectedVersion:1,operationId:'OP-APPROVE-WITHDRAWN'}),'LOCKED');
ok(worker.includes("'/api/visitor/modify':'visitor.modify'"),
 'Worker exposes authenticated member modification through server authorization');

ok(gas.includes("['閲覧リンク',1,6],['ビジター申請',1,13]"),'schedule cascade includes visitor applications');
ok(worker.includes("'/api/visitor/decide':'visitor.decide'")&&worker.includes("'/api/visitor/mine':'visitor.mine'"),
 'Worker maps member/admin visitor operations');
ok(gas.includes("if(op==='visitor.register'||op==='visitor.request')")&&
 !gas.includes("var result=visitorRegister_(ss,member,payload);"),
 'legacy direct-visitor endpoint cannot bypass approval by writing attendance');
ok(html.includes('id="visitorAdminDialog"')&&html.includes('id="visitorMineCards"')&&
 !html.includes('id="visitorMineDialog"')&&html.indexOf('id="visitorMineCards"')<html.indexOf('<form id="visitorForm"')&&
 html.includes('visitor-approval.js?v=1661'), 'member and administrator UI connected');
ok(ui.includes("data.status==='rejected'")&&ui.includes("data.status!=='pending'"),
 'rejected is terminal and approved cannot be approved a second time');
ok(ui.includes("id")&&live.includes("window.SMVisitor?.setup({api:call,actor:S.actor"),
 'registered LINE account supplies roles and identity to status UI');
console.log('PASS '+n+'/'+n+' visitor requests, paid rejection, finalization, match lock, role and idempotency');
