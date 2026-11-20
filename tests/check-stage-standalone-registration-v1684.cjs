#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const html=read('register.html'),app=read('register.js'),css=read('register.css'),
 shared=read('stage-ui.css'),management=read('live.html'),managementJs=read('live.js'),
 config=read('runtime-config.js'),worker=read('cloudflare-worker/worker.js'),
 gas=read('gas-staging/AccessAndGuestV160.gs');
let checks=0;function ok(bool,msg){assert.ok(bool,msg);checks++;}
new Function(app);checks++;
ok(html.includes('<title>全力☆スマッシュ｜利用申請</title>'),'standalone page is not named staging/test');
ok(html.includes('id="registrationForm"')&&html.includes('id="registrationStatus"')&&
 html.includes('id="registrationConfirm"'),'standalone application has owned form/status/confirmation');
ok(!html.includes('manageDialog')&&!html.includes('stageRolePreviewOpen')&&
 !html.includes('reimbursementBtn'),'independent page cannot enter management/finance');
ok(html.includes('stage-ui.css?v=1684-status-contract'),'shared status styles are reused');
ok(management.includes('id="stageRegistrationOpen"')&&
 !management.includes('stageRegistrationDialog'),'staging menu links to standalone page instead of embedding popup');
ok(managementJs.includes("window.location.assign('register.html')")&&
 !managementJs.includes('REGISTRATION_MODE')&&
 !managementJs.includes('setupRegistration_'),'management app no longer owns registration entry or bypass');
ok(/registrationLiffId:\s*""/.test(config)&&
 !/registrationLiffId:\s*"[0-9]/.test(config),'new LIFF ID left unassigned until user explicitly creates it');
ok(app.includes('cfg.registrationLiffId')&&
 app.includes('liff.init({liffId:cfg.registrationLiffId')&&
 app.includes('getIDToken()'),'standalone LIFF uses its own channel config and ID token');
ok(app.includes("api('/api/member/status')")&&
 app.includes("api('/api/member/apply',payload,true)")&&
 !app.includes("api('/api/session')"),'unregistered users can apply without a management session');
ok(worker.includes("'/api/member/status':'member.status'")&&
 worker.includes("'/api/member/apply':'member.apply'")&&
 gas.includes("if(op==='member.status')")&&gas.includes("if(op!=='member.apply')"),
 'existing server-side registration/auth path retained');
ok(app.includes('const TIMEOUT_MS=15000')&&
 app.includes('const controller=!write')&&
 app.includes('Promise.race([task,timeout])'),'15-second read/write deadline, no forced abort of writes');
ok(!app.includes("api('/api/member/apply',payload,true).catch")&&
 app.includes('Uncertain writes are never retried'),'no mutation auto-retry on uncertain submission');
for(const name of ['info','success','warning','error'])
 ok(app.includes("setStatus('"+name+"'"),'message state exists: '+name);
ok(shared.includes('.stage-system-message--success{')&&
 shared.includes('background:#eaf6ed'),'success has green background');
ok(shared.includes('.stage-system-message--warning:not(:empty)')&&
 !shared.includes('message:not(.stage-system-message--info):not('),
 'warnings only show warning emoji, never success or neutral');
ok(shared.includes('content:"⚠️"')&&shared.includes('content:"❌"')&&
 shared.includes('content:"✅"'),'warning/error/success icons grounded in semantic types');
ok(shared.includes('stage-inline-read-loading::before')&&
 shared.includes('animation:stage-ui-spin'),'blue loading has animated spinner');
ok(app.includes("setStatus('info','利用申請状況を読み込んでいます…',true)")&&
 app.includes("setStatus('success','利用登録済みです。')"),
 'registration read spinner is active; approved registration is green');
ok(app.includes("setStatus('warning','利用停止中です。管理者に確認してください。')")&&
 app.includes("setStatus('error',message)"),'inactive member warns and errors show red');
ok(!/検証用|stageRegistration/i.test(html),'production-oriented standalone page has no test-only labeling');
ok(css.includes('registration-shell')&&html.includes('registrationName')&&html.includes('registrationKana'),
 'mobile-ready form preserves name-kana workflow');
console.log('PASS '+checks+'/'+checks+' standalone LIFF registration and four-state status semantics');
