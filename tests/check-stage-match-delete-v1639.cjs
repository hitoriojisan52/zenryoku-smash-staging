#!/usr/bin/env node
'use strict';
// v0.16.39 in-memory regression for the *actual* GAS match deletion helpers.
// Does not connect to or modify a live/staging Google spreadsheet.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const gas=read('gas-staging/コード.gs'),html=read('match.html'),js=read('match.js'),css=read('match.css'),worker=read('cloudflare-worker/worker.js');
let n=0;const ok=(value,msg)=>{assert.ok(value,msg);n++;};
const fails=(fn,code)=>{assert.throws(fn,e=>e?.smCode===code,code+' expected');n++;};
new Function(gas);new Function(js);n+=2;
const fail_=(code,msg)=>{const e=new Error(msg);e.smCode=code;throw e;};
const str_=v=>String(v??'').trim(),safeCell_=v=>/^[=+@]/.test(String(v))?"'"+v:String(v);
const id='P-TEST',other='P-OTHER',op='MATCH-DELETE-OP-001',member={memberId:'M-DUTY',role:'duty'};
const rows={
 '試合セッション':[
 [id,'RV-NEW',26,24,'2026-11-18 17:00:00'],
 [other,'RV-OTHER',4,4,'2026-11-18 17:00:00']],
 '試合版管理':[
 ['RV-OLD',id,'ready','z'.repeat(34500),'HASH-OLD','OP-OLD','2026-11-16',1,1],
 ['RV-NEW',id,'ready','{"sessionVersion":26}','HASH-NEW','OP-NEW','2026-11-18',1,1],
 ['RV-OTHER',other,'ready','{"sessionVersion":4}','HASH-OTHER','OP-OTHER','2026-11-18',1,1]],
 '試合操作履歴':[
 ['OP-OLD',id,'M-DUTY','create',1,'2026-11-16','RV-OLD'],
 ['OP-NEW',id,'M-DUTY','advance',26,'2026-11-18','RV-NEW'],
 ['OP-OTHER',other,'M-DUTY','create',4,'2026-11-18','RV-OTHER']],
 '閲覧リンク':[
 ['HASH-P-A',id,'2026-11-20T10:00:00Z','','M-DUTY','2026-11-18'],
 ['HASH-P-B',id,'2026-11-17T10:00:00Z','2026-11-17','M-DUTY','2026-11-16'],
 ['HASH-O',other,'2026-11-20T10:00:00Z','','M-DUTY','2026-11-18']],
 '試合削除アーカイブ':[],
 '操作履歴':[],
 '出欠回答':[[id,'TEST-P001','架空一郎','','member',true,'',0,'M-DUTY'],
            [other,'TEST-P002','架空二郎','','member',true,'',0,'M-DUTY']],
 '集金記録':[[id,'TEST-P001',true,1,'M-DUTY','2026-11-18']],
 '全体収支管理表':[['2026-11-18','会場',800,0,800,'','P-'+id,'practice',id,'open',1]]
};
let writeEvents=[],flushCount=0;
const sheet_=(_ss,name)=>{
 if(!rows[name])throw Error('Unknown sheet: '+name);
 const data=rows[name];
 return{
  getLastRow:()=>data.length+1,getMaxRows:()=>300,
  insertRowsAfter:(index,count)=>{ok(index===300&&count>0,'append grid capacity only');writeEvents.push('grow '+name)},
  getRange:(r,c,h=1,w=1)=>({
   getValues:()=>data.slice(r-2,r-2+h).map(row=>row.slice(c-1,c-1+w)),
   setValues:values=>{values.forEach((v,i)=>{let dest=data[r-2+i]||[];v.forEach((cell,j)=>dest[c-1+j]=cell);data[r-2+i]=dest;});writeEvents.push(name+'.setValues');},
   setValue:value=>{data[r-2]??=[];data[r-2][c-1]=value;writeEvents.push(name+'.setValue');}
  }),
  deleteRow:row=>{data.splice(row-2,1);writeEvents.push(name+'.deleteRow');},
  appendRow:values=>{data.push([...values]);writeEvents.push(name+'.appendRow');}
 };
};
const matchFindSession_=(_ss,p)=>{
 const selected=rows['試合セッション'].map((r,i)=>({...{row:i+2,revId:r[1]},id:r[0]})).filter(x=>x.id===p);
 if(selected.length>1)fail_('STORAGE_INCOMPLETE','duplicate session');
 return selected[0]||null;
};
const audit_=(_ss,id,type,actor,target,result)=>{
 rows['操作履歴'].push([id,type,actor.memberId,'now',target,JSON.stringify(result)]);
 writeEvents.push('操作履歴.append');
};
const now_=()=> '2026-11-18 17:01:00';
const SpreadsheetApp={flush:()=>{flushCount++;writeEvents.push('flush')}};
const a=gas.indexOf('var MATCH_DELETE_TABLES_=['),b=gas.indexOf('function matchApiDispatch_(',a);
ok(a>=0&&b>a,'match delete helper code extracted from actual GAS');
const handler=new Function('sheet_','matchFindSession_','fail_','str_','now_','safeCell_',
 'SpreadsheetApp','audit_',gas.slice(a,b)+
 '\nreturn {matchDeleteArchiveStatus_,matchDeletePlan_,matchDeleteExecute_};')(
 sheet_,matchFindSession_,fail_,str_,now_,safeCell_,SpreadsheetApp,audit_);
