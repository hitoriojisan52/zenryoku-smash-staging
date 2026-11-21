#!/usr/bin/env node
'use strict';
// One bounded Cloudflare Worker concurrency probe, synthetic-only.
// This script does not call Cloudflare REST SQL or modify any existing D1 row.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {parseUrl}=require('./d1-phase15-native-worker.cjs');
const WORKER='zenryoku-smash-d1-atomic-fixture-worker-stage';
const MAX_HTTP=18;
let requestCount=0;
const ID=/^phase16-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-case$/;
function validUrl(url){
  assert.equal(new URL(url).origin,url);
  assert.equal(parseUrl('Deployed '+url),url);
  assert.equal(new URL(url).hostname.startsWith(WORKER+'.'),true);
}
async function run(urlFile,tokenFile,env=process.env){
  assert.equal(env.GITHUB_REPOSITORY,'hitoriojisan52/zenryoku-smash-staging');
  assert.equal(env.GITHUB_REF,'refs/heads/main');
  assert.equal(env.GITHUB_EVENT_NAME,'push');
  const url=fs.readFileSync(urlFile,'utf8').trim();
  const token=fs.readFileSync(tokenFile,'utf8').trim();
  validUrl(url);
  assert.match(token,/^[A-Za-z0-9_-]{32,128}$/);
  async function post(endpoint,body,authenticated=true){
    assert.ok(++requestCount<=MAX_HTTP,'HTTP_REQUEST_BUDGET_EXCEEDED');
    const response=await fetch(url+endpoint,{
      method:'POST',redirect:'error',
      headers:{...(authenticated?{Authorization:'Bearer '+token}:{}),
        ...(body===undefined?{}:{'Content-Type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
      signal:AbortSignal.timeout(20000)
    });
    const result=await response.json();
    assert.ok(result&&typeof result==='object');
    return {status:response.status,body:result};
  }
  async function seed(){
    const r=await post('/native/concurrent/seed');
    assert.equal(r.status,200,'PHASE16_SEED_FAILED');
    assert.equal(r.body.ok,true);
    assert.match(r.body.probeId,ID);
    return r.body.probeId;
  }
  const t1=await seed();
  const opA=crypto.randomUUID(),opB=crypto.randomUUID();
  const [a,b]=await Promise.all([
    post('/native/concurrent/cas',{probeId:t1,operationId:opA,expectedVersion:0}),
    post('/native/concurrent/cas',{probeId:t1,operationId:opB,expectedVersion:0})
  ]);
  assert.equal(a.status,200,'FIRST_CONCURRENT_CAS_HTTP_ERROR');
  assert.equal(b.status,200,'SECOND_CONCURRENT_CAS_HTTP_ERROR');
  assert.deepEqual([a.body.applied,b.body.applied].sort(),[false,true],
    'CAS_MUST_HAVE_EXACTLY_ONE_WINNER');
  assert.ok(!a.body.replayed&&!b.body.replayed);
  const winner=a.body.applied?opA:opB;
  const replay=await post('/native/concurrent/cas',{probeId:t1,operationId:winner,expectedVersion:0});
  assert.deepEqual(replay,{status:200,body:{ok:true,applied:true,replayed:true}},
    'LOST_RESPONSE_REPLAY_RESULT_CHANGED');
  const stale=await post('/native/concurrent/cas',
    {probeId:t1,operationId:crypto.randomUUID(),expectedVersion:0});
  assert.deepEqual(stale,{status:200,body:{ok:true,applied:false,replayed:false}});
  const st1=await post('/native/concurrent/state',{probeId:t1});
  assert.deepEqual(st1,{status:200,body:{ok:true,version:1,operationCount:1}},
    'CONCURRENT_CAS_FINAL_VERSION_NOT_ONE');

  const t2=await seed(),sameOp=crypto.randomUUID();
  const twins=await Promise.all([
    post('/native/concurrent/cas',{probeId:t2,operationId:sameOp,expectedVersion:0}),
    post('/native/concurrent/cas',{probeId:t2,operationId:sameOp,expectedVersion:0})
  ]);
  assert.ok(twins.every(x=>x.status===200&&x.body.applied===true),
    'SAME_ID_MUST_REPLAY_SUCCESS');
  assert.deepEqual(twins.map(x=>x.body.replayed).sort(),[false,true],
    'SAME_ID_EXPECTS_ONE_NEW_ONE_REPLAY');
  const st2=await post('/native/concurrent/state',{probeId:t2});
  assert.deepEqual(st2,{status:200,body:{ok:true,version:1,operationCount:1}});
  const t3=await seed();
  const misused=await post('/native/concurrent/cas',
    {probeId:t3,operationId:sameOp,expectedVersion:0});
  assert.deepEqual(misused,{status:409,body:{ok:false,code:'OPERATION_ID_REUSED'}},
    'OPERATION_ID_REUSE_MUST_NOT_CROSS_TARGETS');
  const st3=await post('/native/concurrent/state',{probeId:t3});
  assert.deepEqual(st3,{status:200,body:{ok:true,version:0,operationCount:0}});
  const unauth=await post('/native/concurrent/seed',undefined,false);
  assert.equal(unauth.status,401,'UNAUTH_REQUEST_NOT_DENIED');
  const invalid=await post('/native/concurrent/cas',{probeId:'not-a-fixture',operationId:sameOp,expectedVersion:0});
  assert.equal(invalid.status,400,'MALFORMED_REQUEST_NOT_DENIED');
  console.log('PHASE16_REAL_CONCURRENT_PASS: 2 distinct contenders one winner; same-operation retry exactly once; stale CAS blocked; target reuse refused; auth+validation');
  if(env.GITHUB_STEP_SUMMARY)fs.appendFileSync(env.GITHUB_STEP_SUMMARY,
    '## Phase16 independent HTTP concurrency on synthetic-only D1\nPASS: distinct CAS exactly one winner, same operationId replay, rejected stale and cross-target reuse, 3 case states and access control. No business rows written.\n');
}
function selfTest(){
  const url='https://'+WORKER+'.account.workers.dev';
  validUrl(url);
  assert.throws(()=>validUrl('https://zenryoku-smash-staging-api.account.workers.dev'));
  assert.throws(()=>validUrl(url+'.evil.test'));
  assert.match('phase16-'+crypto.randomUUID()+'-case',ID);
  assert.throws(()=>validUrl('http://'+WORKER+'.account.workers.dev'));
  console.log('PASS: Phase16 HTTPS exact Worker and bounded fabricated ID client guards');
}
if(require.main===module){
  if(process.argv[2]==='self-test')selfTest();
  else if(process.argv[2]==='run'&&process.argv[3]&&process.argv[4])
    run(process.argv[3],process.argv[4]).catch(_=>{
      // Avoid exposing response bodies or secret/material in public CI errors.
      console.error('PHASE16_BLOCKED: REMOTE_CONCURRENCY_INVARIANT_FAILED');
      process.exitCode=1;
    });
  else throw Error('Usage: self-test | run <worker-url-file> <private-token-file>');
}
module.exports={validUrl};
