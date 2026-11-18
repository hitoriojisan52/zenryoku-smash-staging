#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const gas=read('gas-staging/コード.gs'),ui=read('live.js'),html=read('live.html'),worker=read('cloudflare-worker/worker.js');
let n=0;const ok=(condition,message)=>{assert.ok(condition,message);n++};
function fails(fn,code){assert.throws(fn,e=>!!e&&e.smCode===code,code+' expected');n++;}
new Function(gas);new Function(ui);n+=2;
const start=gas.indexOf('/* v0.16.38a:'),end=gas.indexOf('function overview_(',start);
ok(start>=0&&end>start,'new schedule module must be present in GAS');
const text=gas.slice(start,end);
const str_=v=>String(v??'').trim(),fail_=(code,message)=>{const e=new Error(message);e.smCode=code;throw e};
const today_=()=> '2026-11-18', bool_=v=>v===true||v==='TRUE'||v==='true';
const iso_=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 !Number.isNaN(new Date(s+'T00:00:00Z').getTime())&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const ledgerDate_=v=>Object.prototype.toString.call(v)==='[object Date]'?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(v):str_(v);
const safeCell_=v=>/^[=+@]/.test(String(v))?"'"+v:String(v);
const expectVersion_=(v,exp)=>{if(v!==Number(exp))fail_('CONFLICT','stale version');};
let scheduleRows=[
 ['TEST-20261116',new Date('2026-11-15T15:00:00Z'),'検証用体育館','19:00','21:00',2,true,'',0]
];
let writes=[],referenceMap={};
const sheet={
 appendRow(r){scheduleRows.push([...r]);writes.push('schedule.append');},
 deleteRow(n){scheduleRows.splice(n-2,1);writes.push('schedule.delete');},
 getRange(row,col,height,width){
  return {setValues(rows){
   ok(col===1&&height===1&&width===9,'schedule writes exactly nine cells in one row');
   scheduleRows[row-2]=[...rows[0]];writes.push('schedule.update');
  }};
 }
};
const sheetRows_=(ss,name)=>{
 if(name==='練習日程')return scheduleRows.map(r=>[...r]);
 return (referenceMap[name]||[]).map(r=>[...r]);
};
const sheet_=(ss,name)=>{if(name!=='練習日程')throw new Error('Unexpected sheet write');return sheet;};
let matchReferences=[];
const ss={
 getSheetByName(name){
  if(name==='試合セッション')return {
   getLastRow:()=>matchReferences.length+1,
   getRange:(row,col,height,width)=>({getValues:()=>{
    ok(row===2&&col===1&&height===matchReferences.length&&width===1,
      'match practice references read from the real A-column layout');
    return matchReferences.map(x=>[x]);
   }})
  };
  return null;
 }
};
const Utilities={formatDate(d,tz,fmt){
 ok(tz==='Asia/Tokyo'&&fmt==='HH:mm','time canonicalization uses JST');
 return '09:00';
}};
const funcs=new Function('str_','fail_','today_','bool_','iso_','ledgerDate_','safeCell_','expectVersion_',
 'sheetRows_','sheet_','Utilities',text+'\nreturn {scheduleList_,scheduleChange_,scheduleRows_,scheduleData_};')(
 str_,fail_,today_,bool_,iso_,ledgerDate_,safeCell_,expectVersion_,sheetRows_,sheet_,Utilities
);
const member={role:'admin'},list=()=>funcs.scheduleList_(ss,member,{}).data.schedules;
ok(list().length===0,'legacy master lists only today or later');
const add=(id,date,overrides={})=>funcs.scheduleChange_(ss,member,{
 action:'add',practiceId:id,date,place:'曽谷公民館',startTime:'9:00',endTime:'13:00',hours:4,
 remark:'',...overrides
}).data;
const id='PR-test-create-00000001';
const first=add(id,'2026/11/22',{remark:'練習確認'});
ok(first.version===1&&first.action==='add'&&first.practiceId===id,'fixed-id addition returns version');
ok(scheduleRows.length===2&&scheduleRows[1][6]===false,'new practice is not public before confirmation');
ok(list()[0].date==='2026-11-22'&&list()[0].remark==='練習確認','list shows nonconfirmed practice and remark');
fails(()=>add(id,'2026-11-23'),'BAD_REQUEST');
fails(()=>add('PR-test-create-00000002','2026-11-22'),'CONFLICT');
fails(()=>add('PR-test-create-00000002','2026-11-17'),'BAD_REQUEST');
fails(()=>add('PR-test-create-00000002','2026-11-24',{hours:3}),'BAD_REQUEST');
fails(()=>add('PR-test-create-00000002','2026-11-24',{startTime:'25:00'}),'BAD_REQUEST');
fails(()=>add('PR-test-create-00000002','2026-11-24',{place:''}),'BAD_REQUEST');
const edited=funcs.scheduleChange_(ss,member,{
 action:'edit',practiceId:id,expectedVersion:1,date:'2026-11-23',
 place:'北方小学校',startTime:'17:00',endTime:'19:00',hours:2,remark:'候補日'
}).data;
ok(edited.version===2&&list()[0].date==='2026-11-23'&&list()[0].hours===2,
 'edit keeps fixed ID and increments version');
