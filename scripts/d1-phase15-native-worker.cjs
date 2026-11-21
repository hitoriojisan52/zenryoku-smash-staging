#!/usr/bin/env node
'use strict';
// Phase15 D1 Native Worker: never deploy to an unverified Worker or D1.
// Cloudflare D1 read-only preflight, followed by separate worker ownership gate.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {checkIdentity,compare,sourceSQL,fixtureSQL}=require('./d1-phase14-readonly-postcheck.cjs');
const ACCOUNT='5817f07a73dbb56011012074ce1b11c5';
const WORKER='zenryoku-smash-d1-atomic-fixture-worker-stage';
const FIXTURE='zenryoku-smash-d1-atomic-fixture-stage';
const MARKER='ZENRYOKU_D1_NATIVE_FIXTURE_STAGE_REPO_20261121';
const BASE='zenryoku-smash-staging-d1';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const CONFIG=path.resolve(__dirname,'../d1-staging/native-fixture/.wrangler.native.runtime.json');

function verifyEnv(e){
  assert.equal(e.GITHUB_REPOSITORY,'hitoriojisan52/zenryoku-smash-staging','WRONG_REPO');
  assert.equal(e.GITHUB_REF,'refs/heads/main','NOT_MAIN');
  assert.equal(e.GITHUB_EVENT_NAME,'push','NOT_PUSH');
  assert.equal(e.CLOUDFLARE_ACCOUNT_ID,ACCOUNT,'WRONG_CF_ACCOUNT');
  assert.equal(e.D1_STAGE_ACCOUNT_ID,ACCOUNT,'WRONG_D1_ACCOUNT');
  assert.match(e.D1_STAGE_DATABASE_ID||'',UUID,'BASE_UUID_MISSING');
  assert.ok(e.D1_STAGE_API_TOKEN,'D1_READONLY_TOKEN_MISSING');
}

