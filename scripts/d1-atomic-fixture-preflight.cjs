#!/usr/bin/env node
'use strict';
/**
 * Phase14: Cloudflare D1 pricing/account preflight. READ-ONLY GET ONLY.
 *
 * Never create databases, POST, delete, import data, deploy Workers, bind
 * D1 or read sheet content. A configured D1 Edit token is scoped to the
 * existing staging account; any missing billing visibility fails closed.
 *
 * "Safe under the Free-plan database count" is not proof of a Free plan.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');

const ACCOUNT = '5817f07a73dbb56011012074ce1b11c5';
const BASE = 'zenryoku-smash-staging-d1';
const FIXTURE = 'zenryoku-smash-d1-atomic-fixture-stage';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const COUNT_LIMIT_FREE = 10;
const MAX_STORAGE_THRESHOLD = 4 * 1024 * 1024 * 1024; // < 5 GB Free account storage
const TIMEOUT_MS = 12000;

function outcome({dbList, baseUuid, billing}) {
  const issues = [];
  if (!Array.isArray(dbList) || dbList.length === 0 ||
      dbList.length > 99 || dbList.some(d => !d || typeof d !== 'object')) {
    return {ready: false, status: 'INVALID_DATABASE_LIST',
            databaseCount: null, plan: 'unverified'};
  }
  const foundBase = dbList.filter(d => d.name === BASE);
  const foundTarget = dbList.filter(d => d.name === FIXTURE);
  if (foundBase.length !== 1 ||
      String(foundBase[0].uuid || '').toLowerCase() !== baseUuid.toLowerCase()) {
    issues.push('BASELINE_D1_MISMATCH');
  }
  if (foundTarget.length !== 0) {
    issues.push('FIXTURE_DB_ALREADY_EXISTS_STOP');
  }
  if (dbList.length >= COUNT_LIMIT_FREE) {
    issues.push('FREE_DB_COUNT_CAPACITY_EXHAUSTED');
  }
  if (dbList.some(d => typeof d.name !== 'string' ||
      !UUID.test(String(d.uuid || '')) ||
      (d.file_size !== undefined && (!Number.isSafeInteger(d.file_size) ||
        d.file_size < 0)))) {
    issues.push('INVALID_DB_RECORD');
  }
  const storageKnown = dbList.every(d =>
    Number.isSafeInteger(d.file_size) && d.file_size >= 0);
  const storage = storageKnown ?
    dbList.reduce((sum, d) => sum + d.file_size, 0) : null;
  if (!storageKnown || storage >= MAX_STORAGE_THRESHOLD) {
    issues.push('ACCOUNT_STORAGE_UNVERIFIED_OR_HIGH');
  }

  // Cloudflare Billing Read is normally NOT included in a D1 Edit-only token.
  // We do not infer that missing Workers Paid subscription means Free.
  const planIds = billing && billing.success === true && Array.isArray(billing.result) ?
    billing.result.map(sub => String(sub?.rate_plan?.id || '').toUpperCase()) : [];
  const workersFree = planIds.includes('WORKERS_FREE');
  const workersPaid = planIds.includes('WORKERS_PAID');
  if (!workersFree || workersPaid) {
    issues.push(workersPaid ?
      'WORKERS_PAID_BILLING_REVIEW_REQUIRED' : 'WORKERS_FREE_PLAN_NOT_PROVEN');
  }
  return {
    ready: issues.length === 0,
    status: issues.length ? issues.join('|') : 'VERIFIED_FREE_CAPACITY_ONLY',
    databaseCount: dbList.length,
    plan: workersFree && !workersPaid ? 'Workers Free evidenced' :
      (workersPaid ? 'Workers Paid - stop' : 'unverified'),
  };
}

function validateEnvironment(env) {
  assert.equal(env.GITHUB_REPOSITORY, 'hitoriojisan52/zenryoku-smash-staging',
    'Unexpected repository');
  assert.equal(env.GITHUB_REF, 'refs/heads/main',
    'Only main may query staging D1');
  assert.equal(String(env.D1_STAGE_ACCOUNT_ID || '').toLowerCase(),
    ACCOUNT, 'Unexpected Cloudflare account');
  assert.match(env.D1_STAGE_DATABASE_ID || '', UUID,
    'Existing stage database UUID missing');
  if (!env.D1_STAGE_API_TOKEN) return false;
  return true;
}

async function requestJSON(path, token, timeoutMs = TIMEOUT_MS) {
  const url = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT + path;
  const response = await fetch(url, {
    method: 'GET', redirect: 'error',
    headers: {'Authorization': 'Bearer ' + token,
      'Accept': 'application/json'},
    signal: AbortSignal.timeout(timeoutMs),
  });
  // Never expose the raw Cloudflare error body, which may contain metadata.
  if (!response.ok) return {http: response.status, body: null};
  const body = await response.json();
  return {http: response.status, body};
}

function summary(obj) {
  return [
    '## D1 Phase14 read-only account and billing preflight',
    'This workflow executes **GET only**, creates NO database and writes NO rows.',
    'Current database count: ' +
       (obj.databaseCount === null ? 'unverified' : obj.databaseCount),
    'Free plan count threshold: < 10 existing databases before one isolated new DB.',
    'Workers plan: ' + obj.plan,
    'Next remote create authorization: **' + (obj.ready ? 'NOT PERFORMED; requires subsequent safe gate' : 'BLOCKED') + '**',
    'Status: ' + obj.status.replaceAll('|', ', '),
    'No IDs, tokens, subscription details or personal records were emitted.',
  ].join('\n') + '\n';
}

function writeReport(obj, env) {
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, 'ready=' +
    (obj.ready ? 'true' : 'false') + '\n');
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY,
    summary(obj));
  console.log('D1 read-only billing/capacity preflight:',
    obj.ready ? 'ELIGIBLE_FOR_SEPARATELY_GATED_CREATE' : 'BLOCKED');
  console.log('Status codes:', obj.status);
  console.log('Existing D1 database count:',
    obj.databaseCount === null ? 'unknown' : obj.databaseCount);
}

async function preflight(env = process.env) {
  if (!validateEnvironment(env)) {
    const r = {ready: false, status: 'MISSING_D1_STAGE_SECRET',
      databaseCount: null, plan: 'unverified'};
    writeReport(r, env);
    return r;
  }
  const token = env.D1_STAGE_API_TOKEN;
  let list;
  try {
    list = await requestJSON('/d1/database?per_page=100&page=1', token);
  } catch (_) {
    const x = {ready: false, status: 'D1_LIST_NETWORK_UNAVAILABLE',
      databaseCount: null, plan: 'unverified'};
    writeReport(x, env);
    return x;
  }
  if (list.http !== 200 || !list.body?.success ||
      !Array.isArray(list.body.result) ||
      (list.body.result_info?.total_pages > 1)) {
    const x = {ready: false, status: 'D1_LIST_NOT_FULLY_VERIFIED',
      databaseCount: null, plan: 'unverified'};
    writeReport(x, env);
    return x;
  }
  let billing = null;
  try {
    const result = await requestJSON('/subscriptions', token);
    if (result.http === 200 && result.body?.success) billing = result.body;
  } catch (_) { /* Billing scope unavailable is not authorization. */ }
  const result = outcome({dbList: list.body.result,
    baseUuid: env.D1_STAGE_DATABASE_ID, billing});
  writeReport(result, env);
  return result;
}

