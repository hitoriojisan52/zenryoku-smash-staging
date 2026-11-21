#!/usr/bin/env node
'use strict';
// User-approved 2026-11-21: exactly one additional isolated D1, synthetic SQL
// only. User's Cloudflare Billing screenshot: Workers Free Active, no payment
// method. Never deploy Worker, modify original D1/GAS/Sheets, or delete anything.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const ACCOUNT='5817f07a73dbb56011012074ce1b11c5';
const BASE='zenryoku-smash-staging-d1';
const TARGET='zenryoku-smash-d1-atomic-fixture-stage';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MAX_CALLS=70;
let calls=0;
const result={create:'NOT_STARTED',sql:'NOT_STARTED',status:'PREFLIGHT_REQUIRED'};
function mustEnv(e) {
  assert.equal(e.GITHUB_REPOSITORY,'hitoriojisan52/zenryoku-smash-staging');
  assert.equal(e.GITHUB_REF,'refs/heads/main');
  assert.equal(e.GITHUB_EVENT_NAME,'push');
  assert.equal(e.D1_STAGE_ACCOUNT_ID,ACCOUNT);
  assert.equal(e.CLOUDFLARE_ACCOUNT_ID,ACCOUNT);
  assert.match(e.D1_STAGE_DATABASE_ID||'',UUID);
  assert.ok(e.D1_STAGE_API_TOKEN);
  return e.D1_STAGE_DATABASE_ID.toLowerCase();
}
function validateList(rows,baseId) {
  assert.ok(Array.isArray(rows)&&rows.length>0&&rows.length<10,'FREE_DB_CAPACITY_NOT_VERIFIED');
  assert.equal(rows.filter(r=>r&&r.name===BASE&&String(r.uuid||'').toLowerCase()===baseId).length,1,'BASE_D1_MISMATCH');
  assert.equal(rows.filter(r=>r&&r.name===TARGET).length,0,'TARGET_ALREADY_EXISTS');
  let bytes=0;const seen=new Set();
  for(const r of rows) {
    assert.ok(r&&UUID.test(r.uuid||'')&&typeof r.name==='string','INVALID_DB_ENTRY');
    assert.ok(!seen.has(r.uuid.toLowerCase()),'DUPLICATE_DB_ID');
    seen.add(r.uuid.toLowerCase());
    assert.ok(Number.isSafeInteger(r.file_size)&&r.file_size>=0,'STORAGE_UNVERIFIED');
    bytes+=r.file_size;
  }
  assert.ok(bytes<4*1024*1024*1024,'STORAGE_TOO_HIGH');
  return rows.length;
}
function targetId(db,baseId) {
  assert.equal(db?.name,TARGET,'TARGET_NAME_MISMATCH');
  assert.match(db?.uuid||'',UUID,'TARGET_ID_INVALID');
  assert.notEqual(db.uuid.toLowerCase(),baseId,'CANNOT_TARGET_EXISTING_D1');
  return db.uuid.toLowerCase();
}
async function api(method,suffix,token,body) {
  assert.ok((method==='GET'&&(suffix==='/d1/database?per_page=100&page=1'||/^\/d1\/database\/[a-f0-9-]{36}$/.test(suffix)))||
    (method==='POST'&&(suffix==='/d1/database'||/^\/d1\/database\/[a-f0-9-]{36}\/query$/.test(suffix))),
    'UNAPPROVED_ENDPOINT');
  const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+suffix,{
    method,redirect:'error',
    headers:{Authorization:'Bearer '+token,Accept:'application/json',
      ...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(20000)});
  let r=null;try{r=await response.json();}catch(_){}
  // Never log raw remote response, account IDs, SQL, tokens or content.
  if(!response.ok||r?.success!==true)throw Error('REMOTE_API_HTTP_'+response.status);
  return r;
}
async function list(token){
  const r=await api('GET','/d1/database?per_page=100&page=1',token);
  assert.ok(Array.isArray(r.result)&&!(r.result_info?.total_pages>1),'DB_LIST_INCOMPLETE');
  return r.result;
}
async function sql(token,db,baseId,body) {
  const id=targetId(db,baseId);
  assert.ok(calls++<MAX_CALLS,'QUERY_BUDGET_EXCEEDED');
  assert.ok(typeof body.sql==='string'||Array.isArray(body.batch),'UNSAFE_QUERY');
  const r=await api('POST','/d1/database/'+id+'/query',token,body);
  assert.ok(Array.isArray(r.result)&&r.result.length,'MISSING_SQL_RESULT');
  if(r.result.some(x=>x?.success!==true))throw Error('SQL_STATEMENT_FAILURE');
  return r.result;
}
async function one(token,db,baseId,query,params=[]){
  const r=await sql(token,db,baseId,{sql:query,params});
  return r[0];
}
async function read(token,db,baseId,query,params=[]){
  const r=await one(token,db,baseId,query,params);
  assert.equal(r.results?.length,1,'SELECT_EXPECTED_ONE_ROW');
  return r.results[0];
}
function changes(r){
  assert.ok(Number.isInteger(r.meta?.changes),'D1_SQL_CHANGES_UNAVAILABLE');
  return r.meta.changes;
}
function fixture(){
  const id=crypto.randomBytes(6).toString('hex');
  return {
    m:'fake-member-'+id,p:'fake-practice-'+id,
    a:'fake-attendee-'+id,l:'fake-line-'+id,
    r1:'fake-ledger-first-'+id,r2:'fake-ledger-second-'+id,
    rev0:'fake-revision0-'+id,rev1:'fake-revision1-'+id,
    rev2:'fake-revision2-'+id,op:'fake-operation-'+id};
}
async function runFixture(token,db,baseId){
  const f=fixture();
  const q=(s,p=[])=>one(token,db,baseId,s,p);
  const r=(s,p=[])=>read(token,db,baseId,s,p);
  const bat=b=>sql(token,db,baseId,{batch:b});
  const d=fs.readFileSync(path.join(__dirname,'../d1-staging/migrations/0002_business_skeleton.sql'),'utf8');
  assert.ok(d.includes('CREATE TABLE IF NOT EXISTS members')&&d.includes('CREATE TABLE IF NOT EXISTS match_sessions'),'BASE_SCHEMA_MISSING');
  assert.ok(!/\bINSERT INTO\b/i.test(d),'SOURCE_DATA_SQL_FORBIDDEN');
  await sql(token,db,baseId,{sql:d});
  assert.equal(Number((await r("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).n),20,'EXPECTED_20_TABLES');
  assert.equal(Number((await r('SELECT COUNT(*) AS n FROM members')).n),0,'DATABASE_NOT_EMPTY_BEFORE_GENERATED_DATA');

  await q('INSERT INTO members(member_id,display_name,line_user_id,active,is_admin) VALUES(?,?,?,?,?)',[f.m,'架空テスト会員',f.l,1,1]);
  await q('INSERT INTO practices(practice_id,practice_date,place,start_time,end_time,hours,enabled) VALUES(?,?,?,?,?,?,?)',[f.p,'2099-01-01','架空体育館','09:00','12:00',3,1]);
  await q('INSERT INTO attendances(practice_id,participant_id,display_name,category,attending) VALUES(?,?,?,?,?)',[f.p,f.a,'架空参加者','member',1]);
  await q('INSERT INTO payments(practice_id,participant_id,completed,version) VALUES(?,?,?,?)',[f.p,f.a,0,0]);
  const ledgerInsert="INSERT INTO ledger_rows(row_id,ledger_date,label,income_yen,expense_yen,balance_yen,kind,status,version) VALUES(?,?,?,?,?,?,?,?,?)";
  await q(ledgerInsert,[f.r1,'2099-01-01','架空収入',2400,0,12400,'practice','open',0]);
  await q(ledgerInsert,[f.r2,'2099-01-02','架空支出',0,300,12100,'other','open',0]);
  await q('INSERT INTO match_sessions(practice_id,active_revision_id,session_version,settings_version) VALUES(?,?,?,?)',[f.p,f.rev0,0,0]);
  for(const rev of [f.rev0,f.rev1,f.rev2]){
    const body=JSON.stringify({fictional:true,revision:rev,rounds:[]});
    const hash=crypto.createHash('sha256').update(body).digest('hex');
    await q('INSERT INTO match_revision_chunks(revision_id,practice_id,stage,state_json_chunk,sha256,operation_id,chunk_index,chunk_total) VALUES(?,?,?,?,?,?,?,?)',
      [rev,f.p,'ready',body,hash,f.op,1,1]);
  }

  const paymentUpdate='UPDATE payments SET completed=1,version=version+1 WHERE practice_id=? AND participant_id=? AND version=0';
  const pw=await Promise.all([q(paymentUpdate,[f.p,f.a]),q(paymentUpdate,[f.p,f.a])]);
  assert.deepEqual(pw.map(changes).sort(),[0,1],'PAYMENT_CAS');
  const pay=await r('SELECT completed,version FROM payments WHERE practice_id=? AND participant_id=?',[f.p,f.a]);
  assert.equal(Number(pay.completed),1);assert.equal(Number(pay.version),1);

  const confirm="UPDATE ledger_rows SET status='confirmed',version=version+1 "+
    "WHERE row_id=? AND status='open' AND NOT EXISTS "+
    "(SELECT 1 FROM ledger_rows earlier WHERE earlier.status='open' "+
    "AND (earlier.ledger_date<ledger_rows.ledger_date "+
    "OR (earlier.ledger_date=ledger_rows.ledger_date AND earlier.row_id<ledger_rows.row_id)))";
  assert.equal(changes(await q(confirm,[f.r2])),0,'LEDGER_OUT_OF_ORDER_REJECTED');
  assert.equal(changes(await q(confirm,[f.r1])),1,'LEDGER_FIRST_CONFIRMED');
  assert.equal(changes(await q(confirm,[f.r2])),1,'LEDGER_SECOND_CONFIRMED');
  assert.equal(changes(await q(confirm,[f.r1])),0,'LEDGER_DOUBLE_CONFIRM_REJECTED');
  const bal=await r('SELECT SUM(income_yen) AS income,SUM(expense_yen) AS expense FROM ledger_rows');
  assert.equal(Number(bal.income)-Number(bal.expense),2100,'LEDGER_MONEY_ARITHMETIC');

  const match='UPDATE match_sessions SET active_revision_id=?,session_version=session_version+1 WHERE practice_id=? AND session_version=0';
  const mw=await Promise.all([q(match,[f.rev1,f.p]),q(match,[f.rev2,f.p])]);
  assert.deepEqual(mw.map(changes).sort(),[0,1],'MATCH_CAS');
  const m=await r('SELECT active_revision_id,session_version FROM match_sessions WHERE practice_id=?',[f.p]);
  assert.equal(Number(m.session_version),1);
  assert.ok([f.rev1,f.rev2].includes(m.active_revision_id));

  const op=f.op+'-idempotent';
  const insertAudit='INSERT INTO operation_audit(operation_id,operation,actor_member_id,timestamp_raw,result_json) VALUES(?,?,?,?,?) ON CONFLICT(operation_id) DO NOTHING';
  const ap=[op,'fixture',f.m,'2099-01-01T00:00:00Z','{"fictional":true}'];
  assert.equal(changes(await q(insertAudit,ap)),1);
  assert.equal(changes(await q(insertAudit,ap)),0);
  assert.equal(Number((await r('SELECT COUNT(*) AS n FROM operation_audit WHERE operation_id=?',[op])).n),1);

  // REST batch: deliberately fail second statement on CHECK constraint.
  // If first statement survives, the test FAILS and cutover remains blocked.
  const bad=f.op+'-rollback';
  let failed=false;
  try{
    await bat([
      {sql:'INSERT INTO operation_audit(operation_id,operation,actor_member_id,timestamp_raw,result_json) VALUES(?,?,?,?,?)',
       params:[bad,'fixture_failure',f.m,'2099-01-01T00:00:00Z','{}']},
      {sql:ledgerInsert,params:[bad,'2099-01-02','bad_fake',-1,0,9,'other','open',0]}
    ]);
  }catch(_){failed=true;}
  assert.equal(failed,true,'FAILED_BATCH_DID_NOT_FAIL');
  assert.equal(Number((await r('SELECT COUNT(*) AS n FROM operation_audit WHERE operation_id=?',[bad])).n),0,'REST_BATCH_ROLLBACK_FAILED');
  assert.equal(Number((await r('SELECT COUNT(*) AS n FROM ledger_rows WHERE row_id=?',[bad])).n),0);

  const success=f.op+'-batch';
  await bat([
    {sql:'INSERT INTO operation_audit(operation_id,operation,actor_member_id,timestamp_raw,result_json) VALUES(?,?,?,?,?)',
      params:[success,'fixture_match',f.m,'2099-01-01T00:00:00Z','{}']},
    {sql:'INSERT INTO match_operation_audit(operation_id,practice_id,actor_member_id,action,session_version,created_at_raw) VALUES(?,?,?,?,?,?)',
      params:[success,f.p,f.m,'fixture',1,'2099-01-01T00:00:00Z']}
  ]);
  assert.equal(Number((await r('SELECT COUNT(*) AS n FROM operation_audit WHERE operation_id=?',[success])).n),1);
  assert.equal(Number((await r('SELECT COUNT(*) AS n FROM match_operation_audit WHERE operation_id=?',[success])).n),1);
  return {tables:20,tests:['PAYMENT_CAS','LEDGER_CONFIRM_ORDER',
    'LEDGER_MONEY','MATCH_CAS','OPERATION_IDEMPOTENT',
    'REST_BATCH_ROLLBACK','REST_BATCH_COMMIT'],queryCalls:calls};
}
function report(){
  const lines=['## Cloudflare isolated D1 SQL experiment (2026-11-21)',
    'Creation: '+result.create,'Synthetic SQL: '+result.sql,'Gate: '+result.status,
    'Source sheet/backup: NOT READ; original D1: NOT WRITTEN',
    'Existing Worker/GAS/LIFF/bindings/secrets/production: UNCHANGED',
    'Worker native D1Database.batch: NOT TESTED; only D1 REST batch is tested',
    'Fixture D1 not deleted; retention/disposal requires a separate decision'];
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
  console.log('Phase14 remote operation:',result.status);
  console.log('DB created:',result.create,'fixture SQL:',result.sql);
}
async function run(env=process.env){
  const baseId=mustEnv(env);
  const before=await list(env.D1_STAGE_API_TOKEN);
  const oldCount=validateList(before,baseId);
  result.status='FREE_PLAN_USER_VERIFIED_ACCOUNT_GUARDS_PASSED';
  // One-time CREATE. Never retry automatically on network uncertainty.
  const created=await api('POST','/d1/database',env.D1_STAGE_API_TOKEN,{name:TARGET});
  const db=created.result;
  const uuid=targetId(db,baseId);
  result.create='ONE_ISOLATED_DB_CREATED';
  const verify=await api('GET','/d1/database/'+uuid,env.D1_STAGE_API_TOKEN);
  targetId(verify.result,baseId);
  const after=await list(env.D1_STAGE_API_TOKEN);
  assert.equal(after.length,oldCount+1,'UNEXPECTED_DB_COUNT');
  assert.equal(after.filter(d=>d.name===TARGET&&d.uuid.toLowerCase()===uuid).length,1,'NEW_DB_NOT_UNIQUE');
  result.status='TARGET_ID_VERIFIED';
  const test=await runFixture(env.D1_STAGE_API_TOKEN,db,baseId);
  const final=await api('GET','/d1/database/'+uuid,env.D1_STAGE_API_TOKEN);
  targetId(final.result,baseId);
  assert.ok(Number.isSafeInteger(final.result.file_size)&&final.result.file_size<2*1024*1024,'FIXTURE_STORAGE_TOO_LARGE');
  result.sql='ALL_SYNTHETIC_REST_TESTS_PASS';
  result.status='PASS';
  console.log('REST SQL tests:',test.tests.join(', '),'queries:',test.queryCalls);
}
function selfTest(){
  const base='11111111-2222-4333-8444-555555555555';
  const other='22222222-2222-4333-8444-555555555555';
  const data=[{name:BASE,uuid:base,file_size:2048}];
  assert.equal(validateList(data,base),1);
  assert.throws(()=>validateList(data,other));
  assert.throws(()=>validateList([...data,{name:TARGET,uuid:other,file_size:0}],base));
  assert.throws(()=>validateList([{...data[0],file_size:undefined}],base));
  assert.throws(()=>targetId({name:TARGET,uuid:base},base));
  assert.equal(targetId({name:TARGET,uuid:other},base),other);
  assert.throws(()=>mustEnv({GITHUB_REPOSITORY:'malicious/repository'}));
  assert.ok(fixture().m.startsWith('fake-member-'));
  assert.ok(!report.toString().includes(base));
  console.log('PASS: one isolated DB name, base UUID, billing quota guards and synthetic only');
}
if(require.main===module){
  if(process.argv[2]==='self-test')selfTest();
  else if(process.argv[2]==='run')run().catch(e=>{
    const raw=String(e.message||'');
    result.status=/^[A-Z0-9_]+$/.test(raw)?raw:'FAILED_CLOSED_UNKNOWN';
    result.sql='NOT_VERIFIED';
    process.exitCode=1;
  }).finally(report);
  else {console.log('Usage: self-test | run');process.exitCode=1;}
}
module.exports={mustEnv,validateList,targetId,fixture};
