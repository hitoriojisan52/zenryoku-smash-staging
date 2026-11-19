#!/usr/bin/env node
'use strict';
// No real spreadsheets or LINE messages; exercise GAS's payment handler with stubs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const gas=fs.readFileSync(path.join(root,'gas-staging/コード.gs'),'utf8');
const ui=fs.readFileSync(path.join(root,'live.js'),'utf8');
const html=fs.readFileSync(path.join(root,'live.html'),'utf8');
let n=0;const ok=(v,m)=>{assert.ok(v,m);n++;};
new vm.Script(gas);ok(true,'GAS syntax compiles');
new vm.Script(ui);ok(true,'client syntax compiles');
ok(html.includes('live.js?v=1660'),'updated diagnostic JS cache');
ok(html.includes('id="perfBreakdown" hidden'),'diagnostics hidden by default');
ok(ui.includes('if(!PERF_MODE||!timings'),'panel disabled in normal mode');
ok(ui.includes('profileTimings:PERF_MODE'),'opt-in request only');
ok(ui.includes('renderGasProfile_(saved.gasTimings)'),'returned timings displayed');
ok(gas.includes("body.op==='payment.set'&&body.payload&&body.payload.profileTimings===true"),'only payment with opt-in profiling');
ok(gas.includes('if(paymentProfile&&result&&result.ok&&result.data)'),'only success profiles');
ok(gas.indexOf("audit_(ss,opId,op,member,str_(payload.rowId||payload.participantId||payload.practiceId),result);")<
   gas.indexOf('result.data.gasTimings=timings;'),'timings are not stored in audit rows');
ok(gas.includes('return withLock_(function(){')&&gas.includes('},paymentProfile);'),'lock semantics retained');
const i=gas.indexOf('function setPayment_('),j=gas.indexOf('\nfunction setCategory_(',i);
ok(i>=0&&j>i,'payment handler located');
const ledger={date:'2026-11-16',rowId:'P-TEST-20261116',income:0,balance:0,version:1,status:'open'};
const paymentRows=[];
const calls={paymentWrite:0,ledgerWrite:0,reads:0};
const now_ =()=> '2026-11-18 10:00:00';
const sh={getRange:(row,col,rows,cols)=>({setValues:values=>{
  ok(row===2&&col===1&&rows===1&&cols===6,'payment range exact');
  const arr=values[0];paymentRows[0]=[...arr];calls.paymentWrite++;
}}),
 appendRow:v=>{paymentRows.push([...v]);calls.paymentWrite++;}};
const noop=()=>{};
const f=new Function('str_','practice_','entries_','row_','unlockable_','attendees_','sheet_','sheetRows_','expectVersion_','fail_','bool_','fee_','balanceRecalc_','writePaymentLedger_','now_','requireCollection_',
 gas.slice(i,j)+'\nreturn setPayment_;')(
  x=>String(x==null?'':x),()=>{
   calls.reads++;return {hours:2};
  },()=>{calls.reads++;return [{...ledger}]},
  (rows,id)=>rows.find(r=>r.rowId===id),
  row=>{if(row.status==='confirmed')throw Error('LOCKED')},
  ()=>{calls.reads++;return [{participantId:'TEST-P001',category:'duty'}]},
  ()=>sh,
  ()=>{calls.reads++;return paymentRows},
  (current,expected)=>{if(current!==expected)throw Error('VERSION_CONFLICT')},
  (code,msg)=>{throw Error(msg)},
  x=>x===true||x==='TRUE',
  ()=>600,
  (rows,old)=>{rows[0].balance=rows[0].income;ok(rows[0].balance===rows[0].income,'balance checked')},
  (ss,rows)=>{calls.ledgerWrite++;Object.assign(ledger,rows[0])},
  now_,
  (ss,p,rows)=>{ok(!!p&&Array.isArray(rows),'server collection gate invoked before payment');});
const args={operationId:'TEST-OP-12345678',practiceId:'TEST-20261116',participantId:'TEST-P001',completed:true,expectedVersion:0};
const prof={};
const saved=f({}, {memberId:'TEST-MEMBER'},args,prof);
ok(saved.ok&&saved.data.income===600,'payment ON result preserved');
ok(calls.paymentWrite===1&&calls.ledgerWrite===1,'exactly two writes for payment and ledger');
for(const key of ['practiceReadMs','ledgerReadMs','attendeeReadMs','paymentReadMs','validationMs','paymentWriteMs','ledgerWriteMs']){
 ok(Number.isSafeInteger(prof[key])&&prof[key]>=0,'integer profile: '+key);
}
const before=Object.values(calls).slice(); // second call without profile still writes normally.
const off=f({}, {memberId:'TEST-MEMBER'},{...args,completed:false,expectedVersion:1},null);
ok(off.ok&&off.data.income===0,'payment OFF result preserved');
ok(calls.paymentWrite===2&&calls.ledgerWrite===2,'no extra writes with profiling');
ok(calls.reads===8,'four reads per payment, no added reads for profiling');
ok(!Object.prototype.hasOwnProperty.call(off.data,'gasTimings'),'normal response lacks timing extension');
console.log('PASS '+n+'/'+n+' GAS stage payment profiling and UI opt-in checks');
