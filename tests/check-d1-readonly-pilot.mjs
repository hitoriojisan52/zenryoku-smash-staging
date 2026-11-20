#!/usr/bin/env node
import assert from 'node:assert/strict';
import {handleD1Pilot} from '../d1-staging/readonly-pilot/worker.mjs';

const secret = 'stage-test-only-0123456789_ABCDEF987654';
let executed = [];
function db() {
  return {
    prepare(sql) {
      assert.match(sql,/^SELECT COUNT\(\*\) AS n FROM (practices|attendances|payments|ledger_rows) WHERE /);
      assert.doesNotMatch(sql,/;|\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|PRAGMA)\b/i);
      const entry={sql,params:null};
      executed.push(entry);
      return {bind(...params) {
        entry.params=params;
        return {async first() {
          return {n: sql.includes('FROM practices')?1:sql.includes('FROM attendances')?8:sql.includes('FROM payments')?7:6};
        }};
      }};
    }
  };
}
const env={D1_PILOT_ENABLED:'true',ZENRYOKU_STAGE_DB:db(),PILOT_READ_TOKEN:secret};
const request=(url,options={})=>new Request('https://non-deployed.invalid'+url,options);
const auth={Authorization:'Bearer '+secret};
async function ask(path,opts={},e=env) {
  const res=await handleD1Pilot(request(path,opts),e);
  const json=await res.json();
  return {res,json};
}
let x=await ask('/pilot/overview-counts?practiceId=P-TEST0001',{headers:auth});
assert.equal(x.res.status,200);
assert.deepEqual(x.json.data,{practiceCount:1,attendeeCount:8,paymentCount:7});
assert.equal(x.json.mode,'staging-counts-only');
assert.equal(x.res.headers.get('access-control-allow-origin'),null);
assert.equal(x.res.headers.get('x-d1-pilot-identity'),'ZENRYOKU_D1_PILOT_STAGE_REPO_20261121');
assert.match(x.res.headers.get('cache-control'),/no-store/);
assert.deepEqual(executed.map(x=>x.params),[['P-TEST0001'],['P-TEST0001'],['P-TEST0001']]);
executed=[];
x=await ask('/pilot/ledger-counts?month=2026-12',{headers:auth});
assert.equal(x.res.status,200);
assert.deepEqual(x.json.data,{ledgerCount:6});
assert.deepEqual(executed.map(x=>x.params),[['2026-12-01','2027-01-01']]);
executed=[];
for(const [path,opts,expected] of [
  ['/pilot/overview-counts?practiceId=P-TEST0001',{},401],
  ['/pilot/overview-counts?practiceId=P-TEST0001',{headers:{Authorization:'Bearer '+secret+'x'}},401],
  ['/pilot/overview-counts?practiceId=P-TEST0001',{method:'POST',headers:auth},405],
  ['/pilot/overview-counts?practiceId=P-TEST0001%27%3BDROP%20TABLE%20members',{headers:auth},400],
  ['/pilot/overview-counts?practiceId=P-TEST0001&practiceId=P-TEST0002',{headers:auth},400],
  ['/pilot/overview-counts?practiceId=P-TEST0001&limit=1000',{headers:auth},400],
  ['/pilot/ledger-counts?month=2026-13',{headers:auth},400],
  ['/pilot/ledger-counts?month=2026-11&extra=x',{headers:auth},400],
  ['/pilot/ledger-counts?month=2026-11',{method:'PATCH',headers:auth},405],
  ['/pilot/members?all=true',{headers:auth},404],
]) {
  const result=await ask(path,opts);
  assert.equal(result.res.status,expected,path);
  assert.equal(result.json.ok,false,path);
}
assert.equal(executed.length,0,'Unauthorized/invalid input must not read the DB');
for(const e of [{}, {D1_PILOT_ENABLED:'false',ZENRYOKU_STAGE_DB:db(),PILOT_READ_TOKEN:secret},
                {D1_PILOT_ENABLED:'true',ZENRYOKU_STAGE_DB:db(),PILOT_READ_TOKEN:'too-short'}]) {
  const result=await ask('/pilot/ledger-counts?month=2026-11',{headers:auth},e);
  assert.equal(result.res.status, e.PILOT_READ_TOKEN==='too-short'?401:404);
}
let readCalls=0;
const broken={
  D1_PILOT_ENABLED:'true',PILOT_READ_TOKEN:secret,
  ZENRYOKU_STAGE_DB:{prepare:()=>({bind:()=>({first:async()=>{readCalls++;throw Error('PRIVATE_DATABASE_ERROR');}})})}
};
x=await ask('/pilot/ledger-counts?month=2026-11',{headers:auth},broken);
assert.equal(x.res.status,503);
assert.equal(JSON.stringify(x.json).includes('PRIVATE_DATABASE_ERROR'),false);
assert.equal(readCalls,1);
const source=await import('node:fs').then(fs=>fs.readFileSync(new URL('../d1-staging/readonly-pilot/worker.mjs',import.meta.url),'utf8'));
assert.doesNotMatch(source,/GAS_WEB_APP_URL|LINE_LOGIN_CHANNEL_ID|fetch\(['"]https:/);
assert.doesNotMatch(source,/\.run\(|\.exec\(|\.batch\(/);
console.log('PASS: isolated read-only D1 pilot; fail-closed auth; no CORS; static bound SQL; no writes; private-error masking');