async function cf(pathSuffix,token,body){
  assert.ok((!body&&pathSuffix==='/d1/database?per_page=100&page=1')||
    (body&&/^\/d1\/database\/[a-f0-9-]{36}\/query$/.test(pathSuffix)&&
      /^SELECT /i.test(body.sql)&&!body.sql.includes(';')),'UNAPPROVED_CF_REQUEST');
  const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+pathSuffix,{
    method:body?'POST':'GET',redirect:'error',
    headers:{Authorization:'Bearer '+token,Accept:'application/json',
      ...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(20000)
  });
  let json;try{json=await res.json();}catch(_){}
  assert.ok(res.ok&&json?.success===true,'CF_READONLY_FAILED');
  return json;
}
function singleRow(json){
  assert.equal(json?.result?.length,1);
  assert.equal(json.result[0]?.success,true);
  assert.equal(json.result[0]?.results?.length,1);
  return json.result[0].results[0];
}
function config(databaseId){
  assert.match(databaseId,UUID);
  return {
    name:WORKER,
    main:'worker.mjs',
    compatibility_date:'2026-11-16',
    workers_dev:true,
    preview_urls:false,
    keep_vars:true,
    vars:{NATIVE_FIXTURE_ENABLED:'true',NATIVE_CONCURRENCY_ENABLED:'true',NATIVE_APPROVED_MATCH_ENABLED:'true',NATIVE_SYNTHETIC_MATCH19_ENABLED:'true'},
    d1_databases:[{binding:'ZENRYOKU_FIXTURE_DB',
      database_name:FIXTURE,database_id:databaseId.toLowerCase()}]
  };
}
function ownership(status,body){
  if(status===404) throw Error('FIRST_CREATE_WORKER_STUB_IN_CLOUDFLARE_DASHBOARD');
  assert.equal(status,200,'WORKER_READ_FOR_OWNERSHIP_FAILED');
  assert.ok(typeof body==='string'&&body.length>0&&body.length<200000);
  if(body.includes(MARKER))return 'ours';
  const s=body.trim();
  assert.ok(s.length<12000,'STARTER_TOO_LARGE');
  assert.match(s,/export\s+default\s*\{/);
  assert.match(s,/new\s+Response\s*\(/);
  assert.match(s,/Hello\s+(?:World|Worker)!?/i);
  assert.doesNotMatch(s,/\b(?:GAS_WEB_APP_URL|LINE_LOGIN|D1_STAGE|ZENRYOKU_STAGE_DB|ZENRYOKU_FIXTURE_DB|Bearer|sharedSecret|fetch\s*\(\s*['"]https?:)/i);
  return 'starter';
}
function parseUrl(output){
  const seen=[...output.matchAll(/https:\/\/[^\s"'<>]+/g)]
    .map(x=>x[0].replace(/[),;]+$/,'')).map(x=>{try{return new URL(x)}catch(_){return null}})
    .filter(x=>x&&x.hostname.startsWith(WORKER+'.'));
  assert.ok(seen.length,'WORKER_DEPLOY_URL_MISSING');
  const origins=seen.map(u=>{
    assert.equal(u.protocol,'https:');
    assert.equal(u.port,'');
    assert.match(u.hostname.slice(WORKER.length+1),/^[a-z0-9-]+\.workers\.dev$/);
    return u.origin;
  });
  assert.equal(new Set(origins).size,1,'WORKER_URL_AMBIGUOUS');
  return origins[0];
}
async function prepare(e=process.env){
  verifyEnv(e);
  const original=e.D1_STAGE_DATABASE_ID.toLowerCase();
  const response=await cf('/d1/database?per_page=100&page=1',e.D1_STAGE_API_TOKEN);
  assert.ok(Array.isArray(response.result)&&!(response.result_info?.total_pages>1));
  const fixtureId=checkIdentity(response.result,original);
  // Phase14's independent original-zero and synthetic-only fixture count checks.
  const before=singleRow(await cf('/d1/database/'+original+'/query',
    e.D1_STAGE_API_TOKEN,{sql:sourceSQL()}));
  const isolated=singleRow(await cf('/d1/database/'+fixtureId+'/query',
    e.D1_STAGE_API_TOKEN,{sql:fixtureSQL()}));
  compare(before,isolated);
  const c=config(fixtureId);
  assert.equal(c.d1_databases.length,1);
  assert.notEqual(c.d1_databases[0].database_id,original);
  assert.notEqual(c.name,'zenryoku-smash-staging-api');
  assert.notEqual(c.name,'zenryoku-smash-d1-pilot-stage');
  fs.writeFileSync(CONFIG,JSON.stringify(c,null,2)+'\n',{mode:0o600});
  console.log('PREDEPLOY_READ_ONLY_PASS: old D1 empty and separate generated-only D1 identified');
}

async function verifyOwnership(){
  assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,ACCOUNT);
  const token=process.env.CLOUDFLARE_API_TOKEN;
  assert.ok(token&&token.length>=20,'NATIVE_WORKER_EDITOR_TOKEN_REQUIRED');
  const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/workers/scripts/'+WORKER,{
    headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)
  });
  let source='';
  if(r.status===200){
    if(Number(r.headers.get('content-length')||0)>200000)throw Error('WORKER_SOURCE_TOO_LARGE');
    source=await r.text();
  }
  const kind=ownership(r.status,source);
  console.log('PASS: ownership checked for Phase15 Worker only ('+kind+')');
}

async function probe(urlFile,tokenFile){
  const url=fs.readFileSync(urlFile,'utf8').trim();
  const token=fs.readFileSync(tokenFile,'utf8').trim();
  assert.equal(new URL(url).origin,url);
  assert.equal(parseUrl('Deployed '+url),url);
  assert.match(token,/^[A-Za-z0-9_-]{32,128}$/);
  let requests=0;
  async function hit(route,method,authenticated){
    assert.ok(++requests<=6);
    const r=await fetch(url+route,{
      method,redirect:'error',
      headers:authenticated?{Authorization:'Bearer '+token}:{},
      signal:AbortSignal.timeout(20000)
    });
    const j=await r.json();
    return {status:r.status,data:j};
  }
  assert.equal((await hit('/native/health','GET',false)).status,401);
  assert.equal((await hit('/native/health','GET',true)).status,200);
  assert.equal((await hit('/api/overview','GET',true)).status,404);
  assert.equal((await hit('/native/run','GET',true)).status,405);
  const {status,data}=await hit('/native/run','POST',true);
  assert.equal(status,200,'NATIVE_WORKER_BATCH_TEST_FAILED');
  assert.equal(data.ok,true);
  assert.deepEqual(data.results,{
    nativeBatchRollback:true,nativeBatchCommit:true,
    idempotentReplay:true,casSingleWinner:true
  });
  console.log('NATIVE_D1_WORKER_PASS: auth gates; native batch rollback+commit; replay; CAS (one isolated run)');
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '## Phase15 native Worker test\nAll PASS: old Worker untouched; isolated D1 native batch failure rollback, commit, replay, CAS.\n');
}

function selfTest(){
  const u='11111111-2222-4333-8444-555555555555';
  const v='22222222-2222-4333-8444-555555555555';
  assert.equal(checkIdentity([{name:BASE,uuid:u},{name:FIXTURE,uuid:v}],u),v);
  assert.equal(config(v).d1_databases[0].database_id,v);
  assert.equal(config(v).d1_databases.length,1);
  assert.notEqual(WORKER,'zenryoku-smash-staging-api');
  assert.notEqual(WORKER,'zenryoku-smash-d1-pilot-stage');
  assert.throws(()=>config(u.slice(1)));
  assert.throws(()=>ownership(404,''));
  assert.equal(ownership(200,"export default {async fetch(){return new Response('Hello World!')}}"),'starter');
  assert.throws(()=>ownership(200,"export default {async fetch(){return fetch('https://bad.example')}}"));
  assert.equal(ownership(200,'// '+MARKER+'\nexport default {}'),'ours');
  assert.throws(()=>ownership(403,''));
  const ok='https://'+WORKER+'.account.workers.dev';
  assert.equal(parseUrl('Deployed '+ok),ok);
  assert.throws(()=>parseUrl(ok+'.evil.example'));
  assert.throws(()=>parseUrl('https://zenryoku-smash-staging-api.account.workers.dev'));
  assert.throws(()=>verifyEnv({}));
  console.log('PASS: Phase15 Worker & D1 name/UUID, ownership, allowlisted URL, fail-closed gates');
}
async function main(){
  const action=process.argv[2];
  if(action==='self-test')return selfTest();
  if(action==='prepare')return prepare();
  if(action==='verify-ownership')return verifyOwnership();
  if(action==='extract-url'){
    assert.ok(process.argv[3]&&process.argv[4]);
    fs.writeFileSync(process.argv[4],parseUrl(fs.readFileSync(process.argv[3],'utf8'))+'\n',{mode:0o600});
    return console.log('PASS: Phase15 Worker URL validated');
  }
  if(action==='probe'){
    assert.ok(process.argv[3]&&process.argv[4]);
    return probe(process.argv[3],process.argv[4]);
  }
  throw Error('Usage: self-test|prepare|verify-ownership|extract-url <log> <out>|probe <urlfile> <tokenfile>');
}
if(require.main===module)main().catch(e=>{
  // Only controlled error codes; never return remote bodies, tokens, IDs or SQL.
  const m=String(e?.message||'failure');
  console.error('PHASE15_BLOCKED: '+(m.length<140&&/^[A-Z0-9_ :().=-]+$/.test(m)?m:'SAFETY_GATE_OR_REMOTE_FAILURE'));
  process.exitCode=1;
});
module.exports={config,ownership,parseUrl,verifyEnv};
