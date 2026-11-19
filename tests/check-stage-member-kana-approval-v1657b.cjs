#!/usr/bin/env node
'use strict';
// Real staging GAS approval/edit in a memory-only workbook; never touches live data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'../gas-staging/AccessAndGuestV160.gs'),'utf8');
let n=0,writes=0,serial=0;const ok=(v,m)=>{assert.ok(v,m);n++};
const rejects=(f,c,m)=>{assert.throws(f,e=>e.code===c,m);n++};
const str_=v=>String(v??'').trim(),norm_=v=>String(v??'').normalize('NFKC').replace(/[\s\u00a0\u3000]+/g,'');
const bool_=v=>v===true||v==='TRUE',safeCell_=v=>String(v);
const fail_=(c,m)=>{const e=new Error(m);e.code=c;throw e},withLock_=fn=>fn();
const ADMIN='M-ADMIN',LINE='U'+'b'.repeat(32);
const DB={
 'メンバー':[[ADMIN,'架空管理者','U'+'a'.repeat(32),true,true,'']],
 '登録申請':[['REQ-NEW',LINE,'架空花子','pending','2026-11-19T09:10:00Z','','','','カクウハナコ']],
 '当番チーム':[['T-ROLE-DUTY','当番担当',true]],'チーム所属':[],'退会履歴':[],
 '操作履歴':[['OP-OLD','payment.set',ADMIN,'2026-11-18','TEST','{}']],
 '出欠回答':[['TEST-1',ADMIN,'架空管理者','','member',true,'備考',0,ADMIN]],
 '集金記録':[['TEST-1',ADMIN,false,0,ADMIN,'2026-11-18']],
 '全体収支管理表':[['2026-11-18','検証体育館',0,0,0,'','P-TEST-1']],
 '試合セッション':[['TEST-1','REV-1',1,1,'2026-11-18']],
 '試合版管理':[['REV-1','TEST-1','ready','{}','sha','OP-0','2026-11-18']],
 '試合操作履歴':[['OP-MATCH','TEST-1',ADMIN,'create',1,'2026-11-18','{}']]
};
const immutable=['出欠回答','集金記録','全体収支管理表','試合セッション',
 '試合版管理','試合操作履歴','退会履歴'];
const before=Object.fromEntries(immutable.map(k=>[k,JSON.stringify(DB[k])]));
const oldAudit=JSON.stringify(DB['操作履歴'][0]);
class Sheet{
 constructor(name){this.name=name}
 getLastRow(){return DB[this.name].length+1}
 appendRow(row){DB[this.name].push([...row]);writes++}
 getRange(row,col,height=1,width=1){
  const sh=this;
  return {
   setValue(v){DB[sh.name][row-2][col-1]=v;writes++},
   setValues(v){for(let i=0;i<v.length;i++)for(let j=0;j<v[i].length;j++)
     DB[sh.name][row-2+i][col-1+j]=v[i][j];writes++},
   getValues(){return DB[sh.name].slice(row-2,row-2+height).map(r=>r.slice(col-1,col-1+width))}
  };
 }
}
const sheets=Object.fromEntries(Object.keys(DB).map(n=>[n,new Sheet(n)]));
const sheet_=(ss,n)=>sheets[n],sheetRows_=(ss,n)=>DB[n].map(r=>[...r]);
const accessSheet16_=(ss,n)=>{if(!sheets[n])fail_('SETUP','missing');return sheets[n]};
const accessRows16_=(s,w)=>DB[s.name].map(r=>r.slice(0,w));
const accessAdmin16_=actor=>{if(actor.role!=='admin')fail_('FORBIDDEN','admin only')};
const accessMemberRow16_=(_ss,id)=>DB['メンバー'].find(m=>m[2]===id)||null;
const accessTime16_=()=> '2026-11-19T13:00:00.000Z';
const accessHistoryForManagerV1623_=()=>[],accessRole16_=m=>m[4]?'admin':'member';
const auditExisting_=(ss,id,op,actor)=>{
 const row=DB['操作履歴'].find(r=>r[0]===id);
 return row&&row[1]===op&&row[2]===actor.memberId?JSON.parse(row[5]):null;
};
const audit_=(ss,id,op,actor,target,res)=>{
 DB['操作履歴'].push([id,op,actor.memberId,'2026-11-19 13:00:00',target,JSON.stringify(res)]);writes++;
};
const SMA16={registrations:'登録申請',regHeader:['requestId','lineUserId','displayName','status',
 'requestedAt','decidedBy','decidedAt','memberId','nameKana']};
