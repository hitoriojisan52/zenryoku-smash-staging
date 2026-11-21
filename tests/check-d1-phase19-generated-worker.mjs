import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handleNativeFixture,SQL} from '../d1-staging/native-fixture/worker.mjs';
import {MATCH19_SQL,newMatchPayload,chunksOf,sha} from '../d1-staging/native-fixture/generated-match19.mjs';

assert.equal(await sha(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
assert.equal(await sha('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
assert.equal(Object.keys(MATCH19_SQL).length,18);
const names=Object.keys(MATCH19_SQL);
assert.deepEqual(names.filter(x=>x.endsWith('DDL')),['sessionDDL','chunkDDL','archiveDDL','auditDDL']);
assert.ok(Object.values(MATCH19_SQL).every(v=>v.includes('z_native_fixture_match19_')));
assert.ok(Object.values(MATCH19_SQL).every(v=>!/DROP TABLE|DELETE FROM|ALTER TABLE|ATTACH DATABASE|REPLACE INTO/i.test(v)));
assert.ok(Object.values(MATCH19_SQL).every(v=>
  !/\b(?:INSERT INTO|UPDATE)\s+(?:members|ledger_rows|payments|match_sessions|match_revision_chunks|match_operation_audit|operation_audit)\b/i.test(v)));
assert.ok(Object.values(MATCH19_SQL).every(v=>!/\b(?:CREATE TABLE|INSERT INTO|UPDATE)\s+z_native_fixture_match17_/i.test(v)));

const short=newMatchPayload(false);
const long=newMatchPayload(true);
assert.equal(JSON.parse(short).generatedOnly,true);
assert.equal(JSON.parse(long).generatedOnly,true);
const pieces=chunksOf(long);
assert.equal(pieces.length,2);
assert.equal(pieces[0].length,29999);
assert.equal(pieces.join(''),long);
assert.equal(pieces[0].charCodeAt(pieces[0].length-1)>=0xD800&&pieces[0].charCodeAt(pieces[0].length-1)<=0xDBFF,false);
assert.equal(pieces[1].codePointAt(0),0x1f3f8,'surrogate pair must start second chunk');
assert.equal(await sha(long),createHash('sha256').update(long,'utf8').digest('hex'));
assert.equal(await sha(short),createHash('sha256').update(short,'utf8').digest('hex'));
assert.equal(chunksOf(short).length,1);
assert.throws(()=>chunksOf('🏸',1),/UNSAFE_UTF16_BOUNDARY/);

const bearer='x'.repeat(43);
const fingerprint={members:1,practices:1,payments:1,ledgers:2,sessions:1,revisions:3,audits:2};
const seen=[];
const db={
  prepare(sql){
    const statement=(args=[])=>({
      bind:(...a)=>statement(a),
      first:async()=>{assert.equal(sql,SQL.fingerprint);return fingerprint;},
      run:async()=>{seen.push({sql,args});return {meta:{changes:1}};}
    });
    return statement();
  }
};
async function post(path,payload,env,token=bearer){
  const response=await handleNativeFixture(new Request('https://synthetic.test'+path,{
    method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),
      ...(payload===undefined?{}:{'Content-Type':'application/json'})},
    ...(payload===undefined?{}:{body:JSON.stringify(payload)})
  }),env);
  return {status:response.status,body:await response.json()};
}
const enabled={NATIVE_FIXTURE_ENABLED:'true',NATIVE_SYNTHETIC_MATCH19_ENABLED:'true',
  NATIVE_FIXTURE_RUN_TOKEN:bearer,ZENRYOKU_FIXTURE_DB:db};
assert.equal((await post('/native/match19/seed',undefined,enabled,null)).status,401);
assert.equal((await post('/native/match19/seed',undefined,{...enabled,NATIVE_SYNTHETIC_MATCH19_ENABLED:'false'})).status,404);
assert.equal((await post('/native/match19/save',{invalid:true},enabled)).status,400);
const seed=await post('/native/match19/seed',undefined,enabled);
assert.equal(seed.status,200);
assert.match(seed.body.fixtureId,/^phase19-[0-9a-f-]{36}-match$/);
assert.equal(seen.length,5);
assert.ok(seen.every(x=>Object.values(MATCH19_SQL).includes(x.sql)));
const mismatch={...enabled,ZENRYOKU_FIXTURE_DB:{
  prepare(sql){
    assert.equal(sql,SQL.fingerprint);
    return {first:async()=>({...fingerprint,audits:3})};
  }
}};
assert.equal((await post('/native/match19/seed',undefined,mismatch)).status,503);
console.log('PHASE19_OFFLINE_GENERATOR_PASS: WebCrypto SHA256 verified, full-size synthetic JSON, safe UTF-16 split at emoji boundary, isolated test-only SQL allowlist, bearer, route/fingerprint gates');
