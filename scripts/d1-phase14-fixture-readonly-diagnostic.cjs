#!/usr/bin/env node
'use strict';
// Phase14, post-one-time-create: READ ONLY diagnosis of the single new D1.
// Never create, delete, migrate, repair, import or update any resource.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ACCOUNT='5817f07a73dbb56011012074ce1b11c5';
const ORIGINAL='zenryoku-smash-staging-d1';
const FIXTURE='zenryoku-smash-d1-atomic-fixture-stage';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function checkEnv(e){
  assert.equal(e.GITHUB_REPOSITORY,'hitoriojisan52/zenryoku-smash-staging');
  assert.equal(e.GITHUB_REF,'refs/heads/main');
  assert.equal(e.D1_STAGE_ACCOUNT_ID,ACCOUNT);
  assert.equal(e.CLOUDFLARE_ACCOUNT_ID,ACCOUNT);
  assert.match(e.D1_STAGE_DATABASE_ID||'',UUID);
  assert.ok(e.D1_STAGE_API_TOKEN);
}
async function request(suffix,token,body){
  const readOnlySQL=body?.sql&&/^\s*SELECT\b/i.test(body.sql)&&!/[;]/.test(body.sql);
  assert.ok((!body&&(suffix==='/d1/database?per_page=100&page=1'||
    /^\/d1\/database\/[a-f0-9-]{36}$/.test(suffix)))||
    (readOnlySQL&&/^\/d1\/database\/[a-f0-9-]{36}\/query$/.test(suffix)));
  const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+suffix,{
    method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{Authorization:'Bearer '+token,Accept:'application/json',
      ...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  let data;try{data=await response.json()}catch(_){}
  assert.ok(response.ok&&data?.success===true,'D1_READ_FAILED_HTTP_'+response.status);
  return data;
}
function judge(list,baseId){
  assert.ok(Array.isArray(list)&&list.length===2,'D1_COUNT_NOT_TWO');
  const orig=list.filter(d=>d.name===ORIGINAL&&String(d.uuid).toLowerCase()===baseId);
  assert.equal(orig.length,1,'ORIGINAL_NOT_IDENTIFIED');
  const fixtures=list.filter(d=>d.name===FIXTURE);
  assert.equal(fixtures.length,1,'FIXTURE_NOT_UNIQUE');
  const item=fixtures[0];
  assert.match(item.uuid||'',UUID);
  assert.notEqual(item.uuid.toLowerCase(),baseId);
  return item;
}
function parseRows(result){
  assert.ok(result.success===true&&Array.isArray(result.result),'D1_RESULT_UNAVAILABLE');
  assert.ok(result.result.length===1&&result.result[0].success===true,
    'D1_QUERY_UNEXPECTED');
  return result.result[0].results;
}
async function run(e=process.env){
  checkEnv(e);
  const t=e.D1_STAGE_API_TOKEN;
  const raw=await request('/d1/database?per_page=100&page=1',t);
  assert.ok(!(raw.result_info?.total_pages>1),'D1_LIST_TRUNCATED');
  const item=judge(raw.result,e.D1_STAGE_DATABASE_ID.toLowerCase());
  const id=item.uuid.toLowerCase();
  const details=await request('/d1/database/'+id,t);
  assert.equal(details.result?.name,FIXTURE,'CREATED_DATABASE_ID_MISMATCH');
  assert.equal(details.result?.uuid.toLowerCase(),id,'CREATED_DATABASE_UUID_CHANGED');
  const tables=await request('/d1/database/'+id+'/query',t,
    {sql:"SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"});
  const row=parseRows(tables);
  assert.equal(row?.length,1);
  const n=Number(row[0].n);
  assert.ok(Number.isSafeInteger(n)&&n>=0&&n<=21,'UNEXPECTED_TABLE_COUNT');
  let memberCount=null;
  if(n>0){
    const probe=await request('/d1/database/'+id+'/query',t,
      {sql:"SELECT COUNT(*) AS n FROM members"});
    const rr=parseRows(probe);
    memberCount=Number(rr[0].n);
    assert.ok(Number.isSafeInteger(memberCount)&&memberCount>=0&&memberCount<100,
      'UNEXPECTED_MEMBER_COUNT');
  }
  const lines=[
    '## Isolated D1 read-only diagnostic',
    'Confirmed D1 list: 2; original D1 identity still present',
    'One named fixture DB: confirmed, separate UUID',
    'Fixture table count: '+n,
    'Fixture member row count: '+(memberCount===null?'NOT_QUERIED':memberCount),
    'Creation timestamp: '+(details.result?.created_at?'PRESENT':'NOT_RETURNED'),
    'No CREATE/INSERT/UPDATE/DELETE/migrations performed by this job',
    'Do not infer REST atomic test PASS from this diagnostic',
  ];
  if(e.GITHUB_STEP_SUMMARY)fs.appendFileSync(e.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
  console.log('READ_ONLY_FIXTURE_DATABASE_CONFIRMED');
  console.log('Fixture table count:',n,'members:',memberCount);
  return {n,memberCount};
}
function selfTest(){
  const x='11111111-2222-4333-8444-555555555555';
  const y='22222222-2222-4333-8444-555555555555';
  const items=[{name:ORIGINAL,uuid:x},{name:FIXTURE,uuid:y}];
  assert.equal(judge(items,x).uuid,y);
  assert.throws(()=>judge(items,y));
  assert.throws(()=>judge(items.slice(0,1),x));
  assert.throws(()=>judge([{name:ORIGINAL,uuid:x},{name:FIXTURE,uuid:x}],x));
  assert.throws(()=>checkEnv({GITHUB_REF:'refs/heads/main'}));
  console.log('PASS: read-only isolated fixture identity and no remote code executed');
}
if(require.main===module){
  if(process.argv[2]==='self-test')selfTest();
  else if(process.argv[2]==='run')run().catch(e=>{
    console.log('READ_ONLY_DIAGNOSTIC_BLOCKED:',/^[A-Z_0-9]+$/.test(String(e.message))?e.message:'UNEXPECTED_ERROR');
    process.exitCode=1;
  });
  else process.exitCode=1;
}
module.exports={judge,parseRows};
