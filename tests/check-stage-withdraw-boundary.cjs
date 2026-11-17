#!/usr/bin/env node
'use strict';
// Non-destructive regression gate for the connected staging front end.
// Intentionally strict until staged withdrawal integration is separately reviewed.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=x=>fs.readFileSync(path.join(root,x),'utf8');
const files=['live-access-v2.js','live-access.js','live.html','access-v2-mode.js','runtime-config.js'];
const forbidden=['M-TEST-WITHDRAW-1630','M-c5825d7f-4ed3-448f-92b0-1da62c248b4e',
 '1yCYfmQ73Qnice0g43aad-UB_ceEmkDJN5GbA3qzbLDM','isolated-withdrawal-reuse-v1630',
 'zenryoku-smash-withdraw-sandbox-api.hitori-ojisan-52.workers.dev'];
let n=0;const expect=(valid,label)=>{if(!valid)throw new Error('STAGING BOUNDARY FAIL: '+label);n++;};
for(const file of files){
 const content=read(file);
 for(const value of forbidden)expect(!content.includes(value),file+' contains dedicated sandbox identifier');
 expect(!/api\s*\(\s*['"]\/api\/member\/manage\/withdraw['"]\s*,/.test(content),
   file+' may issue a real withdrawal mutation');
}
const management=read('live-access-v2.js');
expect(management.includes("'/api/member/manage/withdraw/check'"),'read-only condition check missing');
expect(management.includes('renderHistory('),'history rendering missing');
const config=read('runtime-config.js');
expect(config.includes('https://zenryoku-smash-staging-api.hitori-ojisan-52.workers.dev'),
 'stage Worker host changed unexpectedly');
expect(!config.includes('GAS_SHARED_SECRET'),'secret key name should not be in public front-end');
console.log('PASS '+n+'/'+n+' stage withdrawal isolation checks');