#!/usr/bin/env node
'use strict';
// v0.16.38e regression: genuine GAS match sheet schema mismatch and manual
// refresh during the 8-second silent poll. Pure in-memory test; no API writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const gas=read('gas-staging/コード.gs'),ui=read('live.js'),html=read('live.html');
let n=0;
function ok(value,label){assert.ok(value,label);n++}
new Function(gas);new Function(ui);n+=2;
const smStart=gas.indexOf('var SM = {'),smEnd=gas.indexOf('\nfunction conf_(',smStart);
ok(smStart>=0&&smEnd>smStart,'real GAS shared sheet schema located');
const SM=new Function(gas.slice(smStart,smEnd)+'\nreturn SM;')();
ok(!SM.headers['試合セッション'],'match session is intentionally owned by independent match module');
const start=gas.indexOf('function participantMatchLocked_('),end=gas.indexOf('function participantRows_(',start);
ok(start>=0&&end>start,'production participant match guard is found');
let rangeReads=0;
const sessions=[['P-OLD','RV-A'],['P-TEST','RV-B']];
const sh={
 getLastRow:()=>sessions.length+1,
 getRange(row,col,height,width){
  ok(row===2&&col===1&&height===sessions.length&&width===1,
    'only practice IDs from first column are read');
  rangeReads++;
  return {getValues:()=>sessions.map(r=>[r[0]])};
 }
};
const memberMatch=new Function('sheet_','str_','sheetRows_','matchDeleteArchiveStatus_',
 gas.slice(start,end)+'\nreturn participantMatchLocked_;')(
 (_ss,name)=>{ok(name==='試合セッション','actual match sheet selected');return sh;},
 v=>String(v??'').trim(),
 ()=>{throw new Error('Regression: generic sheetRows_ on independently owned match sheet');},
 ()=>false
);
ok(memberMatch({},'P-TEST')===true,'practice with match revisions locked');
ok(memberMatch({},'P-OTHER')===false,'practice without match revisions editable');
ok(rangeReads===2,'no full session JSON/rows loaded');
const emptySh={getLastRow:()=>1};
ok(new Function('sheet_','str_','sheetRows_','matchDeleteArchiveStatus_',gas.slice(start,end)+
 '\nreturn participantMatchLocked_;')((ss,name)=>emptySh,
 String,()=>{throw Error('must not read generic schema')},()=>false)({},'P-EMPTY')===false,
 'match sheet header-only case returns false without getRange');
ok(ui.includes("'/api/participant/list'")&&ui.includes('openParticipantManager_'),
 'participant list UI remains connected to authenticated backend');

// Execute the actual reload() function with two pending HTTP reads.
const a=ui.indexOf('async function reload(refreshDates){'),z=ui.indexOf('\nfunction renderHome(){',a);
ok(a>=0&&z>a,'live reload implementation located');
const S={pending:new Set(),loading:false,reloadPromise:null,updateEpoch:0,
 practiceId:'P-TEST',paymentNeedsRefresh:false};
const dom={date:{value:'P-TEST',items:[],replaceChildren(...opts){this.items=opts;}}};
const requests=[];
const call=()=>new Promise((resolve,reject)=>{requests.push({resolve,reject})});
let paint=0,controls=0;
const reload=new Function('S','$','call','window','Option','renderHome','syncPaymentControls',
 ui.slice(a,z)+'\nreturn reload;')(
 S,id=>dom[id],call,
 {SMDate:{date:v=>v}},
 function Option(label,value){this.text=label;this.value=value;},
 function(){paint++},function(){controls++}
);
const info={ok:true,practice:{practiceId:'P-TEST'},practices:[
 {practiceId:'P-TEST',date:'2026-11-18',startTime:'09:00',endTime:'12:00'}]};
(async()=>{
 const auto=reload(false);
 ok(requests.length===1&&S.loading,'automatic poll begins one read');
 const manual=reload(true);
 ok(requests.length===1&&S.loading,'manual refresh waits instead of being dropped');
 requests[0].resolve(info);
 await auto;
 for(let i=0;i<10&&requests.length<2;i++)await Promise.resolve();
 ok(requests.length===2,'manual refresh starts its own read after silent poll');
 requests[1].resolve(info);
 await manual;
 ok(!S.loading&&S.reloadPromise===null,'pending refresh tracking clears after completion');
 ok(dom.date.items.length===1&&dom.date.value==='P-TEST',
  'manual refresh forces date options to be re-rendered');
 ok(paint===2&&controls===2,'both reads completed with UI updates');
 const startCase=reload(false);
 requests[2].reject(new Error('transient stale background read'));
 await assert.rejects(startCase,/transient/);n++;
 const retry=reload(true);
 ok(requests.length===4,'manual refresh still works after failed automatic poll');
 requests[3].resolve(info);await retry;
 ok(!S.loading&&S.reloadPromise===null,'failure does not lock refresh indefinitely');
 ok(ui.includes("requestAnimationFrame(()=>requestAnimationFrame(resolve))"),
  'manual refresh gives overlay spinner a full paint frame before reading');
 ok(ui.includes("'データを更新しています…'"),
  'manual refresh explicitly labels blocking loading dialog');
 ok(html.includes('stageBusyDialog')&&html.includes('stage-busy-spinner'),
  'full-screen common spinner remains present');
 ok(html.includes('live.js?v=1643'),'client cache-busting version advanced');
 console.log('PASS '+n+'/'+n+' participant match guard and manual/silent polling spinner regression');
})().catch(err=>{console.error(err);process.exitCode=1});
