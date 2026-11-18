#!/usr/bin/env node
'use strict';
// v0.16.53 — user-authorized withdrawal on the CONNECTED TEST workbook.
// Continue rejecting earlier isolated sandbox identifiers and protect
// production with exact staging ID + double backend environment flags.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const files=['live-access-v2.js','live-access.js','live.html','access-v2-mode.js','runtime-config.js'];
const forbidden=['M-TEST-WITHDRAW-1630','M-c5825d7f-4ed3-448f-92b0-1da62c248b4e',
 '1yCYfmQ73Qnice0g43aad-UB_ceEmkDJN5GbA3qzbLDM','isolated-withdrawal-reuse-v1630',
 'zenryoku-smash-withdraw-sandbox-api.hitori-ojisan-52.workers.dev'];
let n=0;const expect=(v,s)=>{if(!v)throw Error('WITHDRAW BOUNDARY FAIL: '+s);n++;};
for(const file of files){
 const content=read(file);
 for(const value of forbidden)expect(!content.includes(value),file+' cannot reuse isolated sandbox identifier');
}
const management=read('live-access-v2.js'),
 gas=read('gas-staging/AccessAndGuestV160.gs'),
 worker=read('cloudflare-worker/worker.js'),
 config=read('runtime-config.js');
expect(management.includes("'/api/member/manage/withdraw/check'"),
 'read-only condition check retained');
expect(management.includes('renderHistory('),'history rendering retained');
expect((management.match(/mutate\('\/api\/member\/manage\/withdraw',/g)||[]).length===1,
 'exactly one admin UI mutation call: no duplicate send');
expect(management.includes("const confirmed=await ask({title:'【退会確認】'")&&
 !management.includes('【退会確認（2/2）】'),
 'single concise withdrawal confirmation required');
expect(management.includes("snapshot.withdrawEnabled!==true"),
 'withdraw action disabled until both server gates agree');
expect(management.includes('withdrawMember(m)')&&
 management.includes('!data.members.some(x=>x.memberId===m.memberId)'),
 'selected member control verifies disappearance after save');
expect(gas.includes("SMA_STAGE_WITHDRAW_ID_V1636='1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac'")&&
 gas.includes("conf_('SPREADSHEET_ID')!==SMA_STAGE_WITHDRAW_ID_V1636"),
 'GAS is tied to exact connected staging workbook, not production');
expect(gas.includes("conf_('WITHDRAW_ENABLED')!=='true'")&&
 gas.includes("SMA_STAGE_WITHDRAW_PURPOSE_V1636='staging-member-withdraw-v1653'"),
 'GAS remains explicitly opt-in and purpose-specific');
expect(worker.includes("env.WITHDRAW_STAGE_SPREADSHEET_ID==='1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac'")&&
 worker.includes("env.WITHDRAW_ENABLED==='true'")&&
 worker.includes("env.WORKER_PURPOSE==='staging-member-withdraw-v1653'"),
 'Worker independently requires stage workbook, flag and purpose');
expect(worker.includes("result.data.withdrawEnabled=result.data.withdrawEnabled===true&&withdrawAtEdge"),
 'only both enabled backend gates can enable UI');
expect(gas.includes('accessAdmin16_(member)')&&
 gas.includes("if(!bool_(target[3])||bool_(target[4]))fail_('FORBIDDEN'"),
 'admin-only withdrawal never touches stopped/admin members');
expect(gas.includes("if(id===str_(member.memberId))fail_('FORBIDDEN'")&&
 gas.includes("history.appendRow([id,safeCell_(str_(target[1]))"),
 'cannot self-withdraw and archives status before deletion');
expect(gas.includes("conf_('STAGING_WITHDRAW_PURPOSE')")&&
 !gas.includes("SMA_STAGE_SYNTHETIC_ID_RE_V1636"),
 'no obsolete single synthetic member allowlist on authorized test data');
expect(config.includes('https://zenryoku-smash-staging-api.hitori-ojisan-52.workers.dev'),
 'stage Worker host unchanged');
expect(!config.includes('GAS_SHARED_SECRET'),
 'public frontend does not contain private secrets');
console.log('PASS '+n+'/'+n+' stage withdrawal user authorization and strong boundary guards');
