#!/usr/bin/env node
'use strict';
// v0.16.38b - in-memory GAS visitor proxy contract, no remote data or writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const gas=read('gas-staging/コード.gs'),worker=read('cloudflare-worker/worker.js'),
  ui=read('live.js'),html=read('live.html');
let n=0;function ok(v,msg){assert.ok(v,msg);n++}
function fails(fn,code){assert.throws(fn,e=>e?.smCode===code,code+' required');n++}
new Function(gas);new Function(ui);n+=2;
const begin=gas.indexOf('/* v0.16.38b: member-authenticated visitor proxy registration');
const end=gas.indexOf('function dispatch_(',begin);
ok(begin>=0&&end>begin,'visitor API module extraction boundaries');
const guestSource=gas.slice(begin,end);
const fail_=(code,message)=>{const error=new Error(message);error.smCode=code;throw error};
const str_=v=>String(v??'').trim(),norm_=v=>str_(v).normalize('NFKC').replace(/[\s\u3000]+/g,''),
 safeCell_=v=>/^[=+@]/.test(String(v))?"'"+v:String(v);
const today_=()=> '2026-11-18';
const available=[
 {practiceId:'P-TODAY',date:'2026-11-18',enabled:true,place:'今日の体育館',startTime:'09:00',endTime:'11:30',hours:3},
 {practiceId:'P-FUTURE',date:'2026-11-19',enabled:true,place:'明日の体育館',startTime:'19:00',endTime:'21:00',hours:2},
 {practiceId:'P-PAST',date:'2026-11-17',enabled:true,place:'昨日の体育館',startTime:'19:00',endTime:'21:00',hours:2}
];
let ledgers=[],records=[],writes=[];
const ss={};const practice_=(_ss,id)=>{
 const row=available.find(p=>p.practiceId===id);
 if(!row||!row.enabled)fail_('NOT_FOUND','開催日が見つかりません');
 return row;
};
const funcs=new Function('practices_','practice_','entries_','sheetRows_','sheet_','fail_',
  'str_','norm_','safeCell_','today_',guestSource+
  '\nreturn {visitorAvailablePractices_,visitorRegister_};')(
 ()=>available.filter(p=>p.enabled),practice_,()=>ledgers,
 (_ss,name)=>{ok(name==='出欠回答','only attendance read');return records.map(r=>[...r]);},
 (_ss,name)=>{ok(name==='出欠回答','visitor must NEVER write payment or ledger');return{
  appendRow(r){records.push([...r]);writes.push(name);}
 }},
 fail_,str_,norm_,safeCell_,today_
);
const member={memberId:'M-GENERAL',role:'member'};
const list=funcs.visitorAvailablePractices_(ss,member,{}).data.practices;
ok(list.map(p=>p.practiceId).join(',')==='P-TODAY,P-FUTURE','TODAY included and yesterday excluded for member');
const make=(id,override={})=>funcs.visitorRegister_(ss,member,{
 practiceId:'P-TODAY',participantId:id,name:'  全力　花子  ',nameKana:'ゼンリョク　ハナコ',
 memo:'メモ',registeredBy:'SPOOFED',...override
}).data;
const first=make('PV-VALID-000001');
ok(first.participantId==='PV-VALID-000001'&&first.category==='visitor'&&first.attending,
 'new visitor is attending with independent fixed ID');
ok(first.name==='全力花子'&&first.registeredBy==='M-GENERAL',
 'spaces normalized, original LINE-verified member ID overrides spoofed client');
ok(records[0][0]==='P-TODAY'&&records[0][1]==='PV-VALID-000001'&&
 records[0][2]==='全力花子'&&records[0][3]==='ゼンリョクハナコ'&&
 records[0][4]==='visitor'&&records[0][5]===true&&records[0][7]===0&&
 records[0][8]==='M-GENERAL','existing 9-column 出欠回答 mapping and registrar persisted');
ok(writes.length===1&&writes[0]==='出欠回答','only one attendance append, no finance mutations');
fails(()=>make('PV-VALID-000001'),'CONFLICT');
const other=funcs.visitorRegister_(ss,{memberId:'M-OTHER',role:'member'},{
 practiceId:'P-TODAY',participantId:'PV-VALID-000002',name:'全力花子',nameKana:'',memo:''
}).data;
ok(other.participantId!=='PV-VALID-000001'&&other.registeredBy==='M-OTHER',
 'same display name is NOT auto-merged; person IDs remain distinct');
