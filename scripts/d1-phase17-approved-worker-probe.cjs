#!/usr/bin/env node
'use strict';
// One bounded synthetic-only phase17 real Worker+native D1 atomic match test.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {parseUrl}=require('./d1-phase15-native-worker.cjs');
const WORKER='zenryoku-smash-d1-atomic-fixture-worker-stage';
const CASE=/^phase17-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-match$/;
const MAX_CALLS=18;
let calls=0;
async function run(urlFile,tokenFile,env=process.env){
  assert.equal(env.GITHUB_REPOSITORY,'hitoriojisan52/zenryoku-smash-staging');
  assert.equal(env.GITHUB_REF,'refs/heads/main');
  assert.equal(env.GITHUB_EVENT_NAME,'push');
  const url=fs.readFileSync(urlFile,'utf8').trim();
  const token=fs.readFileSync(tokenFile,'utf8').trim();
  assert.equal(new URL(url).origin,url);
  assert.equal(parseUrl('Deployed '+url),url);
  assert.ok(new URL(url).hostname.startsWith(WORKER+'.'));
  assert.match(token,/^[A-Za-z0-9_-]{32,128}$/);
  async function post(path,data,authorized=true){
    assert.ok(++calls<=MAX_CALLS,'PHASE17_HTTP_BUDGET_EXCEEDED');
    const response=await fetch(url+path,{
      method:'POST',redirect:'error',
      headers:{...(authorized?{Authorization:'Bearer '+token}:{}),
        ...(data===undefined?{}:{'Content-Type':'application/json'})},
      ...(data===undefined?{}:{body:JSON.stringify(data)}),
      signal:AbortSignal.timeout(20000)
    });
    const body=await response.json();
    assert.ok(body&&typeof body==='object');
    return {status:response.status,body};
  }
  const seed=async()=>{
    const s=await post('/native/match17/seed');
    assert.equal(s.status,200,'FIXTURE_SEED_FAILED');
    assert.equal(s.body.ok,true);
    assert.match(s.body.fixtureId,CASE);
    return s.body.fixtureId;
  };
  const save=(fixtureId,operationId,injectAuditFailure=false)=>
    post('/native/match17/save',{fixtureId,operationId,expectedVersion:0,injectAuditFailure});
  const state=async id=>post('/native/match17/state',{fixtureId:id});
  const empty={status:200,body:{ok:true,version:0,revisions:0,audits:0,hasActive:false}};
  const one={status:200,body:{ok:true,version:1,revisions:1,audits:1,hasActive:true}};

  const a=await seed(),firstId=crypto.randomUUID();
  const intentional=await save(a,firstId,true);
  assert.equal(intentional.status,503,'AUDIT_FAILURE_MUST_ABORT_MATCH');
  assert.deepEqual(await state(a),empty,'AUDIT_FAILURE_LEFT_REVISION_OR_POINTER');
  assert.deepEqual(await save(a,firstId),{
    status:200,body:{ok:true,applied:true,replayed:false}
  },'MATCH_SUCCESS_FAILED');
  assert.deepEqual(await save(a,firstId),{
    status:200,body:{ok:true,applied:true,replayed:true}
  },'LOST_RESPONSE_REPLAY_FAILED');
  assert.deepEqual(await state(a),one,'MATCH_AND_AUDIT_NOT_ATOMIC');

  const b=await seed();
  assert.deepEqual(await save(b,firstId),{
    status:409,body:{ok:false,code:'OPERATION_ID_REUSED'}
  },'CROSS_TARGET_OPERATION_ID_NOT_REJECTED');
  assert.deepEqual(await state(b),empty,'CROSS_TARGET_STATE_CHANGED');

  const c=await seed(),d=await seed(),simultaneousOp=crypto.randomUUID();
  const twins=await Promise.all([save(c,simultaneousOp),save(d,simultaneousOp)]);
  assert.deepEqual(twins.map(x=>x.status).sort(),[200,409],
    'ONE_OPERATION_ID_CANNOT_COMMIT_TWO_TARGETS');
  const winner=twins[0].status===200?c:d;
  const loser=winner===c?d:c;
  assert.deepEqual(await state(winner),one,'WINNER_MATCH_AUDIT_NOT_COMMITTED');
  assert.deepEqual(await state(loser),empty,'LOSER_MATCH_AUDIT_NOT_ROLLED_BACK');
  assert.equal((await post('/native/match17/seed',undefined,false)).status,401,
    'AUTHENTICATION_BYPASS');
  assert.equal((await post('/native/match17/save',{unknown:true})).status,400,
    'INVALID_BODY_ACCEPTED');
  console.log('PHASE17_APPROVED_BB_REAL_PASS: audit failure rollback; match pointer revision and audit committed together; target-bound operationId retry and parallel uniqueness; unauth blocked');
  if(env.GITHUB_STEP_SUMMARY)fs.appendFileSync(env.GITHUB_STEP_SUMMARY,
    '## Phase17 approved B/B isolated D1 test\nPASS: match revision/pointer/audit rollback on audit failure; successful atomic commit; same-operation replay; cross-target reuse rejected including concurrent requests; no business rows modified.\n');
}
if(require.main===module){
  if(process.argv[2]==='run'&&process.argv[3]&&process.argv[4])
    run(process.argv[3],process.argv[4]).catch(_=>{
      console.error('PHASE17_BLOCKED: APPROVED_POLICY_ATOMIC_INVARIANT_FAILED');
      process.exitCode=1;
    });
  else throw Error('Usage: run <worker-url-file> <private-bearer-file>');
}
