#!/usr/bin/env node
'use strict';
// Staging-only, in-memory destructive withdrawal harness. All source is
// evaluated with fake Sheets: never contacts real LINE/Worker/GAS/Drive.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const gas=read('gas-staging/AccessAndGuestV160.gs'),
 worker=read('cloudflare-worker/worker.js'),ui=read('live-access-v2.js'),
 html=read('live.html'),finance=read('live.js'),css=read('stage-ui.css'),
 dialogs=read('dialog-close.js');
let n=0;
const ok=(value,msg)=>{assert.ok(value,msg);n++};
const errorCode=(callback,code)=>{
 assert.throws(callback,e=>e&&e.smCode===code,code);n++;
};
new Function(gas);new Function(worker.replaceAll('export default','const __default='));new Function(ui);n+=3;
const begin=gas.indexOf("var SMA_MEMBER_WITHDRAW_PURPOSE_V1650=");
const end=gas.indexOf('/** Editor-only, READ-ONLY stage preflight.',begin);
ok(begin>=0&&end>begin,'staging-only withdrawal functions accessible for real in-memory tests');
const id='1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac',
 actorId='M-'+ '1'.repeat(8)+'-1111-4111-8111-'+'1'.repeat(12),
 memberId='M-'+ '2'.repeat(8)+'-2222-4222-8222-'+'2'.repeat(12),
 actorLine='U'+'a'.repeat(32),targetLine='U'+'b'.repeat(32),
 opId='12345678-1234-4123-8123-123456789abc';
const config={
 SPREADSHEET_ID:id,WITHDRAW_MEMBER_ENABLED:'false',
 STAGING_WITHDRAW_MEMBER_PURPOSE:'staging-member-withdraw-v1650'
};
const db={
 'メンバー':[
  [actorId,'管理者',actorLine,true,true],
  [memberId,'一般メンバー',targetLine,true,false]
 ],
 '当番チーム':[['T-ROLE-DUTY','当番チーム',true]],
 'チーム所属':[['T-ROLE-DUTY',memberId,true]],
 '登録申請':[['REQ-1',targetLine,'一般メンバー','approved','2026-11-15T12:00:00Z',
  actorId,'2026-11-15T13:00:00Z',memberId]],
 '閲覧リンク':[['HASH','P-1','2026-11-30T00:00:00Z','',memberId,'2026-11-18T00:00:00Z']],
 '退会履歴':[],'操作履歴':[],
 '出欠回答':[['P-1',memberId,'一般メンバー','','member',true,'',1,memberId]],
 '集金記録':[['P-1',memberId,true,3,actorId,'2026-11-18']],
 '全体収支管理表':[['2026-11-18','体育館',1500,300,1200,'', 'P-P-1']],
 '試合セッション':[['SESSION-1','P-1']]
};
const preserved=JSON.stringify(Object.fromEntries(
 ['出欠回答','集金記録','全体収支管理表','試合セッション'].map(k=>[k,db[k]])));
class Sheet{
 constructor(name){this.name=name;}
 getRange(row,col){
  return {setValue:value=>{
   if(!db[this.name][row-2])throw Error('row missing '+this.name+':'+row);
   db[this.name][row-2][col-1]=value;
  }};
 }
 appendRow(values){db[this.name].push([...values]);}
 getLastRow(){return db[this.name].length+1;}
 deleteRow(row){db[this.name].splice(row-2,1);}
}
const ss={getId:()=>id},actor={memberId:actorId,role:'admin'};
const fail_=(code,message)=>{let e=new Error(message);e.smCode=code;throw e};
const str_=v=>String(v??'').trim();
const bool_=v=>v===true||v==='TRUE'||v==='true';
const sheetRows_=(_ss,k)=>(db[k]||[]).map(row=>[...row]);
const accessSheet16_=(_ss,k)=>{if(!db[k])fail_('SETUP','missing '+k);return new Sheet(k);};
const accessRows16_=(sh)=>sheetRows_({},sh.name);
const accessRole16_=m=>m[4]?'admin':'member';
const SM={headers:{'メンバー':['memberId'], 'チーム所属':['teamId'], '操作履歴':['operationId']}};
const SMA16={registrations:'登録申請',links:'閲覧リンク',
 regHeader:['requestId'],linkHeader:['tokenHash']};
