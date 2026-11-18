#!/usr/bin/env node
'use strict';
// v0.16.39a: exercise actual GAS MatchEngine.create + matchApiDispatch on
// 2026-11-21-like 0/1/3/4-member synthetic rosters. Never call Google APIs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const gas=read('gas-staging/コード.gs'),js=read('match.js'),html=read('match.html'),
 css=read('match.css'),confirm=read('match-confirm.js'),worker=read('cloudflare-worker/worker.js');
let n=0;const ok=(x,msg)=>{assert.ok(x,msg);n++;};
const fail_=(code,msg)=>{const e=new Error(msg);e.smCode=code;throw e};
function reject(f,code,part){assert.throws(f,e=>e.smCode===code&&e.message.includes(part),code+' '+part);n++}
new Function(gas);new Function(js);new Function(confirm);n+=3;
const e=gas.indexOf('// ==================== Code.gs');
ok(e>15000,'real MatchEngine module is present before GAS');
const sandbox={};vm.runInNewContext(gas.slice(0,e),sandbox);
const SMMatchCore=sandbox.SMMatchCore;
ok(typeof SMMatchCore?.create==='function'&&typeof SMMatchCore.numbered==='function',
 'actual bundled match model loaded, not a mock');
const a=gas.indexOf('function matchApiDispatch_('),z=gas.indexOf('// ==================== StagingDiagnostics.gs',a);
ok(a>0&&z>a,'dispatch located in real GAS module');
const member={memberId:'M-TEST-DUTY',role:'duty'},id='PR-20261121';
let participants=[],writes=[],current=null;
const roster=p=>p.map((x,i)=>({participationId:'PART-'+String(i+1).padStart(3,'0'),
 name:x,attending:true,nameKana:x,category:'member'}));
const dispatch=new Function('str_','practices_','matchView_','matchText_','requireDuty_','checkOpId_',
 'withLock_','matchDeleteArchiveStatus_','matchLoad_','matchRoster_','matchCreationFingerprint_',
 'fail_','SMMatchCore','matchCommit_',gas.slice(a,z)+'\nreturn matchApiDispatch_;')(
 x=>String(x??'').trim(),
 ()=>[{practiceId:id,date:'2026-11-21',place:'曽谷公民館'}],
 ()=>({ok:true,data:{practiceId:id,session:current}}),
 ()=>'',m=>{if(!['admin','duty'].includes(m.role))fail_('FORBIDDEN','権限がありません')},
 p=>{if(!p.operationId)fail_('BAD_REQUEST','操作ID');return p.operationId},
 callback=>callback(),()=>false,()=>current,()=>participants,
 p=>JSON.stringify(Object.keys(p).sort()),
 fail_,SMMatchCore,(_ss,practiceId,state,opId,m,action)=>{
  writes.push({practiceId,state,opId,action});current=state;
 }
);
const run=(data={})=>dispatch({},member,'match.create',{practiceId:id,operationId:'OP-TEST-CREATE-0001',...data});
reject(()=>run(),'NO_FEASIBLE_MATCH','参加者はまだ登録されていません');
ok(writes.length===0,'no attendance never creates a match revision');
participants=roster(['一郎']);
reject(()=>run(),'NO_FEASIBLE_MATCH','現在1名');
participants=roster(['一郎','二郎','三郎']);
reject(()=>run(),'NO_FEASIBLE_MATCH','現在3名');
ok(writes.length===0,'under-four attendance never alters match sheets');
participants=roster(['一郎','二郎','三郎','四郎']);
reject(()=>run({excludedIds:['PART-004']}),'NO_FEASIBLE_MATCH','除外');
ok(writes.length===0,'unsatisfiable excluded players do not write a revision');
reject(()=>run({enabledCourts:[10]}),'INVALID_COURTS','コートは1～4');
ok(writes.length===0,'invalid court configuration makes no sheet writes');
const good=run();
ok(good.ok&&writes.length===1,'four attending players can create table');
ok(writes[0].state.rounds.length>0&&writes[0].state.sessionState==='ready',
 'actual MatchEngine creates at least one doubles round');
ok(writes[0].practiceId===id,'creation targets the requested date, not previous practice');
const expected=sandbox.SMMatchCore;
let typedError;
try{expected.create({practiceId:id,people:[],enabledCourts:[1],lookaheadCount:1});}
catch(e){typedError=e}
ok(typedError?.code==='NO_FEASIBLE_MATCH'&&typedError.smCode===undefined,
 'root cause proven: domain errors use code, GAS doPost recognizes only smCode');
ok(gas.includes("if(err&&err.code==='NO_FEASIBLE_MATCH')")&&
 gas.includes("fail_('NO_FEASIBLE_MATCH'"),'expected domain error translated into human-readable GAS error');
const post=gas.slice(gas.indexOf('function doPost('),gas.indexOf('function setupNewSystem()',gas.indexOf('function doPost(')));
ok(post.includes("err.smCode||'INTERNAL'"),'known GAS business errors avoid generic INTERNAL response');
ok(worker.includes("result.code==='UNAUTHORIZED'?401:400"),
 'Worker forwards custom NO_FEASIBLE_MATCH business error as 400, not 500');
const controls=html.slice(html.indexOf('<div id="matchControls"'),html.indexOf('</main>'));
const fixed=controls.indexOf('id="participantSettings"'),deleteAt=controls.indexOf('id="deleteMatch"');
ok(fixed>=0&&deleteAt>fixed&&deleteAt<controls.indexOf('</details>',fixed),
 'delete button lives INSIDE participant and fixed pair settings accordion');
ok(!controls.slice(0,fixed).includes('id="deleteMatch"'),
 'delete button removed from top level of match progression controls');
ok(controls.includes('id="courtSettings"')&&controls.includes('id="participantSettings"'),
 'court and participant settings remain separately expandable');
ok(html.includes('match.js?v=1639b')&&html.includes('match.css?v=1639b'),
 'JS/CSS cache-busting for LIFF remains consistent');
ok(js.includes("main.disabled=(v.participants||[]).length<4"),
 'client disables generation when fewer than four registered players');
ok(js.includes("count===0")&&js.includes('4名以上の参加登録後に対戦表'),
 'client guides user to register missing attendees instead of attempting save');
ok(js.includes("$('deleteMatch').disabled=!s"),
 'delete action still available for created/finished match and not for missing match');
ok(js.includes("title:'【対戦表の削除】'")&&js.includes("confirmLabel:'削除する',danger:true"),
 'delete retains explicit destructive confirmation');
ok(css.includes('.match-delete-row #deleteMatch')&&css.includes('min-height:44px'),
 'moved button retains red color and safe mobile tap target');
// Confirm and error visuals were intentionally distinct since v0.13.
ok(confirm.includes("root().classList.toggle('match-modal-is-error', isError)"),
 'confirm/error modal styles are deliberately selected by state');
ok(confirm.includes("isError ? 'alertdialog' : 'dialog'"),
 'error uses alertdialog semantics, confirmation uses dialog');
ok(confirm.includes('cancelBtn().hidden = isError'),
 'confirmation has cancel+confirm; errors have acknowledgement only');
ok(css.includes('.match-modal-is-error .match-modal-msg strong{color:#b71c1c}')&&
 css.includes('.match-modal-is-error .match-modal-box{border-top:4px solid #c62828}'),
 'error title red and upper red border are intentional existing UI specification');
console.log('PASS '+n+'/'+n+' known match roster error, creation safety, delete placement and intentional modal styles');
