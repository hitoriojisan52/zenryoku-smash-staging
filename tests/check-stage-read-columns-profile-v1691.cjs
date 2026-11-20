#!/usr/bin/env node
'use strict';
// Actual staging GAS read helpers in a fake workbook. No LINE/GAS/Sheets calls.
// Verify that ID/date/role and confirmation decisions match the previous
// full-width reads while avoiding large audit JSON and unrelated money fields.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const s=fs.readFileSync(path.resolve(__dirname,'../gas-staging/コード.gs'),'utf8');
function slice(a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert.ok(i>=0&&j>i,'GAS block '+a);return s.slice(i,j);}
const str_=v=>String(v??'').trim();
const fail_=(code,message)=>{const e=new Error(message);e.smCode=code;throw e;};
let requests=[];
const sheet=(name,data)=>({
 getLastRow:()=>data.length+1,
 getRange:(row,col,height,width)=>{
  assert.equal(row,2);
  assert.equal(height,data.length);
  requests.push({name,col,width});
  return {getValues:()=>data.map(r=>r.slice(col-1,col-1+width))};
 }
});
const opRows=[
 ['OP-1','other','M-A','2026-11-19 09:00:00','P-A|M-A','{"big":"unrelated"}'],
 ['OP-2','attendance.submit','M-A','2026-11-19 10:00:00','P-A|M-A','{"result":"first"}'],
 ['OP-3','attendance.submit','M-A','2026-11-19 11:10:00','P-A|M-A','{"result":"last"}'],
 ['OP-4','attendance.submit','M-B','2026-11-19 12:15:00','P-A|M-B','{"result":"other"}'],
 ['OP-5','attendance.submit','M-A','invalid-date','P-A|M-A','{"result":"invalid"}']
];
const fullFinance=[
 ['2026-11-15','opening',0,0,1000,'','OPENING','opening','','confirmed',1,0,'','','',''],
 ['2026-11-19','other',300,0,1300,'','O-TEST','other','','open',1,0,'','','',''],
 ['2026-11-21','gym',0,0,1300,'','P-P-A','practice','P-A','confirmed',1,0,'','','',''],
 ['2026-11-25','gym',0,0,1300,'','P-P-B','practice','P-B','open',1,0,'','','',''],
 ['2026-11-28','missing',0,0,1300,'','P-P-C','practice','P-C','confirmed',1,0,'','','',''],
 ['2026-11-28','no fixed ID',0,0,1300,'','','practice','P-X','confirmed',1,0,'','','','']
];
const cashHistory=[['P-A','2026-11-21','{}',0,1300,0,4,'M-A','2026-11-20 18:00:00']];
let opData=opRows,ledgerData=fullFinance,storedCash=cashHistory;
const sheet_=(_ss,name)=>{
 const tables={'操作履歴':opData,'全体収支管理表':ledgerData,'現金確認記録':storedCash};
 if(!Object.hasOwn(tables,name))fail_('SETUP','unknown table');
 return sheet(name,tables[name]);
};
const auditFn=new Function('sheet_','str_','attendanceAuditTime_',
 slice('function attendanceAuditDates_(ss){','function participantRows_(ss,practiceId){')+
 '\nreturn attendanceAuditDates_;')(
 sheet_,str_,v=>str_(v));
requests=[];
const audit=auditFn({});
assert.deepEqual(audit['P-A|M-A'],{first:'2026-11-19 10:00:00',last:'2026-11-19 11:10:00'});
assert.deepEqual(audit['P-A|M-B'],{first:'2026-11-19 12:15:00',last:'2026-11-19 12:15:00'});
assert.deepEqual(requests,[{name:'操作履歴',col:2,width:4}], 'B:E only, never read audit result JSON');
opData=[];requests=[];assert.equal(Object.keys(auditFn({})).length,0);
assert.equal(requests.length,0,'empty audit sheet no range read');
opData=opRows;
const visitorFn=new Function('sheet_','str_',
 slice('function visitorConfirmedPracticeIds_(ss){','function visitorMine_(ss,member){')+
 '\nreturn visitorConfirmedPracticeIds_;')(sheet_,str_);
