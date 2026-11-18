#!/usr/bin/env node
'use strict';
/* Immutable in-memory 2026 staging test. Exercises REAL GAS deletion helpers.
 * No Google API calls, no production or staging worksheet writes.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const gas=read('gas-staging/コード.gs'),ui=read('live.js'),html=read('live.html'),worker=read('cloudflare-worker/worker.js');
let n=0;
function ok(condition,message){assert.ok(condition,message);n++}
function fails(fn,code){assert.throws(fn,e=>e?.smCode===code,code+' must be rejected');n++}
const fail_=(code,message)=>{const e=new Error(message);e.smCode=code;throw e};
const str_=v=>String(v??'').trim(),safeCell_=v=>/^[=+@]/.test(String(v))?"'"+v:String(v);
const today_=()=> '2026-11-18';
const iso_=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const jpy_=(v,negative)=>{if(!Number.isSafeInteger(v)||(!negative&&v<0))fail_('BAD_REQUEST','money');return v;};
const expectVersion_=(v,expected)=>{if(v!==Number(expected))fail_('CONFLICT','stale');};
const ledgerSrc=gas.slice(gas.indexOf('function balanceRecalc_('),gas.indexOf('function writeLedger_(',gas.indexOf('function balanceRecalc_(')));
const balanceRecalc_=new Function('fail_','iso_','jpy_',ledgerSrc+'\nreturn balanceRecalc_;')(fail_,iso_,jpy_);
const names=['練習日程','出欠回答','集金記録','全体収支管理表','現金確認記録',
 '試合セッション','試合版管理','試合操作履歴','閲覧リンク','ビジター申請','日程削除アーカイブ'];
const startData=()=>{
 const sheets=Object.fromEntries(names.map(n=>[n,[]]));
 const id='PR-TEST-20261121';
 sheets['練習日程']=[
 ['P-OLD','2026-11-16','先週の体育館','09:00','11:00',2,true,'',3],
 [id,'2026-11-21','曽谷公民館','09:00','11:30',3,true,'',4],
 ['P-NEXT','2026-11-23','北方小学校','13:00','16:00',3,true,'',1]
 ];
 sheets['出欠回答']=[
 [id,'PV-01','ゲストA','','visitor',true,'',0,'M-REG'],
 [id,'PV-02','ゲストB','','visitor',true,'',0,'M-REG'],
 ['P-NEXT','MEMBER-1','継続','','member',true,'',1,'M-REG']
 ];
 sheets['集金記録']=[[id,'PV-01',true,2,'M-DUTY','...'],['P-NEXT','MEMBER-1',false,0,'','']];
 sheets['現金確認記録']=[[id,'2026-11-21','{}',1000,1000,0,1,'M-DUTY','...']];
 sheets['試合セッション']=[[id,'RV-TEST',1,1,'...']];
 // Long real match revision JSON must be chunked rather than placed in a >50k cell.
 sheets['試合版管理']=[['RV-TEST',id,'ready','x'.repeat(34000),'sha','id','...',1,1]];
 sheets['試合操作履歴']=[['OP-TEST',id,'M-DUTY','create',1,'...','...']];
 sheets['閲覧リンク']=[['hash',id,'...','','M-DUTY','...']];
 sheets['ビジター申請']=[
  ['VR-TEST-ONE',id,'PV-01','ゲストA','','','M-REG','approved',1,'2026/11/18','','',''],
  ['VR-TEST-NEXT','P-NEXT','PV-22','ゲストC','','','M-REG','pending',0,'2026/11/18','','','']
 ];
 return sheets;
};
const startingLedger=[
 {date:'2026-11-15',rowId:'OPENING',kind:'opening',practiceId:'',status:'confirmed',
  income:0,expense:0,balance:100,version:1},
 {date:'2026-11-21',rowId:'P-PR-TEST-20261121',kind:'practice',practiceId:'PR-TEST-20261121',
  status:'open',income:600,expense:0,balance:700,version:1},
 {date:'2026-11-23',rowId:'P-P-NEXT',kind:'practice',practiceId:'P-NEXT',
  status:'open',income:200,expense:0,balance:900,version:1}
];
let sheets=startData(),ledger=startingLedger.map(x=>({...x})),writes=[],flushed=0;
const sheet_=(_ss,name)=>{
 if(!Object.prototype.hasOwnProperty.call(sheets,name))throw new Error('Missing sheet: '+name);
 const rows=sheets[name];
 return {
  getLastRow:()=>rows.length+1,getMaxRows:()=>100,
  insertRowsAfter:(n,extra)=>{ok(extra>0,'only append archive grid rows');writes.push('archive.grow');},
  getRange:(row,col,height=1,width=1)=>({
   getValues:()=>rows.slice(row-2,row-2+height).map(r=>r.slice(col-1,col-1+width)),
   setValues:values=>{for(let i=0;i<values.length;i++){
    const target=rows[row-2+i]||[];
    for(let j=0;j<values[i].length;j++)target[col-1+j]=values[i][j];
    rows[row-2+i]=target;
    writes.push(name+'.setValues');
   }},
   setValue:value=>{const target=rows[row-2]||[];target[col-1]=value;rows[row-2]=target;
    writes.push(name+'.setValue');}
  }),
  deleteRow:row=>{rows.splice(row-2,1);writes.push(name+'.deleteRow');}
 };
};
const sheetRows_=(_ss,name)=>sheets[name].map(row=>[...row]);
const entries_=()=>ledger.map(x=>({...x}));
const scheduleRows_=()=>sheets['練習日程'].map((r,i)=>({
 practiceId:r[0],date:r[1],place:r[2],enabled:r[6],remark:r[7],version:r[8],rowNumber:i+2
}));
const writeLedger_=(ss,rows)=>{ledger=rows.map(x=>({...x}));writes.push('全体収支管理表.rewrite')};
const SpreadsheetApp={flush:()=>{flushed++;writes.push('archive.flush')}};
const now_=()=> '2026-11-18 15:05:00';
const start=gas.indexOf('var SCHEDULE_DELETE_TABS_=[');
const end=gas.indexOf('function scheduleChange_(',start);
ok(start>0&&end>start,'read real cascade helper implementations');
const moduleText=gas.slice(start,end);
const funcs=new Function('sheet_','sheetRows_','entries_','scheduleRows_','expectVersion_',
 'balanceRecalc_','writeLedger_','fail_','str_','safeCell_','SpreadsheetApp','now_',
 moduleText+'\nreturn {scheduleDeletePlan_,scheduleDeletePreview_,scheduleDeleteExecute_,scheduleArchiveHas_};')(
 sheet_,sheetRows_,entries_,scheduleRows_,expectVersion_,balanceRecalc_,writeLedger_,
 fail_,str_,safeCell_,SpreadsheetApp,now_
);
const id='PR-TEST-20261121',member={memberId:'M-DUTY',role:'duty'};
const practice=scheduleRows_()[1];
const preview=funcs.scheduleDeletePreview_({},member,{practiceId:id,expectedVersion:4}).data;
ok(preview.canDelete&&preview.counts['出欠回答']===2&&preview.counts['集金記録']===1&&
 preview.counts['全体収支管理表']===1,'preview reports linked attendance, payments and ledger');
ok(preview.counts['試合セッション']===1&&preview.counts['試合版管理']===1&&
 preview.counts['試合操作履歴']===1&&preview.counts['閲覧リンク']===1&&
 preview.counts['現金確認記録']===1,'preview covers matches, share links and cash counts');
ok(writes.length===0,'preview never writes any data');
fails(()=>funcs.scheduleDeletePreview_({},member,{practiceId:id,expectedVersion:3}),'CONFLICT');
ledger[1].status='confirmed';
fails(()=>funcs.scheduleDeletePreview_({},member,{practiceId:id,expectedVersion:4}),'LOCKED');
ok(writes.length===0,'finalized target ledger blocks all destructive writes');
ledger[1].status='open';ledger[2].status='confirmed';
fails(()=>funcs.scheduleDeletePreview_({},member,{practiceId:id,expectedVersion:4}),'CONFLICT');
ok(writes.length===0,'finalized subsequent balance cannot be changed by cascade');
ledger[2].status='open';
const result=funcs.scheduleDeleteExecute_({},member,{operationId:'OP-DELETE-TEST-001'},practice);
ok(result.data.action==='delete'&&result.data.archived===true&&result.data.version===5,
 'confirmed schedule is deletable with immutable version and archive');
ok(!sheets['練習日程'].some(r=>r[0]===id),'target schedule physically removed');
for(const [name,col] of [['出欠回答',0],['集金記録',0],['現金確認記録',0],
 ['試合セッション',0],['試合版管理',1],['試合操作履歴',1],['閲覧リンク',1],['ビジター申請',1]]){
 ok(!sheets[name].some(r=>r[col]===id),'cascade removes linked rows in '+name);
}
ok(sheets['出欠回答'].some(r=>r[0]==='P-NEXT')&&
 sheets['集金記録'].some(r=>r[0]==='P-NEXT'),
 'unrelated participation/payment rows untouched');
ok(ledger.length===2&&ledger[1].rowId==='P-P-NEXT'&&ledger[1].balance===300,
 'open subsequent ledger balances recalculated without deleted meeting income');
ok(ledger[0].rowId==='OPENING'&&ledger[0].balance===100,
 'opening confirmed row unchanged');
const archived=sheets['日程削除アーカイブ'];
ok(archived.length>=3&&archived[0][7]==='completed'&&
 archived.every(r=>r[0]==='OP-DELETE-TEST-001'&&r[1]===id),
 'complete recovery archive preserves operation and schedule IDs');
const restored=JSON.parse(archived.map(r=>r[6]).join(''));
ok(restored.practiceId===id&&restored.schedule[0]===id&&
 restored.targets['出欠回答'].length===2&&restored.ledgerRemoved.length===1,
 'multi-chunk archive reconstructs all deleted data exactly');
ok(restored.targets['試合版管理'][0].cells[3].length===34000,
 'large match revision is not truncated in recovery archive');
ok(flushed===1&&writes.indexOf('archive.flush')<writes.indexOf('全体収支管理表.rewrite')&&
 writes.indexOf('archive.flush')<writes.indexOf('練習日程.deleteRow'),
 'archive flush strictly precedes all destructive changes');
ok(funcs.scheduleArchiveHas_({},id),'deleted schedule cannot be silently reused');
fails(()=>funcs.scheduleDeletePreview_({},member,{practiceId:'P-OLD',expectedVersion:999}),'CONFLICT');
ok(!sheets['操作履歴'],'operation audit belongs to original dispatcher and is never deleted by cascade');

// Collection lock policy tests use real GAS routines extracted as a separate module.
const cs=gas.indexOf('function collectionState_('),ce=gas.indexOf('function overview_(',cs);
ok(cs>0&&ce>cs,'real collection lifecycle routines present');
let scheduled=[
 {practiceId:'P-OLD',date:'2026-11-16',enabled:true,place:'昨日の体育館'},
 {practiceId:'P-TODAY',date:'2026-11-18',enabled:true,place:'今日の体育館'},
 {practiceId:'P-FUTURE',date:'2026-11-21',enabled:true,place:'未来の体育館'}
];
let collectionLedger=[
 {rowId:'OPENING',date:'2026-11-15',kind:'opening',practiceId:'',status:'confirmed',income:0,expense:0,balance:0,version:1},
 {rowId:'P-P-OLD',date:'2026-11-16',kind:'practice',practiceId:'P-OLD',status:'open',income:0,expense:0,balance:0,version:1}
];
let autoAudit=0,autoLedgerWrites=0;
const collection=new Function('practices_','today_','balanceRecalc_','writeLedger_',
 'practiceIncome_','audit_','fail_',cs>=0?gas.slice(cs,ce)+'\nreturn {collectionState_,ensureCollectionLedger_,requireCollection_};':'')(
 ()=>scheduled,today_,balanceRecalc_,(ss,rows)=>{collectionLedger=rows.map(x=>({...x}));autoLedgerWrites++;},
 ()=>0,()=>{autoAudit++;},fail_
);
const old=scheduled[0],current=scheduled[1],future=scheduled[2];
let access=collection.collectionState_({},future,collectionLedger);
ok(!access.canCollect&&access.future&&access.previousUnconfirmed,
 'future date and unconfirmed previous event shown as two distinct reasons');
ok(access.reason.includes('開催日前')&&access.reason.includes('前日程の収支未確定'),
 'user-facing message states actual lock reasons');
access=collection.collectionState_({},current,collectionLedger);
ok(!access.canCollect&&access.previousUnconfirmed&&!access.future,
 'today still blocks when previous ledger unconfirmed');
fails(()=>collection.requireCollection_({},current,collectionLedger),'LOCKED');
ok(collection.ensureCollectionLedger_({},member,current,collectionLedger).length===2&&
 autoLedgerWrites===0,'today cannot auto-create ledger until previous finalized');
collectionLedger[1].status='confirmed';
const opened=collection.ensureCollectionLedger_({},member,current,collectionLedger);
ok(opened.length===3&&autoLedgerWrites===1&&autoAudit===1,
 'today auto-opens the missing ledger after previous settlement finalized');
ok(opened.some(x=>x.rowId==='P-P-TODAY'&&x.status==='open')&&
 collection.collectionState_({},current,opened).canCollect,
 'auto-created ledger enables today collection exactly once');
collection.ensureCollectionLedger_({},member,current,opened);
ok(autoLedgerWrites===1,'duplicate overview cannot duplicate the deterministic ledger row');
ok(!collection.collectionState_({},future,opened).canCollect,
 'future date stays locked even after previous settlement');
for(const x of ['id="scheduleHours"','<option value="2">2</option>',
 '<option value="3">3</option>','<option value="4" selected>4</option>']){
 ok(html.includes(x),'compact fee class dropdown element: '+x);
}
ok(ui.includes("' ('+row.hours+'h) '+row.place"),'cards show (2h) style');
ok(ui.includes("btn.disabled=row.enabled&&action!=='delete'"),
 'confirmed schedule keeps delete active, other edit actions disabled');
ok(ui.includes("'/api/schedule/delete-preview'"),
 'pre-deletion preview is fetched before final confirmation');
ok(ui.includes("const access=v.collectionAccess;")&&ui.includes("access?.canCollect===false"),
 'frontend lock matches GAS enforcement, not missing ledger alone');
ok(worker.includes("'/api/schedule/delete-preview':'schedule.delete.preview'"),
 'preview API requires existing session and duty access');
ok(gas.includes("'日程削除アーカイブ':['operationId','practiceId'"),
 'archive schema is required and checked');
new Function(ui);new Function(gas);n+=2;
console.log('PASS '+n+'/'+n+' cascade backup, exact-match deletion, ledger continuity and collection gating');
