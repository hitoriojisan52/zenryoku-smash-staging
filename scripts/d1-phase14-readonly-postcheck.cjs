#!/usr/bin/env node
'use strict';
// Verify existing staging D1 remains EMPTY, compare the isolated D1's
// synthetic totals. Only GET and SELECT; NEVER create, alter, modify or delete.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ACCOUNT='5817f07a73dbb56011012074ce1b11c5';
const ORIGINAL='zenryoku-smash-staging-d1';
const FIXTURE='zenryoku-smash-d1-atomic-fixture-stage';
const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const business=['members','duty_teams','team_memberships','practices','attendances',
  'payments','ledger_rows','operation_audit','match_sessions','match_revision_chunks',
  'match_operation_audit','registration_requests','guest_links','withdrawal_history',
  'cash_audits','practice_delete_archive_chunks','participant_action_archive',
  'match_delete_archive_chunks','visitor_requests','visitor_decision_archive'];
function sourceSQL(){
  const names=business.map(x=>"'"+x+"'").join(',');
  const counts=business.map(x=>'(SELECT COUNT(*) FROM "'+x+'")').join('+');
  return 'SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type=\'table\' AND name IN ('+names+')) AS n,'+
    '('+counts+') AS rows,(SELECT COUNT(*) FROM stage_d1_bootstrap) AS probe';
}
function fixtureSQL(){
  const names=business.map(x=>"'"+x+"'").join(',');
  return 'SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type=\'table\' AND name IN ('+names+')) AS tables,'+
    '(SELECT COUNT(*) FROM members) AS members,'+
    '(SELECT COUNT(*) FROM practices) AS practices,'+
    '(SELECT COUNT(*) FROM attendances) AS attendances,'+
    '(SELECT COUNT(*) FROM payments WHERE completed=1 AND version=1) AS payments_done,'+
    "(SELECT COUNT(*) FROM ledger_rows WHERE status='confirmed') AS ledgers_confirmed,"+
    '(SELECT COUNT(*) FROM match_sessions WHERE session_version=1) AS match_sessions,'+
    "(SELECT COUNT(*) FROM match_revision_chunks WHERE stage='ready') AS ready_chunks,"+
    '(SELECT COUNT(*) FROM operation_audit) AS operation_audits,'+
    '(SELECT COUNT(*) FROM match_operation_audit) AS match_audits';
}
function checkIdentity(list,baseId){
  assert.equal(list.length,2,'EXPECTED_EXACT_TWO_DBS');
  const old=list.filter(x=>x.name===ORIGINAL&&String(x.uuid).toLowerCase()===baseId);
  const fresh=list.filter(x=>x.name===FIXTURE);
  assert.equal(old.length,1,'OLD_DB_NOT_IDENTIFIED');
  assert.equal(fresh.length,1,'FIXTURE_DB_NOT_UNIQUE');
  assert.match(fresh[0].uuid,UUID);
  assert.notEqual(fresh[0].uuid.toLowerCase(),baseId);
  return fresh[0].uuid.toLowerCase();
}
function compare(old,generated){
  assert.deepEqual({n:Number(old.n),rows:Number(old.rows),probe:Number(old.probe)},
    {n:20,rows:0,probe:0},'ORIGINAL_STAGE_MUST_REMAIN_EMPTY');
  const expected={tables:20,members:1,practices:1,attendances:1,
    payments_done:1,ledgers_confirmed:2,match_sessions:1,ready_chunks:3,
    operation_audits:2,match_audits:1};
  for(const [key,n] of Object.entries(expected)){
    assert.equal(Number(generated[key]),n,'FIXTURE_ONLY_COUNT_MISMATCH_'+key);
  }
  return expected;
}
function envGuard(e){
  assert.equal(e.GITHUB_REPOSITORY,'hitoriojisan52/zenryoku-smash-staging');
  assert.equal(e.GITHUB_REF,'refs/heads/main');
  assert.equal(e.D1_STAGE_ACCOUNT_ID,ACCOUNT);
  assert.equal(e.CLOUDFLARE_ACCOUNT_ID,ACCOUNT);
  assert.match(e.D1_STAGE_DATABASE_ID||'',UUID);
  assert.ok(e.D1_STAGE_API_TOKEN);
}
async function request(path,token,body){
  assert.ok((!body&&path==='/d1/database?per_page=100&page=1')||
    (body&&/^\/d1\/database\/[a-f0-9-]{36}\/query$/.test(path)&&
      /^SELECT /i.test(body.sql)&&!body.sql.includes(';')));
  const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+path,{
    method:body?'POST':'GET',
    redirect:'error',
    headers:{Authorization:'Bearer '+token,Accept:'application/json',
      ...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(20000)});
  let json;try{json=await r.json()}catch(_){}
  assert.ok(r.ok&&json?.success===true,'D1_READ_ONLY_API_FAILURE');
  return json;
}
function row(json){
  assert.equal(json.result?.length,1);
  assert.equal(json.result[0].success,true);
  assert.equal(json.result[0].results?.length,1);
  return json.result[0].results[0];
}
async function run(e=process.env){
  envGuard(e);
  const token=e.D1_STAGE_API_TOKEN;
  const listed=await request('/d1/database?per_page=100&page=1',token);
  assert.ok(!(listed.result_info?.total_pages>1));
  const orig=e.D1_STAGE_DATABASE_ID.toLowerCase();
  const target=checkIdentity(listed.result,orig);
  // SELECT on old D1 is read-only and never exposes any underlying row values.
  const previous=await request('/d1/database/'+orig+'/query',token,{sql:sourceSQL()});
  const fixture=await request('/d1/database/'+target+'/query',token,{sql:fixtureSQL()});
  const metrics=compare(row(previous),row(fixture));
  if(e.GITHUB_STEP_SUMMARY)fs.appendFileSync(e.GITHUB_STEP_SUMMARY,[
    '## Phase14 final D1 read-only verification',
    'Original staging D1: 20 business tables, ZERO business rows, ZERO bootstrap rows (PASS)',
    'Separate fixture D1: '+metrics.tables+' business tables, only newly generated data (PASS)',
    'Synthetic members: '+metrics.members+', practices: '+metrics.practices+', payments completed: '+metrics.payments_done,
    'Synthetic confirmed ledger: '+metrics.ledgers_confirmed+', match sessions: '+metrics.match_sessions,
    'Synthetic ready match chunks: '+metrics.ready_chunks+', operation audit: '+metrics.operation_audits+', match operation audit: '+metrics.match_audits,
    'No writes, deletes, DDL, secrets, Worker, source spreadsheet or production changes.',
  ].join('\n')+'\n');
  console.log('FINAL_READ_ONLY_CHECK_PASS: OLD_D1_20_TABLES_ZERO_ROWS; NEW_D1_GENERATED_FIXTURES_ONLY');
}
function selfTest(){
  const x='11111111-2222-4333-8444-555555555555';
  const y='22222222-2222-4333-8444-555555555555';
  assert.equal(business.length,20);
  assert.equal(checkIdentity([{name:ORIGINAL,uuid:x},{name:FIXTURE,uuid:y}],x),y);
  assert.throws(()=>checkIdentity([{name:ORIGINAL,uuid:x}],x));
  const okay={tables:20,members:1,practices:1,attendances:1,
    payments_done:1,ledgers_confirmed:2,match_sessions:1,ready_chunks:3,
    operation_audits:2,match_audits:1};
  compare({n:20,rows:0,probe:0},okay);
  assert.throws(()=>compare({n:20,rows:1,probe:0},okay));
  assert.throws(()=>compare({n:20,rows:0,probe:0},{...okay,operation_audits:1}));
  assert.ok(!sourceSQL().includes('DELETE'));
  assert.ok(!fixtureSQL().includes('INSERT'));
  console.log('PASS: 20 business tables, original zero rows and generated-only expected counts');
}
if(require.main===module){
  if(process.argv[2]==='self-test')selfTest();
  else if(process.argv[2]==='run')run().catch(_=>{
    console.log('READ_ONLY_POSTCHECK_BLOCKED: NO_WRITES_PERFORMED');
    process.exitCode=1;
  });
  else process.exitCode=1;
}
module.exports={checkIdentity,compare,sourceSQL,fixtureSQL};
