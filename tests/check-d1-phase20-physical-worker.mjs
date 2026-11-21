import assert from 'node:assert/strict';
import {SQL,handleNativeFixture} from '../d1-staging/native-fixture/worker.mjs';
import {MATCH20_SQL} from '../d1-staging/native-fixture/legacy-match20.mjs';

assert.equal(Object.keys(MATCH20_SQL).length,22);
assert.ok(Object.values(MATCH20_SQL).every(x=>x.includes('z_native_fixture_match20_')));
for(const [name,sql] of Object.entries(MATCH20_SQL)){
  if(name.endsWith('DDL'))assert.match(sql,/^CREATE TABLE IF NOT EXISTS z_native_fixture_match20_/);
  if(/\b(?:DELETE FROM|UPDATE|INSERT INTO)\b/.test(sql))
    assert.doesNotMatch(sql,/\b(?:members|ledger_rows|match_sessions|match_revision_chunks|match_operation_audit|operation_audit|attendances|payments)\b/i);
}
assert.match(MATCH20_SQL.deleteSession,/^DELETE FROM z_native_fixture_match20_session/);
assert.match(MATCH20_SQL.deleteRevisions,/^DELETE FROM z_native_fixture_match20_revision/);
assert.match(MATCH20_SQL.deleteAudits,/^DELETE FROM z_native_fixture_match20_audit/);
assert.match(MATCH20_SQL.revoke,/^UPDATE z_native_fixture_match20_link/);
assert.match(MATCH20_SQL.fault,/'invalid'/);
assert.match(MATCH20_SQL.archiveSeed,/'completed' ELSE 'invalid'/);
assert.ok(!Object.keys(MATCH20_SQL).some(k=>/restore|reactivate|unrevoke/i.test(k)));

const token='x'.repeat(43);
const fake={members:1,practices:1,payments:1,ledgers:2,sessions:1,revisions:3,audits:2};
let touches=[];
const db={
  prepare(sql){
    const f=(args=[])=>({
      bind:(...x)=>f(x),
      first:async()=>{
        assert.equal(sql,SQL.fingerprint);
        return fake;
      },
      run:async()=>{touches.push(sql);return {meta:{changes:0}}}
    });
    return f();
  },
  batch:async()=>{throw Error('NEVER_COMMIT_IN_MOCK');}
};
const env={NATIVE_FIXTURE_ENABLED:'true',NATIVE_LEGACY_DELETE20_ENABLED:'true',
  NATIVE_FIXTURE_RUN_TOKEN:token,ZENRYOKU_FIXTURE_DB:db};
async function post(path,data,options=env,auth=token){
  const response=await handleNativeFixture(
    new Request('https://only-fiction.example'+path,{
      method:'POST',
      headers:{...(auth?{Authorization:'Bearer '+auth}:{}),
        ...(data===undefined?{}:{'Content-Type':'application/json'})},
      ...(data===undefined?{}:{body:JSON.stringify(data)})}),
    options);
  return {status:response.status,body:await response.json()};
}
assert.equal((await post('/native/match20/seed',undefined,env,null)).status,401);
assert.equal((await post('/native/match20/seed',undefined,{...env,NATIVE_LEGACY_DELETE20_ENABLED:'false'})).status,404);
assert.equal((await post('/native/match20/delete',{unexpected:true})).status,400);
assert.equal((await post('/native/match20/state',{fixtureId:'real-member'})).status,400);
assert.equal((await post('/native/match20/preview',{fixtureId:'bad',operationId:'bad'})).status,400);
const wrong={...env,ZENRYOKU_FIXTURE_DB:{prepare(sql){
  assert.equal(sql,SQL.fingerprint);return {first:async()=>({...fake,revisions:45})};
}}};
assert.equal((await post('/native/match20/seed',undefined,wrong)).status,503);
assert.equal(touches.length,0,'fingerprint reject before DDL');
const seeded=await post('/native/match20/seed');
assert.equal(seeded.status,503,'seed must fail safely at mocked no-write transaction');
assert.deepEqual(touches.slice(0,5),[
  MATCH20_SQL.sessionDDL,MATCH20_SQL.revisionDDL,MATCH20_SQL.auditDDL,
  MATCH20_SQL.linkDDL,MATCH20_SQL.archiveDDL]);
console.log('PHASE20_ISOLATED_ROUTE_PASS: bearer/flag/strict input gates, 22 isolated SQL statements and physical delete/no automatic restore allowlist');