requests=[];
assert.deepEqual(visitorFn({}),['P-A','P-C']);
assert.deepEqual(requests,[{name:'全体収支管理表',col:7,width:4}],
 'G:J only, no amount, receipt or payee fields');
ledgerData=[];requests=[];assert.deepEqual(visitorFn({}),[]);
assert.equal(requests.length,0);
ledgerData=fullFinance;
const cashFn=new Function('str_','practice_','sheet_','ledgerDate_','cashRows_','fail_',
 'SM_CASH_DENOMINATIONS_','cashCounts_',
 slice('function cashGet_(ss,member,payload){','function cashSave_(ss,member,payload){')+
 '\nreturn cashGet_;')(
 str_,(_ss,id)=>({practiceId:id,date:'2026-11-21'}),
 sheet_,str_,()=>storedCash,fail_,[10000,5000,1000,500,100,50,10,5,1],
 x=>({counts:x,total:0}));
requests=[];
const cash=cashFn({}, {role:'duty'}, {practiceId:'P-A'}).data;
assert.equal(cash.bookBalance,1300);
assert.equal(cash.auditDate,'2026-11-21');
assert.equal(cash.found,true);
assert.equal(cash.version,4);
assert.equal(cash.savedBookBalance,1300);
assert.deepEqual(requests,[{name:'全体収支管理表',col:1,width:9}],
 'cash GET only reads A:I, while cash SAVE remains untouched');
storedCash=[];requests=[];
assert.equal(cashFn({}, {role:'duty'}, {practiceId:'P-A'}).data.bookBalance,1300);
ledgerData=fullFinance.filter(r=>r[6]!=='P-P-A');
requests=[];
assert.equal(cashFn({}, {role:'duty'}, {practiceId:'P-A'}).data.found,false);
assert.equal(cashFn({}, {role:'duty'}, {practiceId:'P-A'}).data.bookBalance,null);
ledgerData=fullFinance.map(r=>[...r]);ledgerData[2][0]='2026-11-22';
assert.throws(()=>cashFn({}, {role:'duty'}, {practiceId:'P-A'}),e=>e.smCode==='SETUP',
 'practice date mismatch still rejects');
ledgerData=fullFinance;
const profileFn=new Function(
 slice('function stageReadProfileV1691_(profile,start,response){','function dispatch_(body){')+
 '\nreturn stageReadProfileV1691_;')();
const identityFree={ok:true,data:{role:'duty',practiceId:'P-A'}};
const same=profileFn(null,0,identityFree);
assert.equal(same,identityFree);
assert.equal(same.data.profileTimings,undefined,'no timing for normal calls');
const start=Date.now()-1500,profile={startedAt:Date.now()-2000,spreadsheetOpenMs:180,memberAuthMs:210,lockWaitMs:90};
const timed=profileFn(profile,start,{ok:true,data:{role:'duty'}});
assert.deepEqual(Object.keys(timed.data.profileTimings),
 ['spreadsheetOpenMs','memberAuthMs','lockWaitMs','readHandlerMs','gasTotalMs']);
assert.ok(timed.data.profileTimings.readHandlerMs>=1400);
assert.ok(timed.data.profileTimings.gasTotalMs>=1900);
assert.ok(!JSON.stringify(timed.data.profileTimings).includes('U'+'a'.repeat(32)));
const gasDispatch=s.slice(s.indexOf('function dispatch_(body){'),s.indexOf('function doPost(e){'));
assert.match(gasDispatch,/requireDuty_\(member\)/,'duty permission before accounting reads');
assert.match(gasDispatch,/return withLock_\(function\(\)\{[\s\S]*stageReadProfileV1691_\(/);
assert.match(gasDispatch,/op==='member\.apply'\|\|body\.op==='member\.status'/,'non-member registration route unaffected');
assert.match(gasDispatch,/if\(op==='payment\.set'\)result=setPayment_/,'payment write path unchanged');
assert.match(gasDispatch,/if\(op==='cash\.save'\)result=cashSave_/,'cash save path unchanged');
assert.match(s,/function cashSave_\([\s\S]*var ledger=entries_\(ss\)\.find/,'cash save uses the full latest ledger');
console.log('PASS v1691 targeted reads: 4-column audit, 4-column confirmed practices, 9-column cash, opt-in safe timing, protected writes');
