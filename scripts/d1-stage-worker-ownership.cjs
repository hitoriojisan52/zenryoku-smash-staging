'use strict';
// Existing Worker script ownership test before first deploy and every update.
// Protects all pre-existing Worker scripts from accidental overwrite.
const assert=require('node:assert/strict');
const ACCOUNT='5817f07a73dbb56011012074ce1b11c5';
const WORKER='zenryoku-smash-d1-pilot-stage-20261121';
const MARKER='ZENRYOKU_D1_PILOT_STAGE_REPO_20261121';
function check(status,body) {
  // New Worker creation requires product-level Workers Admin. The user first
  // creates an exact-name Hello World stub in the Cloudflare dashboard; CI is
  // granted ONLY Individual Workers Editor for that already-existing Worker.
  if(status===404) throw new Error('Isolated pilot Worker must first be created via Dashboard');
  assert.equal(status,200,'Cannot verify isolated staging Worker ownership');
  assert.ok(typeof body==='string'&&body.length>0&&body.length<200000,'Unexpected Worker content');
  if(body.includes(MARKER)) return 'ours';
  // One-time adoption is allowed only for the tiny unmodified Hello World
  // default template, not arbitrary existing scripts or operational Workers.
  const source=body.trim();
  assert.ok(source.length<12000,'Unexpected starter Worker size');
  assert.match(source,/export\s+default\s*\{/,'Not a plain JavaScript starter Worker');
  assert.match(source,/new\s+Response\s*\(/,'Expected Hello World starter response');
  assert.match(source,/Hello\s+(?:World|Worker)!?/i,'Expected Hello World starter text');
  assert.doesNotMatch(source,/\b(?:GAS_WEB_APP_URL|LINE_LOGIN|D1_STAGE|ZENRYOKU_STAGE_DB|operationId|Bearer|sharedSecret|fetch\s*\(\s*['"]https?:)/i,
    'Not an untouched starter Worker');
  return 'starter';
}

async function run() {
  assert.equal((process.env.D1_STAGE_ACCOUNT_ID||'').toLowerCase(),ACCOUNT,'Wrong Cloudflare account');
  const token=process.env.CLOUDFLARE_API_TOKEN;
  assert.ok(typeof token==='string'&&token.length>=20,'Worker staging deployment token missing');
  const url='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/workers/scripts/'+WORKER;
  let res;
  try {
    res=await fetch(url,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});
  }catch(_){throw new Error('Worker ownership preflight failed: network error');}
  let body='';
  if(res.status===200) {
    if(Number(res.headers.get('content-length')||0)>2_000_000) throw Error('Existing Worker script too large');
    body=await res.text();
  }
  const result=check(res.status,body);
  console.log('PASS: exact isolated Worker script ownership: '+result+' (existing Worker gateway not touched)');
}
if(process.argv[2]==='self-test') {
  assert.throws(()=>check(404,''),'Missing initial Worker should fail closed');
  assert.equal(check(200,"export default {async fetch(request,env,ctx){return new Response('Hello World!')}}"),'starter');
  assert.throws(()=>check(200,"export default {async fetch(){return new Response('Hello World!')} async post(){return fetch('https://example.com')}}"));
  assert.equal(check(200,'export default {fetch(){return new Response("'+MARKER+'")}}'),'ours');
  assert.throws(()=>check(200,'existing unrelated script'));
  assert.throws(()=>check(403,''));
  assert.notEqual(WORKER,'zenryoku-smash-staging-api');
  console.log('PASS: isolated Worker ownership and collision fail-closed');
}else if(process.argv[2]==='verify'){
  run().catch(e=>{console.error('Worker ownership check failed: '+String(e?.message||'error').replace(/Bearer\s+\S+/g,'Bearer [redacted]'));process.exitCode=1;});
}else throw Error('Usage: self-test | verify');
