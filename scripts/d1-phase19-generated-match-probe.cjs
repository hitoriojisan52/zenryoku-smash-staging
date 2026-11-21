#!/usr/bin/env node
'use strict';
// Synthetic-only Worker/D1 Phase19 probe. Never send source Sheet data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {parseUrl}=require('./d1-phase15-native-worker.cjs');
const WORKER='zenryoku-smash-d1-atomic-fixture-worker-stage';
const ID=/^phase19-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-match$/;
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
  async function post(path,payload,authorized=true){
    assert.ok(++count<=25,'REQUEST_BUDGET_EXCEEDED');
    const res=await fetch(url+path,{
      method:'POST',redirect:'error',
      headers:{...(authorized?{Authorization:'Bearer '+token}:{}),
        ...(payload===undefined?{}:{'Content-Type':'application/json'})},
      ...(payload===undefined?{}:{body:JSON.stringify(payload)}),
      signal:AbortSignal.timeout(20000)
    });
    return {status:res.status,body:await res.json()};
  }
  const seed=async()=>{
    const x=await post('/native/match19/seed');
    assert.equal(x.status,200,'SEED_FAILED');
    assert.match(x.body.fixtureId,ID);
    return x.body.fixtureId;
  };
  const state=id=>post('/native/match19/stats',{fixtureId:id});
  const save=(id,op,injectAuditFailure=false)=>
    post('/native/match19/save',{fixtureId:id,operationId:op,
      large:true,injectAuditFailure});
  const del=(id,op,injectAuditFailure=false)=>
    post('/native/match19/delete',{fixtureId:id,operationId:op,injectAuditFailure});
  const restore=(id,op,deleteOp,injectAuditFailure=false)=>
    post('/native/match19/restore',{fixtureId:id,operationId:op,
      deleteOperationId:deleteOp,injectAuditFailure});
  const initial={status:200,body:{ok:true,version:0,deleted:false,
    chunks:0,audits:0,archives:0,hasActive:false}};
  const saved={status:200,body:{ok:true,version:1,deleted:false,
    chunks:2,audits:1,archives:0,hasActive:true}};
  const deleted={status:200,body:{ok:true,version:2,deleted:true,
    chunks:2,audits:2,archives:1,hasActive:false}};
  const recovered={status:200,body:{ok:true,version:3,deleted:false,
    chunks:2,audits:3,archives:1,hasActive:true}};
  const a=await seed(),saveOp=crypto.randomUUID(),
    deleteOp=crypto.randomUUID(),restoreOp=crypto.randomUUID();
  assert.deepEqual(await state(a),initial);
  assert.equal((await save(a,saveOp,true)).status,503);
  assert.deepEqual(await state(a),initial,'FAILED_SAVE_WRITES_MUST_ROLLBACK');
  assert.deepEqual(await save(a,saveOp),{
    status:200,body:{ok:true,applied:true,replayed:false,chunkCount:2}});
  assert.deepEqual(await post('/native/match19/read',{fixtureId:a}),{
    status:200,body:{ok:true,shaVerified:true,chunkCount:2,version:1}});
  assert.deepEqual(await save(a,saveOp),{
    status:200,body:{ok:true,applied:true,replayed:true}});
  assert.equal((await del(a,deleteOp,true)).status,503);
  assert.deepEqual(await state(a),saved,'FAILED_DELETE_MUST_ROLLBACK');
  assert.deepEqual(await del(a,deleteOp),{
    status:200,body:{ok:true,applied:true,replayed:false,archived:true}});
  assert.equal((await post('/native/match19/read',{fixtureId:a})).status,409);
  assert.deepEqual(await post('/native/match19/preview',{
    fixtureId:a,deleteOperationId:deleteOp}),{
    status:200,body:{ok:true,archiveVerified:true,chunkCount:2,reactivated:false}});
  assert.deepEqual(await del(a,deleteOp),{
    status:200,body:{ok:true,applied:true,replayed:true}});
  assert.equal((await restore(a,restoreOp,deleteOp,true)).status,503);
  assert.deepEqual(await state(a),deleted,'FAILED_RESTORE_MUST_ROLLBACK');
  assert.deepEqual(await restore(a,restoreOp,deleteOp),{
    status:200,body:{ok:true,applied:true,replayed:false,restored:true}});
  assert.deepEqual(await post('/native/match19/read',{fixtureId:a}),{
    status:200,body:{ok:true,shaVerified:true,chunkCount:2,version:3}});
  assert.deepEqual(await restore(a,restoreOp,deleteOp),{
    status:200,body:{ok:true,applied:true,replayed:true}});
  assert.deepEqual(await state(a),recovered);
  const b=await seed();
  assert.deepEqual(await save(b,saveOp),{
    status:409,body:{ok:false,code:'OPERATION_ID_REUSED'}});
  assert.deepEqual(await state(b),initial,'CROSS_TARGET_REUSE_MUST_NOT_WRITE');
  assert.equal((await post('/native/match19/seed',undefined,false)).status,401);
  assert.equal((await post('/native/match19/restore',{random:'invalid'})).status,400);
  assert.ok(count<=25);
  console.log('PHASE19_GENERATED_MATCH_REAL_PASS: fresh 2-chunk UTF-16-safe SHA read, atomic save/archive-delete/restore; audit fault rollback at all 3 stages; same-ID replay; different-target reuse blocked; immutable history preserved');
  if(env.GITHUB_STEP_SUMMARY)fs.appendFileSync(env.GITHUB_STEP_SUMMARY,
    '## Phase19 generated-only match lifecycle\nPASS: new synthetic two-chunk SHA, full save/read/archive-delete/restore with three audit failure rollback checks, no source 46 SHA records touched, original D1 20 business tables remain protected by postcheck.\n');
}
if(require.main===module){
  if(process.argv[2]==='run'&&process.argv[3]&&process.argv[4])
    run(process.argv[3],process.argv[4]).catch(_=>{
      console.error('PHASE19_BLOCKED: SYNTHETIC_MATCH_LIFECYCLE_INVARIANT_FAILED');
      process.exitCode=1;
    });
  else throw Error('Usage: run <isolated-worker-url-file> <private-token-file>');
}
