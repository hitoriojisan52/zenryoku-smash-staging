#!/usr/bin/env node
'use strict';
/**
 * Remote D1 REST read-only network benchmark. NOT a Worker/LIFF/GAS latency test.
 * Fixed SQL SELECT with only COUNT fields, no query or record details in logs.
 * Sends no member, LINE identity, financial amount or user supplied SQL.
 * Requires remote Account+UUID+name verification in GitHub Actions first.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {performance}=require('node:perf_hooks');
const EXPECTED_ACCOUNT='5817f07a73dbb56011012074ce1b11c5';
const DB_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SQL='SELECT (SELECT COUNT(*) FROM practices) AS practices_count, '+
 '(SELECT COUNT(*) FROM attendances) AS attendance_count, '+
 '(SELECT COUNT(*) FROM payments) AS payments_count, '+
 '(SELECT COUNT(*) FROM ledger_rows) AS ledger_count';
const FIELDS=['practices_count','attendance_count','payments_count','ledger_count'];
const WARMUPS=2, SAMPLES=12;
function validateResponse(body) {
  assert.equal(body?.success,true,'D1 REST query was not successful');
  assert.ok(Array.isArray(body.result) && body.result.length===1,'D1 result is not exactly one');
  const block=body.result[0];
  assert.equal(block.success,true,'D1 query result was unsuccessful');
  assert.ok(Array.isArray(block.results) && block.results.length===1,'Unexpected D1 aggregate result');
  for(const name of FIELDS) assert.equal(block.results[0][name],0,'D1 has data: stop synthetic-only benchmark');
  assert.notEqual(block.meta?.changed_db,true,'D1 reported a data mutation');
  assert.equal(block.meta?.rows_written??0,0,'D1 reported written rows');
  const duration=block.meta?.timings?.sql_duration_ms;
  if(duration!==undefined) assert.ok(Number.isFinite(duration)&&duration>=0);
  return Number.isFinite(duration)?duration:null;
}
function percentile(xs,percent) {
  assert.ok(xs.length>0);
  const sorted=[...xs].sort((a,b)=>a-b);
  return sorted[Math.max(0,Math.ceil(percent*sorted.length)-1)];
}
const fmt=n=>n.toFixed(1);
function makeSummary(network,sql) {
  const s=[...network].sort((a,b)=>a-b), db=sql.filter(v=>v!==null);
  return {
    samples:s.length,
    httpP50ms:percentile(s,0.5),
    httpP95ms:percentile(s,0.95),
    httpMinMs:s[0],
    httpMaxMs:s.at(-1),
    sqlP50ms:db.length===s.length?percentile(db,0.5):null,
    sqlP95ms:db.length===s.length?percentile(db,0.95):null
  };
}
async function run() {
  const account=process.env.D1_STAGE_ACCOUNT_ID;
  const db=process.env.D1_STAGE_DATABASE_ID;
  const token=process.env.CLOUDFLARE_API_TOKEN;
  assert.equal((account||'').toLowerCase(),EXPECTED_ACCOUNT,'Non-staging account is forbidden');
  assert.match(db||'',DB_UUID,'Missing staging database ID');
  assert.ok(typeof token==='string'&&token.length>=20,'No D1 staging credential');
  // Stage D1 UUID+name is confirmed separately by the workflow before this step.
  const uri='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query';
  const network=[], sql=[];
  for(let i=0;i<WARMUPS+SAMPLES;i++) {
    const start=performance.now();
    let response;
    try {
      response=await fetch(uri,{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({sql:SQL,params:[]})
      });
    }catch(_){throw new Error('Cloudflare D1 REST read failed (network or timeout, no retry)');}
    const millis=performance.now()-start;
    if(!response.ok) throw new Error('D1 read failed: HTTP '+response.status);
    let json;
    try{json=await response.json();}catch(_){throw new Error('D1 REST response is not JSON');}
    const sqlMs=validateResponse(json);
    if(i>=WARMUPS){network.push(millis);sql.push(sqlMs);}
  }
  const result=makeSummary(network,sql);
  // Never use this benchmark as an assertion that overall LIFF app is faster.
  const info='D1 REST read-only benchmark (GitHub runner -> Cloudflare API, 0 business rows, no Worker/LINE/GAS): '+
    'n='+result.samples+' HTTP p50='+fmt(result.httpP50ms)+'ms, p95='+fmt(result.httpP95ms)+
    'ms, min='+fmt(result.httpMinMs)+'ms, max='+fmt(result.httpMaxMs)+'ms; '+
    'SQL engine p50='+(result.sqlP50ms===null?'n/a':fmt(result.sqlP50ms)+'ms')+
    ', p95='+(result.sqlP95ms===null?'n/a':fmt(result.sqlP95ms)+'ms')+'.';
  console.log(info);
  const summary=process.env.GITHUB_STEP_SUMMARY;
  if(summary) fs.appendFileSync(summary,[
    '### D1 staging READ-ONLY synthetic empty-data benchmark',
    '',
    '| Metric | Value |',
    '|---|---:|',
    '| samples after 2 warm-ups | '+result.samples+' |',
    '| Cloudflare REST HTTP p50 / p95 | '+fmt(result.httpP50ms)+' / '+fmt(result.httpP95ms)+' ms |',
    '| Cloudflare REST HTTP min / max | '+fmt(result.httpMinMs)+' / '+fmt(result.httpMaxMs)+' ms |',
    '| D1 engine SQL p50 / p95 | '+(result.sqlP50ms===null?'N/A':fmt(result.sqlP50ms)+' / '+fmt(result.sqlP95ms)+' ms')+' |',
    '',
    '**Not comparable as end-to-end app latency:** no LINE verification, browser/UI, Worker binding, GAS, ledger computations, or real records. Only D1 query API with empty tables.',
    ''
  ].join('\n')+'\n');
}
if(require.main===module) {
  if(process.argv[2]==='self-test'){
    assert.match(SQL,/^SELECT /);
    assert.ok(!/\b(INSERT|DELETE|UPDATE|DROP|ALTER|REPLACE)\b/i.test(SQL));
    assert.equal(percentile([9,3,2,8,6,4,1,5,7,10],0.5),5);
    assert.equal(percentile([9,3,2,8,6,4,1,5,7,10],0.95),10);
    assert.equal(validateResponse({success:true,result:[{success:true,results:[{
      practices_count:0,attendance_count:0,payments_count:0,ledger_count:0
    }],meta:{changed_db:false,rows_written:0,timings:{sql_duration_ms:0.12}}}]}),0.12);
    assert.throws(()=>validateResponse({success:true,result:[{success:true,results:[{
      practices_count:1,attendance_count:0,payments_count:0,ledger_count:0
    }]}]}));
    assert.throws(()=>validateResponse({success:true,result:[{success:true,results:[{
      practices_count:0,attendance_count:0,payments_count:0,ledger_count:0
    }],meta:{changed_db:true,rows_written:0}}]}));
    const res=makeSummary([1,2,3,4],[0.1,0.2,0.3,0.4]);
    assert.equal(res.httpP95ms,4);
    console.log('PASS: static read-only D1 REST SQL, empty-data stop, response guard, p50/p95');
  }else run().catch(e=>{console.error('D1 READ-ONLY BENCHMARK FAILED: '+e.message);process.exitCode=1;});
}
module.exports={SQL,validateResponse,percentile,makeSummary};