const auditEntries=[];
const audit_=(...args)=>{auditEntries.push(args);db['操作履歴'].push([args[1],args[2],actorId,'2026-11-19 11:00:00',args[4],JSON.stringify(args[5])]);};
let flushes=0,failAtFlush=-1;
const SpreadsheetApp={flush(){flushes++;if(flushes===failAtFlush)throw Error('simulated flush failure');}};
const safeCell_=v=>String(v);
const args=['conf_','SMA_STAGE_WITHDRAW_ID_V1636','SMA_STAGE_WITHDRAW_HEADER_V1636',
 'SMA_STAGE_UUID4_RE_V1636','accessAdmin16_','accessStageBindingV1636_','accessSheet16_',
 'accessRows16_','accessTime16_','accessRole16_','audit_','bool_','fail_','sheetRows_',
 'str_','safeCell_','withLock_','SpreadsheetApp','SMA16','SM'];
const fn=new Function(...args,gas.slice(begin,end)+
 '\nreturn {accessMemberWithdrawalGateV1650_,accessMemberWithdrawalV1650_};')(
 key=>config[key],id,['memberId','displayName','withdrawnAt','withdrawnBy','state','operationId'],
 /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
 member=>{if(member.role!=='admin')fail_('FORBIDDEN','admin only')},
 current=>{if(config.SPREADSHEET_ID!==id||current.getId()!==id)fail_('STAGING_ONLY','wrong sheet')},
 accessSheet16_,accessRows16_,()=> '2026-11-19T11:00:00.000Z',accessRole16_,audit_,
 bool_,fail_,sheetRows_,str_,safeCell_,fn=>fn(),SpreadsheetApp,SMA16,SM);
const payload={memberId,confirmMemberId:memberId,confirmName:'一般メンバー',operationId:opId};
const call=(p=payload,a=actor)=>fn.accessMemberWithdrawalV1650_(ss,a,p);
ok(fn.accessMemberWithdrawalGateV1650_(ss)===false,'destructive operation is OFF by default');
errorCode(()=>call(),'WITHDRAW_DISABLED');
ok(db['メンバー'].length===2&&db['退会履歴'].length===0,
 'disabled action does not mutate member or history');
config.WITHDRAW_MEMBER_ENABLED='true';
errorCode(()=>call(payload,{memberId:actorId,role:'member'}),'FORBIDDEN');
errorCode(()=>call({...payload,confirmMemberId:'M-OTHER'}),'BAD_REQUEST');
errorCode(()=>call({...payload,confirmName:'名前が違う'}),'CONFLICT');
errorCode(()=>call({...payload,operationId:'not-a-uuid'}),'BAD_REQUEST');
errorCode(()=>call({...payload,memberId:actorId,confirmMemberId:actorId,confirmName:'管理者'}),'FORBIDDEN');
config.SPREADSHEET_ID='not-stage';
errorCode(()=>call(),'STAGING_ONLY');
config.SPREADSHEET_ID=id;
const result=call().data;
ok(result.memberId===memberId&&result.status==='withdrawn','withdrawal completes for eligible nonadmin');
ok(db['メンバー'].length===1&&db['メンバー'][0][0]===actorId,
 'only the targeted non-admin member is removed; administrator remains');
ok(db['チーム所属'].length===0&&db['登録申請'].length===0,
 'old team membership and registration are removed, allowing reapplication');
ok(db['閲覧リンク'][0][3]&&db['退会履歴'][0][4]==='completed',
 'subject QR link is revoked and a completed history entry is retained');
ok(db['退会履歴'][0][0]===memberId&&db['退会履歴'][0][1]==='一般メンバー'&&
 db['退会履歴'][0][5]===opId,'history stores original identity/name/audit ID, not LINE subject');
