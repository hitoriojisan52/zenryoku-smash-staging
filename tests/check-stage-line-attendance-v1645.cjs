#!/usr/bin/env node
'use strict';
// Isolated in-memory regression. No LINE calls, Cloudflare traffic or Sheets writes.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const gas=read('gas-staging/コード.gs'),js=read('live.js'),
 html=read('live.html'),worker=read('cloudflare-worker/worker.js'),
 stage=read('stage-ui.js');
let n=0;
const ok=(v,msg)=>{assert.ok(v,msg);n++;};
const fails=(fn,code)=>{assert.throws(fn,e=>e&&e.smCode===code,code);n++;};
new Function(gas);new Function(js);new Function(stage);n+=3;
const start=gas.indexOf('/* v0.16.45 staging LINE attendance:');
const end=gas.indexOf('function dispatch_(body)',start);
ok(start>=0&&end>start,'own attendance service module is part of staging GAS');
const source=gas.slice(start,end);
const fail_=(code,msg)=>{let e=new Error(msg);e.smCode=code;throw e};
const str_=v=>String(v??'').trim();
const norm_=v=>str_(v).normalize('NFKC').replace(/[\s\u3000]+/g,'');
const bool_=v=>v===true||v==='TRUE'||v==='true';
const safeCell_=v=>/^[=+@]/.test(String(v))?"'"+v:String(v);
const member={memberId:'M-A',name:'全力太郎',role:'member'};
const practice=[
 {practiceId:'P-FUTURE',date:'2026-11-20',place:'曽谷公民館',startTime:'09:00',endTime:'13:00'},
 {practiceId:'P-PAST',date:'2026-11-15',place:'旧会場',startTime:'09:00',endTime:'13:00'}
];
const db={
 'メンバー':[['M-A','全力太郎','U'+'a'.repeat(32),true,false]],
 '出欠回答':[],
 '集金記録':[],
 '操作履歴':[]
};
const writes=[],ledger=[],locks=new Set();
const sheetRows_=(_ss,key)=>(db[key]||[]).map(r=>[...r]);
const sheet_=(_ss,key)=>({
 appendRow(r){if(!db[key])throw Error('unexpected sheet '+key);db[key].push([...r]);writes.push(key);}
});
const entries_=()=>ledger.map(x=>({...x}));
const practice_=(ss,id)=>{
 const p=practice.find(p=>p.practiceId===id);
 if(!p)fail_('NOT_FOUND','日程がありません');return p;
};
const participantMatchLocked_=(_ss,id)=>locks.has(id);
const paymentRows_=(_ss,id)=>db['集金記録'].filter(r=>r[0]===id);
const participantArchivePending_=()=>false;
const attendanceAuditDates_=()=>{const r=Object.create(null);
 for(const a of db['操作履歴']){
  if(a[1]!=='attendance.submit')continue;
  const key=a[4],stamp=a[3];
  if(!r[key])r[key]={first:stamp,last:stamp};
  else{if(stamp<r[key].first)r[key].first=stamp;if(stamp>r[key].last)r[key].last=stamp;}
 }
 return r;
};
const checkOpId_=p=>{if(!/^OP-/.test(p.operationId))fail_('BAD_REQUEST','操作IDなし');return p.operationId};
let changed=null;
const participantChange_=(_ss,actor,payload)=>{
 changed={actor,payload};
 const r=db['出欠回答'].find(r=>r[0]===payload.practiceId&&r[1]===payload.participantId);
 if(!r)fail_('NOT_FOUND','参加者なし');
 r[5]=payload.attending;r[6]=payload.memo;r[7]++;
 return {ok:true,data:{practiceId:payload.practiceId,participantId:payload.participantId,
  action:'edit',version:r[7],attending:r[5]}};
};
const keys=['str_','norm_','bool_','safeCell_','fail_','practices_','today_',
 'sheetRows_','sheet_','entries_','practice_','participantMatchLocked_',
 'paymentRows_','participantArchivePending_','checkOpId_','now_',
 'attendanceAuditDates_','participantChange_'];
const fn=new Function(...keys,source+'\nreturn {attendanceMine_,attendanceSubmit_};')(
 str_,norm_,bool_,safeCell_,fail_,()=>practice,()=> '2026-11-18',
 sheetRows_,sheet_,entries_,practice_,participantMatchLocked_,
 paymentRows_,participantArchivePending_,checkOpId_,
 ()=> '2026-11-18 22:00:01',attendanceAuditDates_,participantChange_);
const mine=()=>fn.attendanceMine_({},member).data;
const initial=mine();
ok(initial.practices.length===1&&initial.practices[0].place==='曽谷公民館',
 'member can select only enabled future meeting with venue');
ok(initial.answers[0].version===null&&!initial.answers[0].registered,
 'initial member attendance does not fabricate a submission');
fails(()=>fn.attendanceSubmit_({},member,{
 operationId:'OP-SPOOF',practiceId:'P-FUTURE',memberId:'M-OTHER',
 attending:true,memo:'',expectedVersion:null}),'BAD_REQUEST');