const originalMoney=JSON.stringify([rows['出欠回答'],rows['集金記録'],rows['全体収支管理表']]);
const plan=handler.matchDeletePlan_({},id);
ok(plan.counts['試合セッション']===1&&plan.counts['試合版管理']===2&&
 plan.counts['試合操作履歴']===2&&plan.counts['閲覧リンク失効']===1,
 'deletion identifies ONLY target practice: session/revisions/audit/active links');
ok(writeEvents.length===0,'preflight never changes any row');
fails(()=>handler.matchDeleteExecute_({},member,{practiceId:id,
 expectedSessionVersion:25,expectedSettingsVersion:24},{sessionVersion:26,settingsVersion:24},op),
 'VERSION_CONFLICT');
fails(()=>handler.matchDeleteExecute_({},member,{practiceId:id,
 expectedSessionVersion:26,expectedSettingsVersion:23},{sessionVersion:26,settingsVersion:24},op),
 'VERSION_CONFLICT');
ok(writeEvents.length===0,'stale session and settings versions make no writes');
const done=handler.matchDeleteExecute_({},member,{practiceId:id,expectedSessionVersion:26,
 expectedSettingsVersion:24},{sessionVersion:26,settingsVersion:24},op);
ok(done.data.deleted&&done.data.archived&&done.data.practiceId===id,
 'finished or running match deletion acknowledges data restoration archive');
ok(!rows['試合セッション'].some(r=>r[0]===id)&&rows['試合セッション'].length===1,
 'only target session removed, unrelated practice remains');
ok(rows['試合版管理'].length===1&&rows['試合版管理'][0][1]===other,
 'ALL matching revision rows removed, unrelated revisions remain');
ok(rows['試合操作履歴'].length===1&&rows['試合操作履歴'][0][1]===other,
 'ALL target match history removed, unrelated match history remains');
ok(rows['閲覧リンク'][0][3]==='2026-11-18 17:01:00'&&
 rows['閲覧リンク'][1][3]==='2026-11-17'&&rows['閲覧リンク'][2][3]==='',
 'only active target guest links revoked; old revocation and other practice unchanged');
ok(originalMoney===JSON.stringify([rows['出欠回答'],rows['集金記録'],rows['全体収支管理表']]),
 'never mutate participant, payment or financial ledger sheets');
const archived=rows['試合削除アーカイブ'];
ok(archived.length>=3&&archived[0][7]==='completed','long historic JSON split across multiple archived chunks');
ok(archived.every(r=>r[0]===op&&r[1]===id),'archive attributed to original operation and practice');
const original=JSON.parse(archived.map(r=>r[6]).join(''));
ok(original.targets['試合版管理'][0].cells[3].length===34500&&
 original.targets['試合操作履歴'].length===2&&original.links.length===1,
 'archive accurately reconstructs 34,500+ char revisions, actions, and guest-link state');
