#!/usr/bin/env node
'use strict';
// In-memory legacy participant management regression. No sheet/network writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=x=>fs.readFileSync(path.join(root,x),'utf8');
const gas=read('gas-staging/コード.gs'),ui=read('live.js'),html=read('live.html'),
 worker=read('cloudflare-worker/worker.js');
let n=0;const ok=(yes,msg)=>{assert.ok(yes,msg);n++};
const fails=(fn,code)=>{assert.throws(fn,e=>e?.smCode===code,code+' expected');n++};
new Function(gas);new Function(ui);n+=2;
const start=gas.indexOf('/**\n * v0.16.38d: legacy-v7 participation editing');
const end=gas.indexOf('/* v0.16.38b: member-authenticated visitor proxy',start);
ok(start>=0&&end>start,'participant module present');
const source=gas.slice(start,end);
const fail_=(code,msg)=>{const err=new Error(msg);err.smCode=code;throw err};
const str_=v=>String(v??'').trim(),
 norm_=v=>str_(v).normalize('NFKC').replace(/[\s\u3000]+/g,''),
 safeCell_=v=>/^[=+@]/.test(String(v))?"'"+v:String(v);
const SM={fees:{member:800,visitor:1000,student:400,duty:400,shuttle:400}};
const bool_=v=>v===true||v==='TRUE'||v==='true';
const fee_=(cat,hours)=>Math.ceil(SM.fees[cat]*({2:6/8,3:7/8,4:1}[hours])/100)*100;
const expectVersion_=(v,x)=>{if(v!==Number(x))fail_('CONFLICT','wrong version')};
const today='2026-11-18';
let rows={
 '出欠回答':[
  ['P-TODAY','M-A','全力太郎','ゼンリョクタロウ','member',true,'既存の備考',0,'M-DUTY'],
  ['P-TODAY','V-A','全力花子','ゼンリョクハナコ','visitor',true,'',1,'M-DUTY'],
  ['P-OTHER','M-O','無関係','ムカンケイ','member',true,'',0,'M-DUTY']
 ],
 '集金記録':[
  ['P-TODAY','M-A',true,2,'M-DUTY','2026-11-18 11:30'],
  ['P-TODAY','V-A',false,1,'M-DUTY','2026-11-18 11:30'],
  ['P-OTHER','M-O',true,1,'M-DUTY','2026-11-18 11:30']
 ],
 '試合セッション':[],
 '参加者操作アーカイブ':[],
 '操作履歴':[
  ['OP-AT-1','attendance.submit','M-A','2026-11-18 20:10:00','P-TODAY|M-A','{}'],
  ['OP-AT-2','attendance.submit','M-A','2026-11-18 20:40:00','P-TODAY|M-A','{}']
 ],
 'メンバー':[
  ['M-A','全力太郎','U'+'a'.repeat(32),true,false],
  ['M-DUTY','当番','U'+'b'.repeat(32),true,false]
 ],
 '登録申請':[
  ['REQ-MA','U'+'a'.repeat(32),'申請時の太郎','approved',
   '2026-11-17T03:30:00.000Z','M-DUTY','2026-11-17T08:00:00.000Z','M-A']
 ],
 'ビジター申請':[
  ['VR-VA','P-TODAY','V-A','全力花子','ゼンリョクハナコ','',
   'M-DUTY','approved',1,'2026-11-16 10:00:00','2026-11-18 13:20:00','M-DUTY','OP-VA']
 ]
};
let ledger=[
 {date:'2026-11-15',rowId:'OPENING',kind:'opening',practiceId:'',status:'confirmed',
  income:0,expense:0,balance:0,version:1},
 {date:today,rowId:'P-P-TODAY',kind:'practice',practiceId:'P-TODAY',status:'open',
  income:700,expense:0,balance:700,version:1},
 {date:'2026-11-20',rowId:'P-P-OTHER',kind:'practice',practiceId:'P-OTHER',status:'open',
  income:300,expense:0,balance:1000,version:1}
];
const practices=[
 {practiceId:'P-TODAY',date:today,hours:3,enabled:true,place:'曽谷公民館',startTime:'09:00',endTime:'11:30'},
 {practiceId:'P-OTHER',date:'2026-11-20',hours:3,enabled:true,place:'北方小学校',startTime:'09:00',endTime:'13:00'}
];
let writes=[],flushed=0;
const sheet_=(_ss,name)=>{
 if(!rows[name])throw new Error('Missing '+name);
 return {getLastRow:()=>rows[name].length+1,
  appendRow:record=>{rows[name].push([...record]);writes.push(name+'.append')},
  deleteRow:i=>{rows[name].splice(i-2,1);writes.push(name+'.delete')},
  getRange:(i,j,h=1,w=1)=>({
   getValues:()=>rows[name].slice(i-2,i-2+h).map(r=>r.slice(j-1,j-1+w)),
   setValues:values=>{for(let a=0;a<values.length;a++){
    let r=rows[name][i-2+a]||[];
    for(let b=0;b<values[a].length;b++)r[j-1+b]=values[a][b];
    rows[name][i-2+a]=r;writes.push(name+'.set');
   }},
   setValue:value=>{rows[name][i-2][j-1]=value;writes.push(name+'.mark')}
  })
 };
};
const sheetRows_=(_ss,name)=>(rows[name]||[]).map(x=>[...x]);
const entries_=()=>ledger.map(x=>({...x}));
const originalBalance=gas.slice(gas.indexOf('function balanceRecalc_('),gas.indexOf('function writeLedger_(',gas.indexOf('function balanceRecalc_(')));
const iso_=date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&new Date(date+'T00:00:00Z').toISOString().startsWith(date);
const jpy_=(v,negative)=>{if(!Number.isSafeInteger(v)||(!negative&&v<0))fail_('BAD_REQUEST','money');return v};
const balanceRecalc_=new Function('fail_','iso_','jpy_',originalBalance+'\nreturn balanceRecalc_;')(fail_,iso_,jpy_);
const writeLedger_=(_ss,newRows)=>{ledger=newRows.map(x=>({...x}));writes.push('全体収支管理表.write')};
const SpreadsheetApp={flush(){flushed++;writes.push('flush')}};
const now_=()=> '2026-11-18 15:00:00';
const params=['str_','norm_','SM','fee_','fail_','expectVersion_','sheetRows_','sheet_',
 'entries_','practices_','practice_','paymentRows_','balanceRecalc_','writeLedger_',
 'safeCell_','SpreadsheetApp','now_','bool_','matchDeleteArchiveStatus_'];
