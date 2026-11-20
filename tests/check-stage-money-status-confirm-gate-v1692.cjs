#!/usr/bin/env node
'use strict';
/* Stage-only regression for two separate user observations:
 * (1) amount save state must be below the numeric control, in semantic colors;
 * (2) the 11/21 finalization button must remain locked by 11/19 open ledger
 *     rows, and must become eligible only when both previous rows confirm.
 * No remote read/write, no LINE identities or mutations.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'live.html'),'utf8'),
 css=fs.readFileSync(path.join(root,'stage-ui.css'),'utf8'),
 live=fs.readFileSync(path.join(root,'live.js'),'utf8'),
 gas=fs.readFileSync(path.join(root,'gas-staging/コード.gs'),'utf8');
const fail_=(code,message)=>{const e=new Error(message);e.smCode=code;throw e;};

const start=gas.indexOf('function ledgerChronologyCompare_(');
const stop=gas.indexOf('/* Same exact order as legacy v15 balance calculation and confirmation. */',start);
assert.ok(start>=0&&stop>start,'existing chronological finalization helpers');
const calc=new Function('fail_','today_',gas.slice(start,stop)+
 '\nreturn {ledgerPriorPending_,ledgerCanConfirm_};')(fail_,()=>day);
let day='2026-11-21';
const row=(date,id,kind,status)=>({date,rowId:id,kind,status});
const opening=row('2026-11-15','OPENING','opening','confirmed');
const previousPractice=row('2026-11-19','P-PREV','practice','confirmed');
const previousConfirmed=row('2026-11-19','R-CONFIRMED','reimbursement','confirmed');
const openReimbursement=row('2026-11-19','R-TEST-5200','reimbursement','open');
const openOther=row('2026-11-19','O-TEST-10000','other','open');
const current=row('2026-11-21','P-20261121','practice','open');
const finance=[opening,previousPractice,previousConfirmed,openReimbursement,openOther,current];
assert.equal(calc.ledgerPriorPending_(finance,current),openReimbursement);
assert.equal(calc.ledgerCanConfirm_(finance,current),false,'prior unconfirmed reimbursement blocks 11/21');
openReimbursement.status='confirmed';
assert.equal(calc.ledgerPriorPending_(finance,current),openOther);
assert.equal(calc.ledgerCanConfirm_(finance,current),false,'other unconfirmed income blocks 11/21');
openOther.status='confirmed';
assert.equal(calc.ledgerCanConfirm_(finance,current),true,'11/21 becomes eligible only after both earlier rows are finalized');
day='2026-11-20';assert.equal(calc.ledgerCanConfirm_(finance,current),false,'never enable future-day confirmation');
day='2026-11-21';openReimbursement.status='open';openOther.status='open';

assert.ok(html.includes('id="adjustmentStatus" class="stage-field-save-status"'));
assert.ok(html.includes('id="expenseStatus" class="stage-field-save-status"'));
assert.ok(html.includes('id="confirmLockReason"'));
const expenseMarkup=html.slice(html.indexOf('<div class="expense-box">'),html.indexOf('<div class="home-footer-bar">'));
assert.match(expenseMarkup,/<\/div><small id="expenseStatus"/,'expense state follows the actions on its OWN row');
assert.match(css,/body\.stage-ui > main\.container \.adjustment-box,[\s\S]*?flex-wrap:wrap/);
assert.match(css,/body\.stage-ui > main\.container \.adjustment-box > \.stage-field-save-status,[\s\S]*?flex:0 0 100%/);
assert.match(css,/\.stage-field-save-status--processing::before[\s\S]*?animation:stage-ui-spin/);
assert.match(css,/\.stage-field-save-status--success\{color:#23723b\}/);
assert.match(css,/prefers-reduced-motion:reduce[\s\S]*?\.stage-field-save-status--processing::before\{animation:none\}/);
assert.ok(html.includes('v1692-amount-status-finance-gate'));
assert.ok(html.includes('v1692-confirm-gate'));
const helperBegin=live.indexOf('function setAmountStatus_('),
 helperEnd=live.indexOf('async function saveAmount(',helperBegin);
assert.ok(helperBegin>=0&&helperEnd>helperBegin);
const mark=new Function(live.slice(helperBegin,helperEnd)+'\nreturn setAmountStatus_;')();
const status={className:'',textContent:''};
mark(status,'当日補正を保存中…','processing');
assert.equal(status.className,'stage-field-save-status stage-field-save-status--processing');
assert.equal(status.textContent,'当日補正を保存中…');
mark(status,'保存しました','success');
assert.equal(status.className,'stage-field-save-status stage-field-save-status--success');
mark(status,'結果を確認できません。更新してください','error');
assert.match(status.className,/--error$/);
mark(status,'','');
assert.equal(status.className,'stage-field-save-status');

const renderStart=live.indexOf('function renderHome(){');
const renderStop=live.indexOf(" const list=$('list'),pos=list.scrollTop",renderStart);
assert.ok(renderStart>=0&&renderStop>renderStart);
const nodes={}; const $=id=>nodes[id]||(nodes[id]={textContent:'',value:0,disabled:false,hidden:true});
const S={overview:null,homeReadFailed:false,practiceId:'P-20261121'};
const today=()=>day;
const render=new Function('S','$','today','updateFooter',live.slice(renderStart,renderStop)+'\n}\nreturn renderHome;')(S,$,today,()=>{});
const practice={practiceId:'P-20261121',date:'2026-11-21',place:'架空体育館',hours:4};
const ledger={status:'open',canConfirm:false,adjustment:1000,expense:0,receiptFileId:''};
const access={canCollect:true,reason:''};
S.overview={practice,ledger,collectionAccess:access,attendingCount:2,completedCount:2,participants:[]};
render();
assert.equal(nodes.confirm.disabled,true);
assert.equal(nodes.confirmLockReason.hidden,false);
assert.match(nodes.confirmLockReason.textContent,/先行する未確定の収支/);
assert.equal(nodes.collectionLockReason.hidden,true,'normal collection may continue while finalization is locked');
assert.equal(nodes.adjustment.disabled,false,'money field save remains available before finalization');
ledger.canConfirm=true;render();
assert.equal(nodes.confirm.disabled,false);
assert.equal(nodes.confirmLockReason.hidden,true);
ledger.canConfirm=false;practice.date='2026-11-22';render();
assert.equal(nodes.confirm.disabled,true);
assert.equal(nodes.confirmLockReason.hidden,true,'future day is blocked without false prior-ledger reason');
practice.date='2026-11-21';ledger.status='confirmed';render();
assert.equal(nodes.confirm.disabled,true);
assert.equal(nodes.confirmLockReason.hidden,true,'confirmed row shows confirmed status only');

assert.match(live,/setAmountStatus_\(status,'保存しました','success'\)/);
assert.match(live,/setAmountStatus_\(status,'結果を確認できません。更新してください','error'\)/);
assert.match(live,/S\.pending\.add\('amount'\)/,'saving remains protected against parallel writes');
assert.match(live,/S\.paymentNeedsRefresh=true/,'uncertain save results require manual refresh');
assert.match(live,/ledger\?\.canConfirm!==true/,'client finalization disabled if GAS denies');
console.log('PASS v1692 amount status on own row and strict previous-ledger confirmation gate');