function selfTest() {
  const id1 = '11111111-2222-4333-8444-555555555555',
        id2 = '22222222-2222-4333-8444-555555555555';
  const base = [{name: BASE, uuid: id1, file_size: 4096}];
  const free = {success:true, result:[{rate_plan:{id:'WORKERS_FREE'}}]};
  const paid = {success:true, result:[{rate_plan:{id:'WORKERS_PAID'}}]};
  const run = (l,b)=>outcome({dbList:l,baseUuid:id1,billing:b});
  assert.equal(run(base,free).ready,true);
  assert.equal(run(base,null).ready,false);
  assert.match(run(base,null).status,/WORKERS_FREE_PLAN_NOT_PROVEN/);
  assert.equal(run(base,paid).ready,false);
  assert.match(run(base,paid).status,/BILLING_REVIEW_REQUIRED/);
  assert.equal(run([{name:BASE,uuid:id2,file_size:0}],free).ready,false);
  assert.equal(run([...base,{name:FIXTURE,uuid:id2,file_size:0}],free).ready,false);
  assert.equal(run([...base,{name:'OTHER',uuid:id2}],free).ready,false);
  const large = [...base];
  for(let i=1;i<10;i++){
    large.push({name:'TEST-'+i,
      uuid:(10000000+i).toString(16)+'-2222-4333-8444-555555555555',
      file_size:4096});
  }
  assert.match(run(large,free).status,/FREE_DB_COUNT_CAPACITY_EXHAUSTED/);
  assert.equal(run([{...base[0],file_size:MAX_STORAGE_THRESHOLD}],free).ready,false);
  assert.throws(()=>validateEnvironment({GITHUB_REPOSITORY:'other/repo',
    GITHUB_REF:'refs/heads/main',D1_STAGE_ACCOUNT_ID:ACCOUNT,
    D1_STAGE_DATABASE_ID:id1,D1_STAGE_API_TOKEN:'fixture'}));
  assert.throws(()=>validateEnvironment({GITHUB_REPOSITORY:'hitoriojisan52/zenryoku-smash-staging',
    GITHUB_REF:'refs/heads/feature',D1_STAGE_ACCOUNT_ID:ACCOUNT,
    D1_STAGE_DATABASE_ID:id1,D1_STAGE_API_TOKEN:'fixture'}));
  assert.equal(summary(run(base,null)).includes(id1),false);
  assert.equal(summary(run(base,null)).includes(ACCOUNT),false);
  console.log('PASS: D1 preflight fail closed for billing, count, UUID and repository; no remote I/O');
}

if (require.main === module) {
  if (process.argv[2] === 'self-test') selfTest();
  else if (process.argv[2] === 'preflight') preflight().catch(_ => {
    console.log('BLOCKED: D1 preflight was unable to complete; no writes');
    process.exitCode = 1;
  });
  else {
    console.error('Usage: self-test | preflight');
    process.exitCode = 1;
  }
}

module.exports = {outcome,validateEnvironment,summary};
