#!/usr/bin/env node
'use strict';
// Local, read-only behavioral checks for v0.16.36d ledger write fast path.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'../gas-staging/コード.gs'),'utf8');
const start=src.indexOf('function writePaymentLedger_('),end=src.indexOf('\nfunction row_(',start);
assert(start>=0&&end>start,'missing reviewed narrow-write function');
let assertions=0;
function ok(value,message){assert.ok(value,message);assertions++;}
function base(){
 const opening={date:'2026-11-15',label:'Opening',income:0,expense:0,balance:0,confirmedBy:'',rowId:'OPENING',
   kind:'opening',practiceId:'',status:'confirmed',version:1,adjustment:0,item:'',payee:'',receiptFileId:'',createdBy:''};
 const practice={date:'2026-11-16',label:'Hall',income:0,expense:0,balance:0,confirmedBy:'',rowId:'P-TEST-20261116',
   kind:'practice',practiceId:'TEST-20261116',status:'open',version:1,adjustment:0,item:'',payee:'',receiptFileId:'',createdBy:'MIGRATION'};
 return [opening,practice];
}
const clone=rows=>rows.map(r=>({...r}));
function execute(original,rows,lastRow=original.length+1,target='P-TEST-20261116'){
 const calls={narrow:[],full:0};
 const sh={getLastRow:()=>lastRow,getRange:(row,col,height,width)=>({setValues:values=>calls.narrow.push({row,col,height,width,values})})};
 const sheet_=(ss,name)=>{ok(name==='全体収支管理表','only ledger sheet');return sh;};
 const writeLedger_=(ss,rs)=>{calls.full++;ok(rs===rows,'fallback uses validated calculated rows');};
 const safeCell_=s=>String(s).startsWith('=')?"'"+s:s;
 const fn=new Function('sheet_','writeLedger_','safeCell_',src.slice(start,end)+'\nreturn writePaymentLedger_;')
  (sheet_,writeLedger_,safeCell_);
 const mode=fn({},rows,original,target);
 return {mode,calls};
}
// Normal last-practice checkbox: only C:K on physical row 3; date/labels untouched.
let previous=base(),updated=clone(previous);updated[1].income=600;updated[1].balance=600;updated[1].version=2;
let r=execute(previous,updated);
ok(r.mode==='row'&&r.calls.full===0,'single practice row fast path');
ok(r.calls.narrow.length===1,'single write');
ok(r.calls.narrow[0].row===3&&r.calls.narrow[0].col===3&&r.calls.narrow[0].width===9,'only practice C:K');
ok(JSON.stringify(r.calls.narrow[0].values)==='[[600,0,600,"","P-TEST-20261116","practice","TEST-20261116","open",2]]','correct row values');
// Undo: only same row; version increases, amount returns to zero.
previous=updated;updated=clone(previous);updated[1].income=0;updated[1].balance=0;updated[1].version=3;
r=execute(previous,updated);ok(r.mode==='row'&&r.calls.narrow.length===1,'undo same one-row path');
// New downstream unconfirmed row: its future balance/version also changes => full rewrite.
previous=base();previous.push({...previous[1],date:'2026-11-23',rowId:'P-FUTURE',practiceId:'FUTURE',version:1});
updated=clone(previous);updated[1].income=600;updated[1].balance=600;updated[1].version=2;updated[2].balance=600;updated[2].version=2;
r=execute(previous,updated);ok(r.mode==='full'&&r.calls.full===1&&r.calls.narrow.length===0,'downstream change always full fallback');
// Not sorted like physical sheet: full fallback.
previous=base().reverse();updated=base();updated[1].income=600;updated[1].balance=600;updated[1].version=2;
r=execute(previous,updated);ok(r.mode==='full'&&r.calls.full===1,'reordered rows fallback');
// Gap or unrecognized appended row in physical spreadsheet: full fallback.
previous=base();updated=clone(previous);updated[1].income=600;updated[1].balance=600;updated[1].version=2;
r=execute(previous,updated,4);ok(r.mode==='full'&&r.calls.full===1,'non-contiguous physical rows fallback');
// Any changed immutable field means full rewrite, not partial write.
updated[1].label='Unexpected';r=execute(previous,updated);ok(r.mode==='full'&&r.calls.full===1,'immutable ledger metadata fallback');
// No changed row => full; don't silently skip expected write.
r=execute(previous,clone(previous));ok(r.mode==='full','no-op fallback');
// Accidental change in opening row => full.
updated=clone(previous);updated[0].balance=123;updated[0].version=2;
r=execute(previous,updated);ok(r.mode==='full','opening row changed fallback');
// The fast path must occur only after full validation and payment record write.
const payStart=src.indexOf('function setPayment_('),payEnd=src.indexOf('\nfunction setCategory_(',payStart);
const payment=src.slice(payStart,payEnd);
ok(payment.indexOf('balanceRecalc_(rows,original)')>=0,'full validation kept');
ok(payment.indexOf('balanceRecalc_(rows,original)')<payment.indexOf("writePaymentLedger_(ss,rows,original,'P-'+id)"),
  'fast write only after balance and confirmed-row check');
ok(payment.indexOf('sh.appendRow(')<payment.indexOf("writePaymentLedger_(ss,rows,original,'P-'+id)"),
  'existing write ordering is preserved');
ok(src.includes('function ledgerDate_(s)'),'date normalization preserved');
new Function(src);
ok(true,'GAS source syntax valid');
console.log('PASS '+assertions+'/'+assertions+' payment narrow-write and financial fallback safeguards');