fails(()=>make('INVALID ID'),'BAD_REQUEST');
fails(()=>make('PV-VALID-000003',{name:' '}),'BAD_REQUEST');
fails(()=>make('PV-VALID-000003',{name:'=SUM(A1:A2)'}),'BAD_REQUEST');
fails(()=>make('PV-VALID-000003',{name:'A'.repeat(61)}),'BAD_REQUEST');
fails(()=>make('PV-VALID-000003',{memo:'x'.repeat(201)}),'BAD_REQUEST');
fails(()=>make('PV-VALID-000003',{practiceId:'P-PAST'}),'BAD_REQUEST');
fails(()=>make('PV-VALID-000003',{practiceId:'P-INVALID'}),'NOT_FOUND');
ledgers=[{rowId:'P-P-TODAY',status:'confirmed'}];
fails(()=>make('PV-VALID-000003'),'CONFLICT');
ledgers=[{rowId:'P-P-TODAY',status:'open'}];
const allowed=make('PV-VALID-000003',{name:'TEST',nameKana:'',memo:'=@me'});
ok(allowed.participantId==='PV-VALID-000003'&&records[2][6].startsWith("'"),
 'unconfirmed practice can register and user notes cannot execute spreadsheet formula');
ok(writes.length===3&&writes.every(w=>w==='出欠回答'),
 'no finance row, payment row, match state, member ID or ledger written');
// Auth, opId, Lock and audit are verified at the actual dispatch branch.
const dispatch=gas.slice(gas.indexOf('function dispatch_('),gas.indexOf('function doPost(',gas.indexOf('function dispatch_(')));
const pMember=dispatch.indexOf("member=member_(ss,body.lineUserId)");
const pGuest=dispatch.indexOf("if(op==='visitor.register'||op==='visitor.request')");
const pDuty=dispatch.indexOf('requireDuty_(member);');
ok(pMember>=0&&pGuest>pMember&&pGuest<pDuty,
 'visitor may register as general member only AFTER verified member identity and BEFORE duty gate');
ok(dispatch.includes("var visitorOpId=checkOpId_(payload)")&&
 dispatch.includes("auditExisting_(ss,visitorOpId,op,member)")&&
 dispatch.includes("audit_(ss,visitorOpId,op,member"),
 'visitor mutation keeps guarded operation ID, ScriptLock and audit trail');
ok(dispatch.includes("if(op==='visitor.practices')return withLock_"),
 'guest signup dates available to all authenticated club members');
ok(worker.includes("'/api/visitor/practices':'visitor.practices'")&&
 worker.includes("'/api/visitor/register':'visitor.register'"),
 'Worker routes verified token to registered-member guest API');
ok(worker.includes("version:'0.16.65-stage-receipt'"),'stage Worker version updated');
for(const tag of ['visitorDialog','visitorForm','visitorPractice','visitorName','visitorKana','visitorMemo',
 'visitorMemberStart','visitorMemberHome','visitorConfirmDialog','visitorConfirmSave','visitorRegisterMenu']){
 ok(html.includes('id="'+tag+'"'),'visitor registration UI: '+tag);
}
ok(ui.includes("if(VISITOR_MODE){")&&
 ui.includes("document.body.classList.add('visitor-member')")&&
 ui.includes("if(S.actor.role==='member'){")&&
 ui.includes("if(control.id!=='stageRolePreviewOpen')control.disabled=true"),
 'LINE visitor mode stays usable while member management UI is otherwise locked');
ok(ui.includes("await call('/api/visitor/request'")&&ui.includes("const requestId='VR-'+uuid(),participantId='PV-'+uuid()"),
 'client generates immutable IDs and requests approval via authenticated API');
ok(ui.includes("VIS.unknownResult=true;$('visitorSubmit').disabled=true"),
 'ambiguous registration blocks repeat rather than duplicating attendance');
ok(html.includes('id="scheduleDate" class="dialog-input" type="date"'),
 'calendar picker remains native');
ok(html.includes('id="scheduleWeekday"')&&ui.includes('updateScheduleWeekday_()'),
 'native calendar day is explicitly reflected in Japanese weekday');
ok(html.includes('id="scheduleHours" class="dialog-select"')&&
 !ui.includes("時間帯と時間数が一致しません")&&
 !gas.includes("時間帯と時間数が一致しません"),
 'fee category 2/3/4 independent of elapsed hours in BOTH server and browser');
ok(!html.includes('scheduleFormSync')&&
 !html.includes('確定すると新システムの日程一覧に反映します')&&
 !html.includes('部内戦候補日 など'),
 'old Google Forms button, explanatory copy and remark example removed');
ok(html.includes('class="schedule-heading"')&&html.includes('id="scheduleAdd"')&&
 html.includes('#scheduleDialog #scheduleAdd{flex:none;width:auto'),
 'compact add button shares title row');
console.log('PASS '+n+'/'+n+' v0.16.38b visitor proxy, date/calendar, fee categories and finance safety');
