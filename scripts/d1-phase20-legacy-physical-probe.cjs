#!/usr/bin/env node
'use strict';
// Phase20 isolated generated-only D1 test. NO automatic restore route.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {parseUrl}=require('./d1-phase15-native-worker.cjs');
const WORKER='zenryoku-smash-d1-atomic-fixture-worker-stage';
const ID=/^phase20-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-match$/;
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
  let count=0;
  async function post(path,data,auth=true){
    assert.ok(++count<=18,'HTTP_REQUEST_LIMIT');
    const response=await fetch(url+path,{method:'POST',redirect:'error',
      headers:{...(auth?{Authorization:'Bearer '+token}:{}),
        ...(data===undefined?{}:{'Content-Type':'application/json'})},
      ...(data===undefined?{}:{body:JSON.stringify(data)}),
      signal:AbortSignal.timeout(20000)});
    return {status:response.status,body:await response.json()};
  }
  const seed=async()=>{
    const x=await post('/native/match20/seed');
    assert.equal(x.status,200,'FIXTURE_SEED_BLOCKED');
    assert.match(x.body.fixtureId,ID);
    return x.body.fixtureId;
  };
  const state=id=>post('/native/match20/state',{fixtureId:id});
  const deletion=(id,op,injectAuditFailure=false)=>post('/native/match20/delete',
    {fixtureId:id,operationId:op,injectAuditFailure});
  const preview=(id,op)=>post('/native/match20/preview',{fixtureId:id,operationId:op});
  const before={status:200,body:{ok:true,
    sessions:1,revisions:3,audits:2,activeLinks:2,revokedLinks:1,archives:0}};
  const id=await seed(),op=crypto.randomUUID();
  assert.deepEqual(await state(id),before);
  assert.equal((await deletion(id,op,true)).status,503,'FINAL_FAULT_MUST_ROLLBACK_ALL');
  assert.deepEqual(await state(id),before,'FAILED_DELETE_CHANGED_SOURCE_OR_LINKS');
  const deleted=await deletion(id,op,false);
  assert.equal(deleted.status,200,'PHYSICAL_DELETE_NOT_COMMITTED');
  assert.equal(deleted.body.ok,true);
  assert.equal(deleted.body.applied,true);
  assert.equal(deleted.body.replayed,false);
  assert.ok(Number.isSafeInteger(deleted.body.archiveChunks)&&deleted.body.archiveChunks>=2);
  const after=await state(id);
  assert.deepEqual(after,{status:200,body:{ok:true,sessions:0,revisions:0,
    audits:0,activeLinks:0,revokedLinks:3,archives:deleted.body.archiveChunks}},
    'FULL_ARCHIVE_OR_LINK_REVOCATION_OR_PHYSICAL_DELETE_INCOMPLETE');
  assert.deepEqual(await preview(id,op),{status:200,body:{ok:true,
    verified:true,archiveChunks:deleted.body.archiveChunks,autoRestore:false}});
  assert.deepEqual(await deletion(id,op),{status:200,body:{ok:true,applied:true,replayed:true}});
  assert.deepEqual(await state(id),after,'REPLAY_MUST_NOT_WRITE');
  const another=await seed();
  assert.deepEqual(await deletion(another,op),{status:409,body:{ok:false,code:'OPERATION_ID_REUSED'}});
  assert.deepEqual(await state(another),before,'CROSS_TARGET_OPERATION_REUSE_CHANGED_SECOND_MATCH');
  assert.equal((await post('/native/match20/seed',undefined,false)).status,401);
  assert.equal((await post('/native/match20/delete',{wrong:true})).status,400);
  assert.equal((await post('/native/match20/restore',{fixtureId:id})).status,404,
    'MANUAL_ADMIN_RESTORE_MUST_NOT_BE_PUBLIC_ROUTE');
  assert.ok(count<=18);
  console.log('PHASE20_LEGACY_PHYSICAL_REAL_PASS: full source rows archived, 2 active links revoked, physical session/revision/audit deletion; injected final audit failure rolls back all, archive SHA preview only, operation replay and target-bound collision; no auto restore');
  if(env.GITHUB_STEP_SUMMARY)fs.appendFileSync(env.GITHUB_STEP_SUMMARY,
    '## Phase20 approved A: legacy physical deletion\nPASS: brand-new synthetic full archive with original-row markers, link revoke + physical deletion, final-fault transaction rollback, SHA-verified read-only recovery preview, target-bound idempotent replay. No restore mutation route.\n');
}
if(require.main===module){
  if(process.argv[2]==='run'&&process.argv[3]&&process.argv[4])
    run(process.argv[3],process.argv[4]).catch(_=>{
      console.error('PHASE20_BLOCKED: LEGACY_PHYSICAL_DELETE_INVARIANT_FAILED');
      process.exitCode=1;
    });
  else throw Error('Usage: run <isolated-worker-url-file> <private-token-file>');
}