ok(flushCount===1&&writeEvents.indexOf('flush')>=0&&
 writeEvents.indexOf('flush')<writeEvents.indexOf('試合版管理.deleteRow')&&
 writeEvents.indexOf('flush')<writeEvents.indexOf('閲覧リンク.setValue'),
 'archive flushed before FIRST destructive change');
ok(writeEvents.lastIndexOf('試合セッション.deleteRow')<
 writeEvents.lastIndexOf('試合削除アーカイブ.setValue'),
 'active pointer deleted before archive marked completed');
ok(handler.matchDeleteArchiveStatus_({},id,op,member),
 'same authorized operation ID recognized after deletion for a lost HTTP response');
ok(!handler.matchDeleteArchiveStatus_({},id,'',member),
 'new match creation is allowed after a completed deletion');
fails(()=>handler.matchDeleteArchiveStatus_({},other,op,member),'CONFLICT');
fails(()=>handler.matchDeleteArchiveStatus_({},id,op,{memberId:'M-DIFFERENT'}),'CONFLICT');
// A partially completed deletion must never unlock roster editing or allow a new create.
rows['試合削除アーカイブ'].push(['OP-INCOMPLETE',other,now_(),'M-DUTY',1,1,'{}','prepared']);
fails(()=>handler.matchDeleteArchiveStatus_({},other,'',member),'STORAGE_INCOMPLETE');
fails(()=>handler.matchDeleteArchiveStatus_({},other,'OP-INCOMPLETE',member),'STORAGE_INCOMPLETE');
ok(rows['操作履歴'].some(r=>r[1]==='match.delete'),'general audit kept after match-specific history deletion');
const pLock=gas.indexOf('function participantMatchLocked_('),pEnd=gas.indexOf('function participantRows_(',pLock);
ok(pLock>=0&&pEnd>pLock,'participant editing lock body located');
const participantLock=new Function('matchDeleteArchiveStatus_','sheet_','str_',gas.slice(pLock,pEnd)+
 '\nreturn participantMatchLocked_;')(
 handler.matchDeleteArchiveStatus_,sheet_,str_);
ok(participantLock({},id)===false,'participant edits reopen immediately after delete');
fails(()=>participantLock({},other),'STORAGE_INCOMPLETE');
rows['試合削除アーカイブ'].pop();
ok(participantLock({},other)===true,'different practice match still locks its participants');
const dispatch=gas.slice(gas.indexOf('function matchApiDispatch_('),gas.indexOf('// ==================== StagingDiagnostics.gs',gas.indexOf('function matchApiDispatch_(')));
ok(dispatch.includes('requireDuty_(member)')&&dispatch.includes("if(op==='match.delete')"),
 'deleting requires existing registered duty/admin authorization');
ok(dispatch.includes("var replay=matchDeleteArchiveStatus_")&&
 dispatch.includes("if(replay)return matchView_"),'repeated operationId avoids second delete');
ok(dispatch.includes("applied:deleted||"),'operation lookup recognizes deleted match when active session is gone');
ok(worker.includes("'/api/match/delete':'match.delete'"),'Worker routes authenticated delete operation');
ok(html.includes('id="deleteMatch"')&&
 html.includes('match.js?v=1639'),'button and match frontend cache version present');
ok(js.includes("$('deleteMatch').disabled=!s"),'delete disabled when no table, available after finish');
ok(js.includes("title:'【対戦表の削除】'")&&js.includes("confirmLabel:'削除する',danger:true"),
 'destructive confirmation is mandatory');
ok(js.includes("expectedSessionVersion:current.sessionVersion")&&
 js.includes("expectedSettingsVersion:current.settingsVersion"),'frontend sends both source versions');
ok(js.includes("S.view=next;S.drafts.delete(practiceId);")&&js.includes("if(next?.practiceId!==practiceId||next?.session)"),
 'UI verifies table absent and resets local draft before allowing regeneration');
ok(css.includes('.match-delete-row #deleteMatch')&&css.includes('min-height:44px'),
 'separate red mobile-safe delete action');
console.log('PASS '+n+'/'+n+' match deletion, archive, version, idempotency, guest and attendance safety');