const fn=new Function(...params,source+
 '\nreturn {participantList_,participantChange_,participantArchivePending_};')(
 str_,norm_,SM,fee_,fail_,expectVersion_,sheetRows_,sheet_,entries_,
 ()=>practices,(_ss,id)=>{
  const p=practices.find(x=>x.practiceId===id);
  if(!p)fail_('NOT_FOUND','practice');return p;
 },(_ss,id)=>sheetRows_(null,'集金記録').filter(x=>x[0]===id),
 balanceRecalc_,writeLedger_,safeCell_,SpreadsheetApp,now_,bool_,()=>false
);
const member={memberId:'M-DUTY',role:'duty'};
const list=()=>fn.participantList_({},member,{practiceId:'P-TODAY'}).data;
const baseline=list();
ok(baseline.participants.length===2&&baseline.participants[0].collectionCompleted,
 'paid and unpaid participants listed by fixed IDs');
ok(!('email' in baseline.participants[0])&&
 baseline.participants[0].registeredAt==='2026-11-18 20:10:00'&&
 baseline.participants[0].lastReportedAt==='2026-11-18 20:40:00'&&
 baseline.participants[0].updatedAt==='2026-11-18 20:40:00'&&
 baseline.participants[0].memberRegisteredAt==='2026-11-17T03:30:00.000Z',
 'attendance card tracks first and latest LINE report, keeps account application separate');
ok(baseline.participants[1].registeredAt==='2026-11-18 13:20:00'&&
 baseline.participants[1].updatedAt===null,
 'visitor signup uses approval date; no change record must not imply an update');
ok(baseline.participants[0].lineUserId==='U'+'a'.repeat(32)&&
 baseline.participants[1].lineUserId===null,
 'attendee memberId resolves own LINE subject, not duty member or visitor sponsor');
rows['参加者操作アーカイブ'].push(['OP-OLD-EDIT','P-TODAY','V-A','edit','{}',
 '2026-11-18 14:20:00','M-DUTY','completed']);
ok(list().participants[1].updatedAt==='2026-11-18 14:20:00',
 'a completed visitor edit archive supplies update date without changing signup');
rows['参加者操作アーカイブ'].pop();
ok(!baseline.financeLocked&&!baseline.matchLocked,'not finalized and no match allows editing');
ok(baseline.practices.length===2&&baseline.practices[0].place==='曽谷公民館',
 'all schedules and their venues returned for date selector');
const savedReadWrites=writes.length;
rows['メンバー'][0][1]='利用申請に合わせた名前';
ok(list().participants[0].name==='利用申請に合わせた名前'&&
 writes.length===savedReadWrites,
 'member display name tracks the member master on each read without mutating Sheets');
rows['メンバー'][0][1]='全力太郎';
rows['登録申請'][0][1]='U'+'e'.repeat(32);
ok(list().participants[0].memberRegisteredAt===null&&
 list().participants[0].registeredAt==='2026-11-18 20:10:00',
 'mismatched registration token must not change the independent attendance report date');
