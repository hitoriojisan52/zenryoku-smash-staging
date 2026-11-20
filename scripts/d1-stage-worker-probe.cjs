'use strict';
/**
 * Synthetic, empty-data endpoint smoke + network timing. This runs only in
 * GitHub Actions with a one-time random bearer in a protected temporary file.
 * Neither the bearer nor JSON bodies are logged. Never queries private records.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {performance}=require('node:perf_hooks');
const WORKER='zenryoku-smash-d1-pilot-stage';
const WARMUP=2, SAMPLES=12;
function urlFromFile(path){
  const raw=fs.readFileSync(path,'utf8').trim();
  const u=new URL(raw);
  assert.equal(u.protocol,'https:');
  assert.ok(u.hostname.startsWith(WORKER+'.'),'Cannot send bearer to non-pilot host');
  assert.ok(u.hostname.endsWith('.workers.dev'));
  assert.equal(u.pathname,'/');
  assert.equal(u.search,'');
  assert.equal(u.hash,'');
  return u.origin;
}
function percentile(xs,p) {
  assert.ok(xs.length>0);
  const s=[...xs].sort((a,b)=>a-b);
  return s[Math.max(0,Math.ceil(p*s.length)-1)];
}
async function fetchResult(url,token,path,method='GET') {
  const start=performance.now();
  const response=await fetch(url+path,{
    method,
    headers:{Authorization:'Bearer '+token,'Cache-Control':'no-store'},
    signal:AbortSignal.timeout(10000),redirect:'error'
  });
  const duration=performance.now()-start;
  assert.equal(response.headers.get('access-control-allow-origin'),null,'Unexpected browser CORS access');
  assert.match(response.headers.get('cache-control')||'',/no-store/);
  const json=await response.json();
  return {response,json,duration};
}
function assertEmpty(data,keys){
  assert.equal(data?.ok,true);
  assert.equal(data?.mode,'staging-counts-only');
  for (const key of keys) assert.equal(data.data?.[key],0,'Unexpected D1 business data');
  assert.equal(Object.keys(data.data||{}).length,keys.length,'Unexpected returned data fields');
}
async function run(urlFile,tokenFile){
  const url=urlFromFile(urlFile);
  const token=fs.readFileSync(tokenFile,'utf8').trim();
  assert.match(token,/^[A-Za-z0-9_-]{32,128}$/);
  // No user or business IDs, only a non-existent, synthetic test key.
  const practice='/pilot/overview-counts?practiceId=P-SYNTH-000001';
  const ledger='/pilot/ledger-counts?month=2026-11';
  let p=await fetchResult(url,token,practice);
  assert.equal(p.response.status,200);
  assertEmpty(p.json,['practiceCount','attendeeCount','paymentCount']);
  p=await fetchResult(url,token,ledger);
  assert.equal(p.response.status,200);
  assertEmpty(p.json,['ledgerCount']);
  const invalid=await fetchResult(url,token+'invalid',practice);
  assert.equal(invalid.response.status,401);
  assert.equal(invalid.json?.ok,false);
  const method=await fetchResult(url,token,practice,'POST');
  assert.equal(method.response.status,405);
  assert.equal(method.json?.ok,false);
  const unknown=await fetchResult(url,token,'/api/overview');
  assert.equal(unknown.response.status,404);
  // No request is retried; these GET requests read empty aggregates only.
  const durations=[];
  for(let i=0;i<WARMUP+SAMPLES;i++){
    const value=await fetchResult(url,token,practice);
    assert.equal(value.response.status,200);
    assertEmpty(value.json,['practiceCount','attendeeCount','paymentCount']);
    if(i>=WARMUP)durations.push(value.duration);
  }
  const p50=percentile(durations,.5),p95=percentile(durations,.95);
  const fmt=v=>v.toFixed(1);
  console.log('Independent staging Worker native D1 count-only HTTP smoke PASS: n=12, p50='+fmt(p50)+'ms, p95='+fmt(p95)+'ms (no LINE, GAS, users or records)');
  if(process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,[
      '### Independent staging Worker native D1 binding (empty-records, read only)',
      '',
      '| Check | Result |',
      '|---|---|',
      '| Isolated hostname / successful binding | PASS |',
      '| Zero business records and count-only JSON | PASS |',
      '| Unauthorized / POST / legacy route blocked | PASS |',
      '| HTTP p50 / p95, 12 samples | '+fmt(p50)+' / '+fmt(p95)+' ms |',
      '',
      '**Not an end-to-end LINE/GAS comparison. Public pilot remains separately gated and must not handle real user data.**',
      ''
    ].join('\n')+'\n');
  }
}
if(process.argv[2]==='self-test'){
  assert.equal(percentile([4,2,3,1],.5),2);
  assert.equal(percentile([4,2,3,1],.95),4);
  assert.throws(()=>assertEmpty({ok:true,mode:'staging-counts-only',data:{practiceCount:1}},['practiceCount']));
  assert.throws(()=>assertEmpty({ok:true,mode:'staging-counts-only',data:{practiceCount:0,privateData:'x'}},['practiceCount']));
  console.log('PASS: independent Worker smoke percentile, empty-data and field allowlist');
}else if(process.argv[2]==='probe'){
  assert.ok(process.argv[3]&&process.argv[4],'URL file and random bearer file required');
  run(process.argv[3],process.argv[4]).catch(e=>{
    // Do not include URLs, tokens, query data, or response bodies in CI logs.
    console.error('Independent D1 pilot Worker smoke FAILED: '+(e?.name==='AssertionError'?'contract mismatch':'request failed'));
    process.exitCode=1;
  });
}else{
  throw new Error('Usage: self-test | probe <url-file> <bearer-file>');
}
