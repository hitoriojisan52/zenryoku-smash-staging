#!/usr/bin/env node
'use strict';
/* v0.16.80: isolated, in-memory GAS role changes. No real LINE tokens, Sheets
 * writes or Cloudflare requests; exercises actual GAS function source. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const access=read('gas-staging/AccessAndGuestV160.gs'),gas=read('gas-staging/コード.gs'),
 worker=read('cloudflare-worker/worker.js'),live=read('live.js'),
 html=read('live.html'),js=read('stage-role-preview.js'),css=read('stage-ui.css');
let n=0;function ok(v,msg){assert.ok(v,msg);n++}
for(const s of [access,gas,worker,live,js]){new Function(s);n++;}
const begin=access.indexOf('var SMA_STAGE_ROLE_OWNER_V1680=');
const end=access.indexOf('function accessShareIssue16_',begin);
ok(begin>0&&end>begin,'extract real staging self-role GAS function');
const rows={
 'メンバー':[
  ['M-REAL','本人','U'+'a'.repeat(32),true,true,''],
  ['M-TEST-MEMBER-V1656-001','架空利用者修正1657','U'+'b'.repeat(32),true,true,''],
  ['M-OTHER','他のメンバー','U'+'c'.repeat(32),true,false,'']
 ],
 '当番チーム':[['T-ROLE-DUTY','担当',true]],
 'チーム所属':[['T-ROLE-DUTY','M-REAL',false]]
};
const props={};let audit=[],edgeEnabled=true;
const roleOf=id=>{
 const row=rows['メンバー'].find(x=>x[0]===id);
 if(!row||!row[3])throw Error('missing actor');
 return row[4]?'admin':
  rows['チーム所属'].some(x=>x[1]===id&&x[2]===true)?'duty':'member';
};
function fail_(code,message){const e=Error(message);e.code=code;throw e;}
function sheetRows_(ss,name){return rows[name];}
function sheet_(ss,name){return {
 getRange(row,col){return {setValue(value){rows[name][row-2][col-1]=value;}}},
 appendRow(value){rows[name].push(value)}
};}
const me=id=>{const actor=rows['メンバー'].find(x=>x[2]===id&&x[3]);if(!actor)fail_('UNAUTHORIZED','no actor');
 return {memberId:actor[0],role:roleOf(actor[0])};};
const ss={};
const impl=new Function('accessStageBindingV1636_','conf_','SMA_STAGE_WITHDRAW_PURPOSE_V1636',
 'PropertiesService','sheetRows_','member_','fail_','checkOpId_','withLock_',
 'auditExisting_','sheet_','audit_','SMA16','str_','bool_',access.slice(begin,end)+
 '\nreturn accessStageSelfRoleV1680_;')(
 ()=>{},key=>key==='WITHDRAW_ENABLED'?(edgeEnabled?'true':'false'):key==='STAGING_WITHDRAW_PURPOSE'?
 'staging-member-withdraw-v1653':'','staging-member-withdraw-v1653',
 {getScriptProperties:()=>({getProperty:k=>props[k]||'',setProperty:(k,v)=>{props[k]=v}})},
 sheetRows_,(_ss,id)=>me(id),fail_,payload=>{if(!/^OP-[A-Z0-9-]{8,100}$/.test(payload.operationId||''))fail_('BAD_REQUEST','op id');return payload.operationId},
 fn=>fn(),(_ss,id,op,m)=>audit.find(x=>x.id===id&&x.op===op&&x.actor===m.memberId)?.result||null,
 sheet_,(_ss,id,op,m,target,result)=>audit.push({id,op,actor:m.memberId,target,result}),
 {teamId:'T-ROLE-DUTY'},x=>String(x??'').trim(),x=>x===true||x==='TRUE');
const ids={real:rows['メンバー'][0][2],fake:rows['メンバー'][1][2],other:rows['メンバー'][2][2]};
const call=(identity,request)=>impl(ss,me(identity),identity,request);
const op=i=>'OP-SWITCH-'+String(i).padStart(8,'0');
function expectError(fn,code){let actual;try{fn();}catch(e){actual=e.code}ok(actual===code,'expected '+code+' but got '+actual);}
let status=call(ids.real,{action:'status'});
ok(status.data.role==='admin'&&status.data.canSwitch&&!status.data.canRestore&&status.data.canDemote,
 'first enrollment only when actual admin and separate backup exists');
expectError(()=>call(ids.other,{action:'change',role:'admin',expectedRole:'member',operationId:op(1)}),'FORBIDDEN');
expectError(()=>call(ids.fake,{action:'change',role:'member',expectedRole:'admin',operationId:op(2)}),'FORBIDDEN');
expectError(()=>call(ids.real,{action:'change',role:'member',expectedRole:'member',operationId:op(3)}),'VERSION_CONFLICT');
let result=call(ids.real,{action:'change',role:'member',expectedRole:'admin',operationId:op(4)});
ok(result.ok&&result.data.role==='member'&&roleOf('M-REAL')==='member',
 'authorized first administrator demotes themself to member');
ok(props.STAGE_SELF_ROLE_OWNER_MEMBER_V1680==='M-REAL'&&
 rows['メンバー'][1][4]===true&&roleOf(rows['メンバー'][1][0])==='admin',
 'one-time owner persisted and synthetic backup administrator unchanged');
ok(call(ids.real,{action:'status'}).data.canRestore===true&&
 call(ids.real,{action:'status'}).data.canSwitch===true,
 'same authenticated member can recover after their demotion');
expectError(()=>call(ids.other,{action:'change',role:'admin',expectedRole:'member',operationId:op(5)}),'FORBIDDEN');
result=call(ids.real,{action:'change',role:'admin',expectedRole:'member',operationId:op(6)});
ok(result.data.role==='admin'&&roleOf('M-REAL')==='admin','enrolled member can restore admin');
result=call(ids.real,{action:'change',role:'duty',expectedRole:'admin',operationId:op(7)});
ok(result.data.role==='duty'&&roleOf('M-REAL')==='duty','admin to duty restores duty membership');
result=call(ids.real,{action:'change',role:'member',expectedRole:'duty',operationId:op(8)});
ok(result.data.role==='member'&&roleOf('M-REAL')==='member',
 'duty to member deactivates team memberships');
result=call(ids.real,{action:'change',role:'admin',expectedRole:'member',operationId:op(9)});
ok(result.data.role==='admin','member to admin recovery still available');
const replay=call(ids.real,{action:'change',role:'admin',expectedRole:'member',operationId:op(9)});
ok(replay.data.role==='admin'&&audit.length===5,'operation ID replay never performs duplicate writes');
rows['メンバー'][1][4]=false;
expectError(()=>call(ids.real,{action:'change',role:'member',expectedRole:'admin',operationId:op(10)}),'FORBIDDEN');
ok(roleOf('M-REAL')==='admin','server protects last administrator when backup is inactive');
rows['メンバー'][1][4]=true;
edgeEnabled=false;
expectError(()=>call(ids.real,{action:'status'}),'STAGING_ONLY');
edgeEnabled=true;
ok(worker.includes("env.FRONTEND_ORIGIN!=='https://hitoriojisan52.github.io'")&&
 worker.includes("env.LINE_LOGIN_CHANNEL_ID!=='2012602642'")&&
 worker.includes("if(!withdrawAtEdge")&&worker.includes("'/api/stage/self-role':'stage.selfRole'"),
 'Worker requires exact staging environment + LINE channel + existing purpose');
ok(gas.indexOf("op==='stage.selfRole'")<gas.indexOf("op.indexOf('member.manage.')"),
 'stage recovery request routes before admin-only management and duty-only logic');
ok(html.indexOf('id="stageRolePreviewOpen"')<html.indexOf('id="reimbursementBtn"')&&
 !html.includes('id="stageRolePreviewMenuOpen"'),'top-only self switch is left of reimbursement');
ok(html.includes('id="stageRolePreviewConfirmDialog"')&&
 js.includes("await api('/api/session')")&&js.includes('w.location.reload()')&&
 js.includes('w.SMStageUX.run'),'self switch has confirmation, write lock, session verification and fresh UI');
ok(live.includes("if(S.actor.role==='member'){")&&
 live.includes("if(control.id!=='stageRolePreviewOpen')control.disabled=true")&&
 live.includes("if(VISITOR_MODE){"),
 'management member is locked but separate member attendance entry remains');
ok(css.includes('content:"⚠️"')&&
 html.includes('id="stageErrorMessage" class="stage-system-message stage-system-message--error"'),
 'yellow warning uses emoji and error dialog uses red error style');
console.log('PASS '+n+'/'+n+' real staging self-role backend, recovery, backup-admin gate and UI boundary');