rows['登録申請'][0][1]='U'+'a'.repeat(32);
const catStart=gas.indexOf('function setCategory_('),catEnd=gas.indexOf('function mutateLedger_(',catStart);
ok(catStart>=0&&catEnd>catStart,'direct fee-category operation present');
const setCategory=new Function('str_','practice_','SM','fail_','entries_','row_','unlockable_',
 'sheet_','sheetRows_','bool_','expectVersion_','paymentRows_','fee_','balanceRecalc_','writeLedger_',
 gas.slice(catStart,catEnd)+'\nreturn setCategory_;')(
 str_,(_ss,id)=>practices.find(x=>x.practiceId===id),SM,fail_,entries_,
 (xs,id)=>xs.find(x=>x.rowId===id),()=>{},sheet_,sheetRows_,bool_,expectVersion_,
 (_ss,id)=>rows['集金記録'].filter(x=>x[0]===id),fee_,balanceRecalc_,writeLedger_);
fails(()=>setCategory({},member,{practiceId:'P-TODAY',participantId:'M-A',
 category:'visitor',expectedVersion:0}),'LOCKED');
ok(writes.length===0,'direct fee-category endpoint cannot turn a member into a visitor');

fails(()=>fn.participantChange_({},member,{action:'edit',practiceId:'P-TODAY',
 participantId:'M-A',expectedVersion:77}),'CONFLICT');
ok(writes.length===0,'stale edit writes nothing');
const edit=(p,id='M-A',version=0)=>fn.participantChange_({},member,{
 operationId:'OP-EDIT-00000001',action:'edit',practiceId:'P-TODAY',participantId:id,
 expectedVersion:version,name:p.name||'全力太郎',nameKana:p.nameKana||'ゼンリョクタロウ',
 category:p.category||rows['出欠回答'].find(x=>x[1]===id)?.[4]||'member',attending:p.attending??true,memo:p.memo||''
}).data;
const changed=edit({category:'student',memo:'学生区分へ変更'});
ok(changed.action==='edit'&&changed.version===1&&changed.ledgerChanged,
 'paid member reclassified to student, version incremented');
ok(rows['出欠回答'][0][4]==='student'&&rows['出欠回答'][0][7]===1,
 'saved eligible category and version using existing 9-column schema');
ok(ledger[1].income===400&&ledger[1].balance===400&&ledger[2].balance===700,
 'paid fee reclass correctly updates current and future open ledger balances');
fails(()=>edit({category:'visitor'},'M-A',1),'LOCKED');
fails(()=>edit({name:'別人',category:'student'},'M-A',1),'LOCKED');
ok(rows['集金記録'][0][2]===true,'paid status retained for paid category change');
const archived=rows['参加者操作アーカイブ'];
ok(archived[0][7]==='completed'&&JSON.parse(archived[0][4]).attendance[4]==='member',
 'first edit safely archived original category before mutation');
ok(flushed===1&&writes.indexOf('flush')<writes.indexOf('出欠回答.set')&&
 writes.indexOf('flush')<writes.indexOf('全体収支管理表.write'),
 'pre-change archive persisted before writes to attendance and ledger');
fails(()=>edit({name:'別人',category:'student'},'M-A',0),'CONFLICT');
rows['試合セッション'].push(['P-TODAY','RV-TOKEN']);
fails(()=>edit({name:'別人'},'M-A',1),'LOCKED');
ok(list().matchLocked,'match session lock displayed');
rows['試合セッション']=[];
ledger[1].status='confirmed';
fails(()=>edit({name:'別人'},'M-A',1),'LOCKED');
ledger[1].status='open';
ledger[2].status='confirmed';
fails(()=>edit({category:'member'},'M-A',1),'CONFLICT');
ok(archived.length===1,'changes to later finalized balance are rejected before archive');
ledger[2].status='open';
const deleted=fn.participantChange_({},member,{operationId:'OP-DELETE-000001',
 action:'delete',practiceId:'P-TODAY',participantId:'M-A',expectedVersion:1}).data;
ok(deleted.action==='delete'&&deleted.version===2&&deleted.archived,
 'paid member deleted by fixed ID after explicit confirmation');
ok(rows['出欠回答'].length===2&&rows['出欠回答'].every(x=>x[1]!=='M-A'),
 'physical response removed without affecting another meeting or member');
ok(rows['集金記録'].every(x=>x[1]!=='M-A')&&
 rows['集金記録'].some(x=>x[1]==='M-O'), 'matching payment record deleted, unrelated payment remains');
ok(ledger[1].income===0&&ledger[1].balance===0&&ledger[2].balance===300,
 'paid delete removes exact fee and recalculates only open later balance');