ok(auditEntries.length===1&&auditEntries[0][2]==='member.manage.withdraw.member',
 'one server audit event for the actual withdrawal');
ok(preserved===JSON.stringify(Object.fromEntries(
 ['出欠回答','集金記録','全体収支管理表','試合セッション'].map(k=>[k,db[k]]))),
 'historical attendance, cash, finance and match records remain byte-identical');
errorCode(()=>call(),'CONFLICT');
errorCode(()=>call({...payload,operationId:'42345678-1234-4123-8123-123456789abc'}),'NOT_FOUND');
ok(auditEntries.length===1,'repeat/destructive replay never runs twice');
// Simulate crash after processing history and member deactivation.
db['メンバー'].push([memberId,'一般メンバー',targetLine,true,false]);
db['退会履歴']=[];db['チーム所属']=[[ 'T-ROLE-DUTY',memberId,true ]];
db['登録申請']=[['REQ-2',targetLine,'一般メンバー','approved','','','',memberId]];
db['閲覧リンク'][0][3]='';
flushes=0;failAtFlush=1;
assert.throws(()=>call({...payload,operationId:'22345678-1234-4123-8123-123456789abc'}),
 /simulated flush failure/);n++;
ok(db['退会履歴'][0][4]==='processing'&&db['メンバー'][1][3]===false,
 'partial failure leaves processing marker and deactivates LINE access');
failAtFlush=-1;
errorCode(()=>call({...payload,operationId:'32345678-1234-4123-8123-123456789abc'}),'FORBIDDEN');
ok(db['退会履歴'][0][4]==='processing',
 'uncertain operation is never replayed or promoted automatically');
// UI/Worker syntax and gate review in addition to GAS execution tests.
ok(worker.includes("'/api/member/manage/withdraw-member':'member.manage.withdraw.member'"),
 'independent authenticated Worker route for real member withdrawal');
ok(worker.includes("env.WITHDRAW_MEMBER_ENABLED==='true'")&&
 worker.includes("env.WORKER_PURPOSE==='staging-member-withdraw-v1650'")&&
 worker.includes('env.WITHDRAW_STAGE_SPREADSHEET_ID===stageId'),
 'Worker requires 3 independent explicit staging gates');
ok(worker.includes("if(op==='member.manage.withdraw'){")&&
 gas.includes("if(op==='member.manage.withdraw')"),
 'legacy synthetic-only gated withdrawal remains unchanged');
ok(ui.includes('requireName:m.name')&&ui.includes('confirmMemberId:m.memberId')&&
 ui.includes('if(!first)return;')&&ui.includes('if(!second)return;'),
 'real UI uses two confirmations including name re-entry and fixed ID');
ok(ui.includes("'/api/member/manage/withdraw-member'")&&
 ui.includes("result?.status!=='withdrawn'")&&
 ui.includes("x.state==='completed'"),
 'post-action UI verifies completed archived status before success');
ok(html.includes('id="accessWithdrawConfirmNameV1650"')&&
 html.includes('live-access-v2.js?v=1650'),
 'typed-name modal is rendered with versioned script');
ok(dialogs.includes("'memberAccessDialog'")&&
 !dialogs.includes("'ledgerDialog'"),
 'original v15 ledger actions are not reparented into screen Close');
ok(css.includes('tr.carry-row')&&css.includes('#fff9e5')&&
 css.includes('min-width:1020px')&&css.includes('justify-content:flex-start'),
 'yellow carry, wide ledger and left-aligned buttons match supplied v15 image');
ok(finance.includes("actionButton('修正','btn-blue',r.kind==='practice'||future")&&
 finance.includes("actionButton('削除','btn-outline',future")&&
 finance.includes("actionButton('確定','btn-green',future"),
 'practice edit is disabled, not removed; full v15 action trio stays visible');
ok(finance.includes("const badge=document.createElement('button')")&&
 finance.includes("badge.textContent='確定済み';badge.disabled=true"),
 'confirmed row shows gray disabled v15 button');
console.log('PASS '+n+'/'+n+' original v15 finance and staging member withdrawal safety');