fails(()=>fn.attendanceSubmit_({},member,{
 operationId:'OP-VISITOR',practiceId:'P-FUTURE',category:'visitor',
 attending:true,memo:'',expectedVersion:null}),'BAD_REQUEST');
fails(()=>fn.attendanceSubmit_({},member,{
 operationId:'OP-PAST',practiceId:'P-PAST',
 attending:true,memo:'',expectedVersion:null}),'LOCKED');
locks.add('P-FUTURE');
fails(()=>fn.attendanceSubmit_({},member,{
 operationId:'OP-MATCH',practiceId:'P-FUTURE',
 attending:true,memo:'',expectedVersion:null}),'LOCKED');
locks.clear();
ledger.push({rowId:'P-P-FUTURE',status:'confirmed'});
fails(()=>fn.attendanceSubmit_({},member,{
 operationId:'OP-LOCK',practiceId:'P-FUTURE',
 attending:true,memo:'',expectedVersion:null}),'LOCKED');
ledger.pop();
const saved=fn.attendanceSubmit_({},member,{
 operationId:'OP-CREATE',practiceId:'P-FUTURE',
 attending:true,memo:'初回参加',expectedVersion:null}).data;
ok(saved.participantId==='M-A'&&saved.reportedAt==='2026-11-18 22:00:01',
 'server uses verified memberId and server JST receipt timestamp');
ok(db['出欠回答'].length===1&&db['出欠回答'][0][1]==='M-A'&&
 db['出欠回答'][0][4]==='member'&&writes.length===1,
 'member submission is NOT a visitor, and never changes ledger or payment');
db['操作履歴'].push(['OP-CREATE','attendance.submit','M-A',saved.reportedAt,
 'P-FUTURE|M-A',JSON.stringify({ok:true,data:saved})]);
ok(mine().answers[0].reportedAt===saved.reportedAt,'own attendance reads the actual audit timestamp');
fails(()=>fn.attendanceSubmit_({},member,{
 operationId:'OP-STALE',practiceId:'P-FUTURE',
 attending:false,memo:'',expectedVersion:null}),'CONFLICT');
const update=fn.attendanceSubmit_({},member,{
 operationId:'OP-CHANGE',practiceId:'P-FUTURE',
 attending:false,memo:'欠席に変更',expectedVersion:0}).data;
ok(update.version===1&&update.attending===false&&changed.payload.name==='全力太郎'&&
 changed.payload.category==='member'&&changed.actor.memberId==='M-A',
 'amendment runs existing protected participant change with immutable identity');
ok(db['出欠回答'][0][5]===false&&db['出欠回答'][0][6]==='欠席に変更',
 'stored attendance response updates without visitor conversion');
db['操作履歴'].push(['OP-CHANGE','attendance.submit','M-A','2026-11-18 22:10:05',
 'P-FUTURE|M-A',JSON.stringify({ok:true,data:update})]);
ok(mine().answers[0].reportedAt==='2026-11-18 22:00:01'&&
 mine().answers[0].lastReportedAt==='2026-11-18 22:10:05',
 'first and latest submission times remain separately traceable');
const dispatch=gas.slice(gas.indexOf('function dispatch_(body)'),gas.indexOf('function doPost(',gas.indexOf('function dispatch_(body)')));
ok(dispatch.indexOf("op==='attendance.submit'")>dispatch.indexOf("member=member_(ss,body.lineUserId)")&&
 dispatch.indexOf("op==='attendance.submit'")<dispatch.indexOf('requireDuty_(member)'),
 'membership verified; general members can submit without duty privileges');
ok(dispatch.includes("auditExisting_(ss,attendanceOpId,op,member)")&&
 dispatch.includes("audit_(ss,attendanceOpId,op,member,"),
 'submission uses existing operationId idempotency and durable audit');
ok(worker.includes("'/api/attendance/mine':'attendance.mine'")&&
 worker.includes("'/api/attendance/submit':'attendance.submit'"),
 'new routes require Worker authenticated bearer verification');
ok(!/LINE_TOKEN_INVALID.*skip/.test(worker),'LINE token verification never bypassed');
ok(js.includes('withLoginOnExternalBrowser:true')&&
 html.includes('https://liff.line.me/2012602642-XBSkXduO'),
 'external browser login re-initializes and a valid LIFF recovery URL is offered');
ok(js.includes("'/api/attendance/submit'")&&
 js.includes("const AT={practices:")&&
 js.includes("memo:$('attendanceMemo').value.trim()"),
 'member UI submits attendance status, date and note, not identity/category');
ok(stage.includes("e?.code==='LINE_TOKEN_INVALID'")&&
 html.includes('id="stageLineAuthHelp"'),
 '401 shows safe LIFF recovery rather than raw tokens or unauthorized fallback');
console.log('PASS '+n+'/'+n+' member attendance timestamps, identity and authentication safeguards');