fails(()=>funcs.scheduleChange_(ss,member,{action:'delete',practiceId:id,expectedVersion:1}),'CONFLICT');
referenceMap['出欠回答']=[[id,'person-1',null,null,null,false]];
fails(()=>funcs.scheduleChange_(ss,member,{action:'delete',practiceId:id,expectedVersion:2}),'CONFLICT');
fails(()=>funcs.scheduleChange_(ss,member,{action:'edit',practiceId:id,expectedVersion:2,
 date:'2026-11-24',place:'曽谷公民館',startTime:'09:00',endTime:'13:00',hours:4}),'CONFLICT');
referenceMap={};
matchReferences=[id];
fails(()=>funcs.scheduleChange_(ss,member,{action:'delete',practiceId:id,expectedVersion:2}),'CONFLICT');
matchReferences=[];
const confirmed=funcs.scheduleChange_(ss,member,{action:'confirm',practiceId:id,expectedVersion:2}).data;
ok(confirmed.version===3&&list()[0].enabled===true,'confirmation publishes existing row');
fails(()=>funcs.scheduleChange_(ss,member,{action:'delete',practiceId:id,expectedVersion:3}),'FORBIDDEN');
fails(()=>funcs.scheduleChange_(ss,member,{action:'edit',practiceId:id,expectedVersion:3}),'FORBIDDEN');
const id2='PR-test-create-00000003';
const created=add(id2,'2026-11-24',{place:'=HYPERLINK("unsafe")'});
ok(scheduleRows[2][2].startsWith("'"),'spreadsheet formula injection prevented in place');
const removed=funcs.scheduleChange_(ss,member,{action:'delete',practiceId:id2,expectedVersion:1}).data;
ok(removed.action==='delete'&&list().length===1,'unconfirmed unreferenced practice deletable');
ok(writes.filter(x=>x==='schedule.append').length===2,'two additions append only practice rows');
ok(writes.every(x=>x.startsWith('schedule.')),'no ledger, payments or roster sheet written');
for(const bad of ['writeLedger_(','setPayment_(','balanceRecalc_(','cashSave_(']){
 ok(!text.includes(bad),'schedule module cannot mutate finance: '+bad);
}
ok(gas.includes("'練習日程':['practiceId','date','place','startTime','endTime','hours','enabled','remark','version']"),
 'practice schema includes legacy remarks and optimistic version');
ok(gas.includes("['overview','ledger.list','cash.get','schedule.list']"),
 'schedule read requires duty/admin role');
ok(gas.includes("'schedule.change'")&&gas.includes("auditExisting_(ss,opId,op,member)"),
 'schedule writes protected by existing script lock and op audit');
ok(worker.includes("'/api/schedule/list':'schedule.list'")&&worker.includes("'/api/schedule/change':'schedule.change'"),
 'Worker protects schedule routes using existing authentication');
for(const key of ['scheduleDialog','scheduleAdd','scheduleFormSync','scheduleList','scheduleEditDialog',
 'scheduleDate','scheduleTimeSlot','scheduleHours','schedulePlace','scheduleRemark',
 'scheduleActionDialog','scheduleActionSubmit']){
 ok(html.includes('id="'+key+'"'),'legacy schedule component: '+key);
}
ok(html.includes('id="scheduleFormSync" type="button" class="btn-outline" disabled'),
 'legacy Google Form sync cannot be falsely promised as a live action');
ok(ui.includes("'/api/schedule/list'")&&ui.includes("'/api/schedule/change'"),'UI calls schedule APIs');
ok(ui.includes("SC.rows=d.schedules.slice()"),'schedule UI uses server result, not demo data');
ok(ui.includes("btn.disabled=row.enabled"),'confirmed schedule controls disabled');
ok(ui.includes("S.updateEpoch++"),'schedule change invalidates stale overview reads');
ok(ui.includes("'前回確認後に帳簿残金が変わりました'"),'cash warning shortened');
ok(!ui.includes('前回の現金確認後に帳簿残金が変更されています。内容を確認してください。'),
 'unnecessary cash follow-up removed');
ok(html.includes('white-space:nowrap;overflow:hidden;text-overflow:ellipsis'),
 'cash warning fits one line without overlap');
console.log('PASS '+n+'/'+n+' legacy-v7 schedule, cash wording, auth, and financial isolation');
