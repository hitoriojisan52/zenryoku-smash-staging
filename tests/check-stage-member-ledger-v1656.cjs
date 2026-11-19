#!/usr/bin/env node
'use strict';
/* v0.16.56 regression. Execute real GAS admin-edit handler under in-memory
 * Sheets/Lock/audit and real LIVE ledger renderer with a minimal DOM model.
 * No external calls or test-data mutation.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const gas=read('gas-staging/AccessAndGuestV160.gs');
const ui=read('live.js'),memberUI=read('live-access-v2.js');
const worker=read('cloudflare-worker/worker.js'),css=read('live-access-v2.css');
const html=read('live.html'),sharedCss=read('stage-ui.css');
let n=0;const ok=(v,s)=>{assert.ok(v,s);n++};
const rejects=(fn,code,s)=>{assert.throws(fn,e=>e.code===code,s);n++};
new Function(gas);new Function(ui);new Function(memberUI);
new Function(worker.replace('export async function handleRequest','async function handleRequest').replace('export default {fetch:handleRequest};',''));n+=4;
const MID='M-TEST-MEMBER-56',ADMIN='M-TEST-ADMIN-56';
const LINE='U'+'b'.repeat(32),ADMIN_LINE='U'+'a'.repeat(32);
const spreadsheetId='1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac';
const DB={
 'メンバー':[[ADMIN,'既存管理者',ADMIN_LINE,true,true],[MID,'修正前の氏名',LINE,true,false]],
 '登録申請':[['REQ-56',LINE,'修正前の氏名','approved','2026-11-01T10:00:00Z',
               ADMIN,'2026-11-01T11:00:00Z',MID]],
 '当番チーム':[['T-ROLE-DUTY','当番担当',true]],
 'チーム所属':[],
 '退会履歴':[['M-OLD','過去退会者','2026-11-01T00:00:00Z',ADMIN,'completed','OP-OLD']],
 '出欠回答':[['PR-OLD',MID,'修正前の氏名','', 'member',true,'過去の表示名は維持',1,ADMIN]],
 '集金記録':[['PR-OLD',MID,true,1,ADMIN,'2026-11-01T00:00:00Z']],
 '全体収支管理表':[['R-OLD','2026-11-01',0,0,0]],
 '試合操作履歴':[['OP-OLD',MID,'2026-11-01T00:00:00Z']],
 '操作履歴':[['OLD-PAYMENT','payment.set',ADMIN,'2026-11-01T00:00:00Z',MID,'{}']]
};
const preserved=['退会履歴','出欠回答','集金記録','全体収支管理表','試合操作履歴'];
const baseline=Object.fromEntries(preserved.map(k=>[k,JSON.stringify(DB[k])]));
let writes=0;
const str_=v=>String(v??'').trim(),norm_=v=>String(v??'').normalize('NFKC').replace(/[\s\u00a0\u3000]+/g,''),bool_=v=>v===true||v==='TRUE';
const fail_=(code,msg)=>{const e=new Error(msg);e.code=code;throw e;};
const safeCell_=v=>String(v);
const sheetRows_=(_ss,name)=>DB[name].map(r=>[...r]);
const sheets=Object.fromEntries(Object.keys(DB).map(name=>[name,{
 name,getLastRow:()=>DB[name].length+1,
 getRange(row,col){
  return {setValue(v){DB[name][row-2][col-1]=v;writes++;},
    setValues(v){for(let j=0;j<v[0].length;j++)DB[name][row-2][col-1+j]=v[0][j];writes++;}};
 },
 appendRow(v){DB[name].push([...v]);writes++;},
 deleteRow(i){DB[name].splice(i-2,1);writes++;}
}]));
const accessSheet16_=(_ss,name)=>{if(!sheets[name])throw Error('unknown '+name);return sheets[name];};
const accessRows16_=(sheet,width)=>DB[sheet.name].map(r=>r.slice(0,width));
const sheet_=accessSheet16_;
const withLock_=fn=>fn();
const accessAdmin16_=actor=>{if(actor.role!=='admin')fail_('FORBIDDEN','admin');};
const auditExisting_=(_ss,id)=>DB['操作履歴'].find(r=>r[0]===id)?{ok:true,data:{cached:true}}:null;
const audit_=(_ss,id,op,actor,target,result)=>{
 DB['操作履歴'].push([id,op,actor.memberId,'2026-11-19T09:00:00Z',target,JSON.stringify(result)]);writes++;
};
const checkOpId_=data=>data.operationId;
const SMA16={registrations:'登録申請',regHeader:[]};
const accessRole16_=m=>m[4]?'admin':'member';
const accessHistoryForManagerV1623_=()=>[];
const actor={role:'admin',memberId:ADMIN};
const ss={getId:()=>spreadsheetId};
const constants={SMA_STAGE_WITHDRAW_PURPOSE_V1636:'staging-member-withdraw-v1653',
 SMA_STAGE_WITHDRAW_ID_V1636:spreadsheetId};
const names=['accessAdmin16_','accessStageWithdrawalV1636_','accessWithdrawCheckV1627_',
 'accessSheet16_','sheetRows_','accessRows16_','accessHistoryForManagerV1623_',
 'accessRole16_','str_','norm_','bool_','conf_','withLock_','checkOpId_',
 'auditExisting_','sheet_','safeCell_','fail_','audit_','SMA16',
 'SMA_STAGE_WITHDRAW_PURPOSE_V1636','SMA_STAGE_WITHDRAW_ID_V1636'];
const values=[accessAdmin16_,()=>{throw Error('withdraw called');},
 ()=>{throw Error('check called');},accessSheet16_,sheetRows_,accessRows16_,
 accessHistoryForManagerV1623_,accessRole16_,str_,norm_,bool_,
 k=>({WITHDRAW_ENABLED:'true',STAGING_WITHDRAW_PURPOSE:'staging-member-withdraw-v1653',
   SPREADSHEET_ID:spreadsheetId}[k]||''),withLock_,checkOpId_,
 auditExisting_,sheet_,safeCell_,fail_,audit_,SMA16,...Object.values(constants)];
const start=gas.indexOf('function accessManagement16_(');
const end=gas.indexOf('function accessShareIssue16_(',start);
ok(start>=0&&end>start,'real GAS manager isolated');
const manage=new Function(...names,gas.slice(start,end)+'\nreturn accessManagement16_;')(...values);
const put=(memberId,displayName,expectedName,operationId='11111111-1111-4111-8111-111111111111',
  by=actor)=>manage(ss,by,'member.manage.edit',{memberId,displayName,expectedName,operationId});
rejects(()=>put(MID,'変更','修正前の氏名','A',{role:'member',memberId:MID}),
 'FORBIDDEN','non-admin cannot edit user registrations');
rejects(()=>put(MID,'変更','誤った旧名'),'CONFLICT','stale name prevents lost updates');
rejects(()=>put(MID,'\n','修正前の氏名'),'BAD_REQUEST','empty/whitespace name rejected');
rejects(()=>put(MID,'<script>','修正前の氏名'),'BAD_REQUEST','HTML-like input rejected');
rejects(()=>put('M-INVALID','変更','修正前の氏名'),'NOT_FOUND','missing member rejected');
ok(writes===0,'invalid edits make no sheet writes');
const success=put(MID,'新しい氏名','修正前の氏名');
ok(success.ok&&success.data.displayName==='新しい氏名'&&success.data.registrationUpdated,
 'approved application update reports both sources updated');
ok(DB['メンバー'][1][1]==='新しい氏名'&&DB['登録申請'][0][2]==='新しい氏名',
 'real GAS synchronizes member master and unique approved registration');
ok(DB['メンバー'][1][0]===MID&&DB['メンバー'][1][2]===LINE&&
 DB['登録申請'][0][7]===MID&&DB['登録申請'][0][1]===LINE,
 'member ID, LINE subject and approved request remain unchanged');
for(const name of preserved)ok(JSON.stringify(DB[name])===baseline[name],
 name+' immutable historical contents retained');
ok(DB['操作履歴'].length===2&&DB['操作履歴'][1][1]==='member.manage.edit',
 'audit log appended without rewriting previous operation');
rejects(()=>put(MID,'二度目','修正前の氏名','22222222-2222-4222-8222-222222222222'),
 'CONFLICT','stale second edit rejected');
const afterEditWrites=writes;
DB['登録申請'].push(['REQ-DUP',LINE,'新しい氏名','approved','2026-11-02','', '',MID]);
rejects(()=>put(MID,'不整合','新しい氏名','33333333-3333-4333-8333-333333333333'),
 'CONFLICT','duplicate linked approvals block partial mutation');
ok(writes===afterEditWrites,'registration conflict makes no writes');
DB['登録申請'].pop();
const listed=manage(ss,actor,'member.manage.list',{});
ok(listed.ok&&listed.data.members.find(m=>m.memberId===MID).name==='新しい氏名',
 'refresh shows saved member name to manager');
DB['登録申請'].splice(0);
const adminName=put(ADMIN,'管理者の新氏名','既存管理者',
 '44444444-4444-4444-8444-444444444444');
ok(adminName.ok&&adminName.data.registrationUpdated===false&&
 DB['メンバー'][0][1]==='管理者の新氏名'&&DB['登録申請'].length===0,
 'seed admin without application is updated in master only; no fake request inserted');
// Real ledger DOM renderer tests: status-specific BUTTON COUNTS, not just strings.
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.disabled=false;
  this.className='';this.classList={items:[],add:x=>this.classList.items.push(x)};
  this.handlers={};this.value='';}
 append(...els){this.children.push(...els)}
 replaceChildren(...els){this.children=[...els]}
 addEventListener(event,handler){this.handlers[event]=handler}
}
const nodes={ledgerMonth:new Element('input'),ledgerBody:new Element('tbody'),
 ledgerTotal:new Element('div'),nextMonth:new Element('button')};
nodes.ledgerMonth.value='2026-11';
const rows=[
 {rowId:'P-OPEN',date:'2026-11-10',label:'通常練習',kind:'practice',status:'open',
  canConfirm:false,version:1,income:0,expense:0,balance:10},
 {rowId:'R-OPEN',date:'2026-11-11',label:'立替精算',kind:'reimbursement',status:'open',
  canConfirm:true,version:1,income:0,expense:5,balance:5},
 {rowId:'R-CLOSED',date:'2026-11-12',label:'確定済み',kind:'reimbursement',status:'confirmed',
  canConfirm:false,version:2,income:0,expense:0,balance:5},
 {rowId:'P-FUTURE',date:'2026-12-12',label:'未来練習',kind:'practice',status:'open',
  canConfirm:false,version:1,income:0,expense:0,balance:5},
];
const ledger={carried:20,rows,maxMonth:'2026-12',closingBalance:5};
const $=id=>nodes[id],S={actor:{role:'duty'},ledger:null};
const lStart=ui.indexOf('async function loadLedger(){'),
 lEnd=ui.indexOf('function ledgerAction(',lStart);
ok(lStart>=0&&lEnd>lStart,'actual ledger renderer isolated');
const renderLedger=new Function('$','call','S','document','today','window','yen','ledgerAction',
 ui.slice(lStart,lEnd)+'\nreturn loadLedger;')(
 $,async()=>ledger,S,{createElement:tag=>new Element(tag)},()=> '2026-11-19',
 {SMDate:{date:v=>v}},v=>String(v),()=>{});
const cells=row=>nodes.ledgerBody.children[row].children[6].children[0].children;
const labels=row=>cells(row).map(x=>x.textContent);
(async()=>{
 await renderLedger();
 ok(nodes.ledgerBody.children.length===5,'carry plus all practice/reimbursement rows rendered');
 ok(labels(1).join(',')==='修正,削除,確定'&&
   cells(1)[0].disabled&&cells(1)[2].disabled,
   'unconfirmed practice keeps disabled edit/confirm without hiding three slots');
 ok(labels(2).join(',')==='修正,削除,確定'&&
  cells(2)[1].className==='btn-danger'&&!cells(2)[2].disabled,
  'open reimbursement shows red Delete and enabled earliest Confirm');
 ok(labels(3).join(',')==='確定済み'&&
  cells(3)[0].disabled&&cells(3).length===1,
  'duty confirmed row shows only disabled Confirmed');
 ok(labels(4).join(',')==='修正,削除,確定'&&
  cells(4).every(b=>b.disabled),
  'future open row retains three disabled action slots');
 S.actor.role='admin';await renderLedger();
 ok(labels(3).join(',')==='確定解除'&&
  !cells(3)[0].disabled&&cells(3).length===1,
  'admin confirmed row shows only enabled Unlock, no Edit/Delete');
 ok(labels(2).join(',')==='修正,削除,確定',
  'after unlocking, regular row action shape is maintained');
 ok(sharedCss.includes('justify-content:flex-start')&&
  sharedCss.includes('tr.carry-row'),'v15 yellow carry and left operation alignment kept');
 ok(memberUI.includes("title:'【退会確認】'")&&
  !memberUI.includes('【退会確認（1/2）】')&&!memberUI.includes('【退会確認（2/2）】'),
  'withdrawal uses a single short red in-app confirmation');
 ok(memberUI.includes("frame.head.append(select)")&&
  memberUI.includes("frame.actions.append(edit,change,withdraw)"),
  'member role upper-right with three right-side buttons');
 ok(css.includes('.access-history-line .live-access-name')&&
  css.includes('.access-history-date')&&
  memberUI.includes("String(formatted).split(' ')[0]"),
  'withdrawal history has one line with left name and right date only');
 ok(html.includes('id="memberAccessEditFormV1656"')&&
  html.includes('id="memberAccessEditNameV1656"')&&
  !html.includes('id="memberAccessEditCloseV1656"'),
  'minimal editable-name dialog without redundant top-right Close');
 ok(worker.includes("'/api/member/manage/edit':'member.manage.edit'")&&
  worker.includes("version:'0.16.65-stage-receipt'"),
  'authenticated gateway routes name mutation with health revision');
 console.log('PASS '+n+'/'+n+' member name edit, immutable histories and role-specific ledger controls');
})().catch(e=>{console.error(e);process.exitCode=1});
