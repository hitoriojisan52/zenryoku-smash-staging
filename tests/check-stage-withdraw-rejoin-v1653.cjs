#!/usr/bin/env node
'use strict';
/* Offline execution of the REAL staging GAS withdrawal and reapplication
 * functions against a minimal in-memory native-Sheets double.
 * Checks safety gates, physical deletion, no historical data loss, new ID.
 * No external calls, accounts or live spreadsheets are modified.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'gas-staging/AccessAndGuestV160.gs'),'utf8');
const worker=fs.readFileSync(path.join(root,'cloudflare-worker/worker.js'),'utf8');
const front=fs.readFileSync(path.join(root,'live-access-v2.js'),'utf8');
let n=0;
const ok=(v,s)=>{assert.ok(v,s);n++};
const blocked=(fn,code,s)=>{assert.throws(fn,e=>e.code===code,s);n++};
const ADMIN='M-TEST-DUTY',OLD='M-TEST-WITHDRAW-V1653-001',
 ADMIN_LINE='U'+'a'.repeat(32),LINE='U'+'b'.repeat(32),
 STAGE='1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac',
 opid='aa123456-0123-4123-8123-123456789abc';
const copies=x=>JSON.parse(JSON.stringify(x));
const auditDate='2026-11-19T11:15:00.000Z';
const db={
 'メンバー':[[ADMIN,'架空管理者',ADMIN_LINE,true,true],[OLD,'架空退会対象',LINE,true,false]],
 'チーム所属':[['T-ROLE-DUTY',ADMIN,true],['T-ROLE-DUTY',OLD,true]],
 '登録申請':[['REQ-OLD',LINE,'架空退会対象','approved',auditDate,ADMIN,auditDate,OLD]],
 '閲覧リンク':[['a'.repeat(64),'TEST-20261116','2026-12-15T00:00:00.000Z','',OLD,auditDate]],
 '退会履歴':[],
 '操作履歴':[['OP-OLD','payment.set',OLD,auditDate,'TEST-20261116','{}']],
 '出欠回答':[['TEST-20261116',OLD,'架空退会対象','','member',true,'',0,OLD]],
 '集金記録':[['TEST-20261116',OLD,false,0,OLD,auditDate]],
 '全体収支管理表':[['2026-11-16','検証体育館',0,0,0,'','P-TEST-20261116']],
 '試合版管理':[['TEST-20261116',1,OLD]],
 '試合操作履歴':[['OP-MATCH','TEST-20261116',OLD,auditDate]],
 '試合セッション':[['TEST-20261116',OLD,'ended']]
};
const protectedSheets=['出欠回答','集金記録','全体収支管理表',
 '試合版管理','試合操作履歴','試合セッション'];
const beforeProtected=Object.fromEntries(protectedSheets.map(s=>[s,copies(db[s])]));
const conf={SPREADSHEET_ID:STAGE,WITHDRAW_ENABLED:'false',
 STAGING_WITHDRAW_PURPOSE:'staging-member-withdraw-v1653'};
const fail_=(code,message)=>{const e=new Error(message);e.code=code;throw e};
const str_=x=>String(x??'').trim();
const bool_=x=>x===true||x==='TRUE'||x==='true';
const safeCell_=x=>String(x);
const member={memberId:ADMIN,name:'架空管理者',role:'admin'};
let writes=0,serial=0,forbiddenWrites=0;
class Sheet{
 constructor(name){this.name=name;}
 getLastRow(){return db[this.name].length+1;}
 appendRow(values){db[this.name].push([...values]);writes++;}
 deleteRow(index){assert.ok(index>1&&index<=this.getLastRow());db[this.name].splice(index-2,1);writes++;}
 getRange(row,col,height,width){
  const sh=this;return {
   setValue(value){db[sh.name][row-2][col-1]=value;writes++;},
   setValues(values){for(let i=0;i<values.length;i++)
    for(let j=0;j<values[i].length;j++)db[sh.name][row-2+i][col-1+j]=values[i][j];
    writes++;},
   getValues(){return db[sh.name].slice(row-2,row-2+height).map(x=>x.slice(col-1,col-1+width));}
  };
 }
}
const sheets=Object.fromEntries(Object.keys(db).map(s=>[s,new Sheet(s)]));
const ss={getId:()=>STAGE};
const sheetRows_=(_ss,name)=>copies(db[name]||[]);
const sheet_=(_ss,name)=>sheets[name];
const accessSheet16_=(_ss,name)=>{if(!sheets[name])fail_('SETUP','missing '+name);return sheets[name];};
const accessRows16_=(sheet,width)=>copies(db[sheet.name].map(x=>x.slice(0,width)));
const withLock_=fn=>fn();
const audit_=(_ss,id,op,actor,target,result)=>{
 db['操作履歴'].push([id,op,actor.memberId,auditDate,target,JSON.stringify(result)]);
 writes++;
};
const accessTime16_=()=>auditDate;
const SpreadsheetApp={flush:()=>{}};
const headers=Object.fromEntries(Object.keys(db).map(k=>[k,[]]));
const SM={headers};
const SMA16={registrations:'登録申請',links:'閲覧リンク',
 regHeader:['requestId','lineUserId','displayName','status','requestedAt','decidedBy','decidedAt','memberId'],
 linkHeader:['tokenHash','practiceId','expiresAt','revokedAt','issuedBy','createdAt'],
 teamId:'T-ROLE-DUTY'};
const Utilities={getUuid:()=>{serial++;return '22222222-2222-4222-8222-'+String(serial).padStart(12,'0');}};
const accessAdmin16_=actor=>{if(actor.role!=='admin')fail_('FORBIDDEN','admin only')};
const accessMemberRow16_=(_ss,line)=>db['メンバー'].find(r=>r[2]===line)||null;
const checkOpId_=payload=>payload.operationId;
const auditExisting_=()=>null;
const accessRole16_=(row)=>row[4]?'admin':
 db['チーム所属'].some(r=>r[1]===row[0]&&r[2])?'duty':'member';
const historyRows=()=>db['退会履歴'].map(r=>({memberId:r[0],name:r[1],
 withdrawnAt:r[2],state:r[4]}));
const accessHistoryForManagerV1623_=()=>historyRows();
const deps={str_,bool_,fail_,conf_:(k)=>conf[k]||'',accessAdmin16_,
 withLock_,accessSheet16_,accessRows16_,sheetRows_,sheet_,SpreadsheetApp,
 SM,SMA16,safeCell_,accessTime16_,audit_,Utilities,accessMemberRow16_,
 checkOpId_,auditExisting_,accessRole16_,accessHistoryForManagerV1623_};
const names=Object.keys(deps),values=Object.values(deps);
const bgn=src.indexOf('var SMA_STAGE_WITHDRAW_ID_V1636='),
 end=src.indexOf('/** Editor-only, READ-ONLY stage preflight.',bgn);
ok(bgn>=0&&end>bgn,'stage withdrawal code section located');
const staging=new Function(...names,src.slice(bgn,end)+
 '\nreturn {accessStageWithdrawalV1636_,accessStageWithdrawHistoryV1636_};'
)(...values);
const withdraw=(actor=member,id=OLD,op=opid)=>staging.accessStageWithdrawalV1636_(
 ss,actor,{memberId:id,confirmMemberId:id,operationId:op});
blocked(()=>withdraw(),'WITHDRAW_DISABLED','default disabled even in staging');
ok(writes===0,'no writes before both flags true');
conf.WITHDRAW_ENABLED='true';
conf.STAGING_WITHDRAW_PURPOSE='incorrect';
blocked(()=>withdraw(),'WITHDRAW_DISABLED','wrong staging purpose rejected');
conf.STAGING_WITHDRAW_PURPOSE='staging-member-withdraw-v1653';
conf.SPREADSHEET_ID='prod';
blocked(()=>withdraw(),'STAGING_ONLY','non-staging GAS binding rejected');
conf.SPREADSHEET_ID=STAGE;
blocked(()=>withdraw({memberId:OLD,role:'member'},ADMIN),'FORBIDDEN',
 'only authenticated administrators can initiate withdrawal');
blocked(()=>withdraw(member,ADMIN),'FORBIDDEN','cannot withdraw the actor');
blocked(()=>withdraw(member,'M-UNKNOWN'),'WITHDRAW_DISABLED','unknown IDs blocked at gate');
blocked(()=>withdraw(member,OLD,'not-an-id'),'BAD_REQUEST','UUID v4 mandatory');
ok(writes===0,'invalid and unsafe requests performed zero writes');
const result=withdraw();
ok(result.ok&&result.data.status==='withdrawn'&&result.data.memberId===OLD,
 'valid stage member withdrawal completes');
ok(db['メンバー'].length===1&&db['メンバー'][0][0]===ADMIN,
 'only old member master physically deleted; sole admin preserved');
ok(db['チーム所属'].every(r=>r[1]!==OLD)&&db['登録申請'].every(r=>r[1]!==LINE),
 'team and all old LINE registration rows removed');
ok(db['閲覧リンク'][0][3]===auditDate,
 'previously issued share link is revoked, not deleted');
ok(db['退会履歴'].length===1&&db['退会履歴'][0][0]===OLD&&
 db['退会履歴'][0][4]==='completed'&&db['退会履歴'][0][5]===opid,
 'history contains old ID, status and operation ID');
ok(!db['退会履歴'][0].includes(LINE),
 'withdrawal history never stores LINE subject');
for(const name of protectedSheets)
 ok(JSON.stringify(db[name])===JSON.stringify(beforeProtected[name]),
  name+' legacy data and identifiers preserved byte-for-byte');
ok(db['操作履歴'].some(r=>r[0]===opid&&r[1]==='member.manage.withdraw')&&
 db['操作履歴'].some(r=>r[0]==='OP-OLD'),
 'new withdrawal audit appended; old audit remains');
blocked(()=>withdraw(),'NOT_FOUND','second withdrawal cannot replay deleted account');
const regStart=src.indexOf('function accessRegistration16_('),
 regEnd=src.indexOf('function accessAdmin16_(',regStart);
ok(regStart>=0&&regEnd>regStart,'actual registration handler isolated');
const register=new Function(...names,src.slice(regStart,regEnd)+
 '\nreturn accessRegistration16_;')(...values);
const status=()=>register(ss,LINE,'member.status',{}).data.status;
ok(status()==='not_requested','withdrawn LINE ID is eligible for fresh application');
const applied=register(ss,LINE,'member.apply',{displayName:'再入会の架空メンバー'});
ok(applied.data.status==='pending','same LINE user can reapply normally');
const manageStart=src.indexOf('function accessManagement16_('),
 manageEnd=src.indexOf('function accessShareIssue16_(',manageStart);
ok(manageStart>=0&&manageEnd>manageStart,'actual manager approval handler isolated');
const manager=new Function(...names,'accessStageWithdrawalV1636_',
 'accessWithdrawCheckV1627_',src.slice(manageStart,manageEnd)+
 '\nreturn accessManagement16_;')(
 ...values,staging.accessStageWithdrawalV1636_,()=>{throw Error('not expected')});
const pending=db['登録申請'][0];
const approval=manager(ss,member,'member.manage.decide',{
 requestId:pending[0],approve:true,operationId:'OP-REJOIN-001'});
const newMember=db['メンバー'].find(r=>r[2]===LINE);
ok(approval.data.status==='approved'&&newMember,'reapplication approved');
ok(newMember[0]!==OLD&&/^M-[0-9a-f-]+$/i.test(newMember[0]),
 'reentry generated NEW member ID, never restored old ID');
ok(newMember[3]===true&&newMember[4]===false&&
 !db['チーム所属'].some(r=>r[1]===newMember[0]),
 'rejoined member is active non-admin without inherited duty role');
ok(db['退会履歴'][0][0]===OLD&&db['退会履歴'].length===1,
 'historic withdrawal stays attached to OLD ID only');
for(const name of protectedSheets)
 ok(JSON.stringify(db[name])===JSON.stringify(beforeProtected[name]),
  name+' unchanged even after reentry approval');
ok(status()==='approved','same LINE identity logs in as newly approved member');
ok(front.includes("title:'【退会確認（1/2）】'")&&
 front.includes("title:'【退会確認（2/2）】'")&&
 front.includes("const operationId=crypto.randomUUID();"),
 'UI has two confirmations and unique operation identifier');
ok(front.includes("data.withdrawn.some(x=>x.memberId===m.memberId&&x.state==='completed')"),
 'UI success verifies both roster deletion and completed archive');
ok(worker.includes("result.data.withdrawEnabled=result.data.withdrawEnabled===true&&withdrawAtEdge"),
 'Worker requires double backend permission before enabling UI');
console.log('PASS '+n+'/'+n+' stage-only withdrawal, historical preservation, reapplication and new member ID');
