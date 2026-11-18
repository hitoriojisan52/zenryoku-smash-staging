#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path'),root=path.resolve(__dirname,'..');
const read=x=>fs.readFileSync(path.join(root,x),'utf8');
let checks=0;
function ok(v,msg){assert.ok(v,msg);checks++;}
const core=read('gas-staging/コード.gs'),access=read('gas-staging/AccessAndGuestV160.gs'),
  guard=read('scripts/gas-staging-guard.cjs'),
  action=read('.github/workflows/gas-staging.yml'),
  apply=read('scripts/gas-staging-deploy.sh');
for(const [name,source] of [['core',core],['access',access]]){
 new vm.Script(source,{filename:name+'.gs'});ok(true,name+' parses as Apps Script V8');
}
ok(core.includes('function ledgerDate_'),'typed-Date ledger normalization');
ok(core.includes('function checkLedgerConsistencyInNewSystem'),'read-only ledger consistency preflight');
ok(core.includes('TEST-20261116')||core.includes('STAGING ONLY COMBINED BUNDLE'),'reviewed stage finance core');
ok(access.includes('logStageWithdrawPreflightV1636'),'stage withdrawal read-only preflight');
ok(access.includes("STAGING_WITHDRAW_PURPOSE"),'withdraw purpose gate');
ok(access.includes("WITHDRAW_TEST_MEMBER_ID"),'synthetic target gate');
ok(access.includes('1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac'),'exact connected staging workbook');
ok(guard.includes("mode==='verify'"),'verify pulled sources after push');
ok(guard.includes('Remote GAS was edited outside reviewed Git history'),'fail on unreviewed remote changes');
ok(apply.includes('clasp pull'),'pull before overwriting');
ok(apply.includes('clasp push --force'),'push reviewed overlay only');
ok(apply.includes('clasp update-deployment'),'update existing deployment, not a new one');
ok(!/clasp create-deployment|clasp create-script|clasp delete-deployment/.test(apply),'cannot create or delete deployment');
ok(apply.includes('UPDATE_EXISTING_STAGING_GAS'),'explicit confirmation before write');
ok(action.includes("github.event_name == 'workflow_dispatch' || github.event_name == 'push'"),'staging auto deploy enabled for main push');
ok(action.includes("github.ref == 'refs/heads/main'"),'branch is restricted to main');
ok(action.includes("environment: staging-gas"),'staging environment isolation');
ok(action.includes("'.github/workflows/gas-staging.yml'"),'auto deploy bootstrapped by approved workflow revision');
ok(!action.includes('gas-production'), 'staging workflow has no production target');
ok(action.includes('workflow_dispatch:'),'explicit manual run mode');
ok(action.includes("'gas-staging/*.gs'"),'auto deployment limited to GAS source code changes');
ok(action.includes('GAS_STAGE_CLASPRC_JSON: ${{ secrets.GAS_STAGE_CLASPRC_JSON }}'),'OAuth credentials only from GitHub Secrets');
ok(!fs.existsSync(path.join(root,'gas-staging','.clasp.json')),'Script ID not committed as .clasp.json');
ok(!fs.existsSync(path.join(root,'gas-staging','appsscript.json')),'unknown remote manifest must remain remote-only');
ok(!fs.existsSync(path.join(root,'.clasprc.json')),'OAuth JSON not committed');
console.log('PASS '+checks+'/'+checks+' staging GAS GitHub CI/CD safety checks');