ok(archived.length===2&&archived[1][7]==='completed'&&
 JSON.parse(archived[1][4]).payment[2]===true,
 'deleted response and payment saved in recovery archive');
ok(flushed===2,'every mutation flushes recovery archive first');
const v=rows['出欠回答'][0];
const absent=edit({name:'全力花子',category:'visitor',attending:false,memo:'欠席へ変更'},
 'V-A',1);
ok(absent.action==='edit'&&!absent.attending&&!absent.ledgerChanged,
 'absent participant uncollected, no ledger difference');
ok(rows['集金記録'].every(x=>x[1]!=='V-A')&&rows['出欠回答'][0][5]===false,
 'absent participation stays visible and stale uncollected payment row removed');
const pendingArchive=rows['参加者操作アーカイブ'][2];
pendingArchive[7]='prepared';
fails(()=>edit({name:'例'},'V-A',2),'CONFLICT');
pendingArchive[7]='completed';
ok(!fn.participantArchivePending_({},'V-A'),'completed archive no longer blocks changes');
// If a member master changed after the LINE attendance was recorded, a normal
// attendance edit preserves the authoritative identity and syncs that one row.
rows['出欠回答'].push(['P-TODAY','M-SYNC','旧記録の名前','オールドカナ',
  'member',true,'',0,'M-DUTY']);
rows['メンバー'].push(['M-SYNC','利用登録の最新名','U'+'c'.repeat(32),true,false,'サイシンカナ']);
ok(list().participants.find(x=>x.participantId==='M-SYNC').name==='利用登録の最新名'&&
 list().participants.find(x=>x.participantId==='M-SYNC').nameKana==='サイシンカナ',
 'stale participation name and kana are overlaid from the current member master');
fails(()=>fn.participantChange_({},member,{operationId:'OP-SYNC-WRONG-NAME',
  action:'edit',practiceId:'P-TODAY',participantId:'M-SYNC',
  expectedVersion:0,name:'不正な名前',nameKana:'サイシンカナ',category:'member',
  attending:true,memo:'更新'}),'LOCKED');
const synchronized=fn.participantChange_({},member,{operationId:'OP-SYNC-CANONICAL',
  action:'edit',practiceId:'P-TODAY',participantId:'M-SYNC',
  expectedVersion:0,name:'利用登録の最新名',nameKana:'サイシンカナ',category:'member',
  attending:true,memo:'更新'}).data;
ok(synchronized.version===1&&rows['出欠回答'].find(x=>x[1]==='M-SYNC')[2]==='利用登録の最新名'&&
 rows['出欠回答'].find(x=>x[1]==='M-SYNC')[3]==='オールドカナ',
 'attendance edit accepts master kana and keeps the saved historical kana');
for(const tag of ['participantDialog','participantPractice','participantCards','participantReload',
 'participantEditDialog','participantName','participantVisitorIdentity','participantMemberIdentity',
 'participantAttendance','participantCategory','participantMemo','participantDeleteDialog','participantDeleteConfirm']){
 ok(html.includes('id="'+tag+'"'),'legacy participant UI: '+tag);
}
ok(!html.includes('id="participantEmail"')&&!html.includes('id="participantEmailNote"'),
 'obsolete email display and edit form completely removed');
ok(html.includes('id="participantCategoryVisitor"'),
 'visitor category option can be restricted to existing visitors');
ok(ui.includes("'時間区分：'+practice.hours+'h'"),'collection home fee category is 4h');
ok(!ui.includes("'時間区分：'+practice.hours+'時間'"),'old home display removed');
ok(ui.includes("btn.disabled=blocked||(action==='delete'&&isVisitorParticipant_(p))"),
 'finance/match locks preserved and visitor deletion disabled in participant list');
ok(ui.includes("'/api/participant/change'"),'authenticated participant mutation API used');
ok(worker.includes("'/api/participant/list':'participant.list'")&&
 worker.includes("'/api/participant/change':'participant.change'"),'new Worker routes registered');
const disp=gas.slice(gas.indexOf("function dispatch_("),gas.indexOf("function doPost(",gas.indexOf("function dispatch_(")));
ok(disp.includes("['overview','ledger.list','cash.get','schedule.list','schedule.delete.preview','participant.list']"),
 'read operation remains duty/admin only');
ok(disp.includes("'participant.change'")&&disp.includes("auditExisting_(ss,opId,op,member)"),
 'mutation uses existing ScriptLock, opId audit, member gate');
ok(gas.includes("'参加者操作アーカイブ':['operationId','practiceId'"),
 'per-participant archive required by schema');
console.log('PASS '+n+'/'+n+' v0.16.38d participation list/edit/delete, ledger and match safety');