const Utilities={getUuid:()=>String(++serial).padStart(8,'0')+'-1111-4111-8111-111111111111'};
const ks=src.indexOf('function accessKanaV1657_('),ke=src.indexOf('function accessMemberRow16_(',ks);
ok(ks>0&&ke>ks,'kana helper found');
const accessKanaV1657_=new Function('norm_','fail_',src.slice(ks,ke)+'\nreturn accessKanaV1657_;')(norm_,fail_);
const start=src.indexOf('function accessManagement16_('),end=src.indexOf('function accessShareIssue16_(',start);
ok(start>0&&end>start,'real GAS manager found');
const names=['accessAdmin16_','accessStageWithdrawalV1636_','accessWithdrawCheckV1627_',
 'accessSheet16_','sheetRows_','accessRows16_','accessHistoryForManagerV1623_',
 'accessRole16_','str_','norm_','bool_','conf_','withLock_','checkOpId_',
 'auditExisting_','sheet_','safeCell_','fail_','audit_','SMA16',
 'SMA_STAGE_WITHDRAW_PURPOSE_V1636','SMA_STAGE_WITHDRAW_ID_V1636','accessKanaV1657_',
 'accessMemberRow16_','Utilities','accessTime16_'];
const values=[accessAdmin16_,()=>fail_('FORBIDDEN','withdraw disabled'),()=>fail_('FORBIDDEN','preview disabled'),
 accessSheet16_,sheetRows_,accessRows16_,accessHistoryForManagerV1623_,accessRole16_,
 str_,norm_,bool_,()=>'',withLock_,p=>p.operationId,auditExisting_,sheet_,safeCell_,fail_,audit_,
 SMA16,'not_enabled','test_only',accessKanaV1657_,
 accessMemberRow16_,Utilities,accessTime16_];
const manage=new Function(...names,src.slice(start,end)+'\nreturn accessManagement16_;')(...values);
const actor={role:'admin',memberId:ADMIN},ss={getId:()=> 'TEST-SHEET'};
let pending=manage(ss,actor,'member.manage.list',{}).data.pending;
ok(pending.length===1&&pending[0].nameKana==='カクウハナコ',
 'manager sees new applicant kana in pending list');
const approve=manage(ss,actor,'member.manage.decide',{requestId:'REQ-NEW',approve:true,
 operationId:'11111111-1111-4111-8111-111111111111'});
const member=DB['メンバー'].find(x=>x[2]===LINE),reg=DB['登録申請'][0];
ok(approve.data.status==='approved'&&member&&member.length===6&&member[5]==='カクウハナコ',
 'approving real GAS request saves member kana in appended F');
ok(reg[3]==='approved'&&reg[7]===member[0]&&reg[8]===member[5],
 'registered request and created member keep identical kana and immutable request identity');
const list=manage(ss,actor,'member.manage.list',{}).data.members.find(x=>x.memberId===member[0]);
ok(list.nameKana==='カクウハナコ'&&!!list.registeredAt,
 'approved member display includes kana and original application date');
const payload={memberId:member[0],displayName:'架空花子改',expectedName:'架空花子',
 nameKana:'カクウハナコカイ',expectedKana:'カクウハナコ',
 operationId:'22222222-2222-4222-8222-222222222222'};
const saved=manage(ss,actor,'member.manage.edit',payload);
ok(saved.data.registrationUpdated===true&&member[1]==='架空花子改'&&
 member[5]==='カクウハナコカイ'&&reg[2]==='架空花子改'&&reg[8]==='カクウハナコカイ',
 'admin name and kana edit updates only matching master/approved registration');
const written=writes;
rejects(()=>manage(ss,actor,'member.manage.edit',{...payload,operationId:'33333333-3333-4333-8333-333333333333'}),'CONFLICT',
 'stale displayName/kana edit rejected without overwrite');
ok(writes===written,'stale rejected edit made no writes');
rejects(()=>manage(ss,{role:'member',memberId:member[0]},'member.manage.edit',
 {...payload,operationId:'44444444-4444-4444-8444-444444444444'}),'FORBIDDEN',
 'nonadmin cannot change registration');
DB['登録申請'].push(['REQ-DUP',LINE,'架空花子改','approved','2026-11-19','','',member[0],'カクウハナコカイ']);
const beforeDuplicate=writes;
rejects(()=>manage(ss,actor,'member.manage.edit',{...payload,displayName:'不整合',
 expectedName:'架空花子改',nameKana:'フセイ',expectedKana:'カクウハナコカイ',
 operationId:'55555555-5555-4555-8555-555555555555'}),'CONFLICT',
 'duplicate approved request cannot cause partial mutation');
ok(writes===beforeDuplicate,'duplicate linked request changed no sheet');
DB['登録申請'].pop();
for(const name of immutable)ok(JSON.stringify(DB[name])===before[name],
 name+' unchanged by approval and identity editing');
ok(JSON.stringify(DB['操作履歴'][0])===oldAudit&&DB['操作履歴'].length===3&&
 DB['操作履歴'].slice(1).every(r=>['member.manage.decide','member.manage.edit'].includes(r[1])),
 'original audit retained; only approval and edit operations added');
console.log('PASS '+n+'/'+n+' GAS kana approval/edit, permissions and historic data isolation');
