import {processConcurrent} from './concurrency.mjs';
import {processApprovedMatch17} from './approved-match17.mjs';
/**
 * Phase15: isolated, synthetic-only Cloudflare D1 native batch probe.
 * Owner marker: ZENRYOKU_D1_NATIVE_FIXTURE_STAGE_REPO_20261121
 *
 * NOT a LINE API, business API, or migration path. The ONLY D1 binding must
 * target zenryoku-smash-d1-atomic-fixture-stage, verified before deployment.
 * All write statements target the separately named test-only probe table.
 */
export const NATIVE_FIXTURE_OWNER = 'ZENRYOKU_D1_NATIVE_FIXTURE_STAGE_REPO_20261121';

export const SQL = Object.freeze({
  fingerprint: "SELECT (SELECT COUNT(*) FROM members) AS members, (SELECT COUNT(*) FROM practices) AS practices, (SELECT COUNT(*) FROM payments WHERE completed=1 AND version=1) AS payments, (SELECT COUNT(*) FROM ledger_rows WHERE status='confirmed') AS ledgers, (SELECT COUNT(*) FROM match_sessions WHERE session_version=1) AS sessions, (SELECT COUNT(*) FROM match_revision_chunks WHERE stage='ready') AS revisions, (SELECT COUNT(*) FROM operation_audit) AS audits",
  create: 'CREATE TABLE IF NOT EXISTS z_native_fixture_probe (probe_id TEXT PRIMARY KEY NOT NULL, run_id TEXT NOT NULL, seq INTEGER NOT NULL CHECK(seq >= 0), version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0), UNIQUE(run_id,seq))',
  insert: 'INSERT INTO z_native_fixture_probe(probe_id,run_id,seq,version) VALUES(?,?,?,0)',
  insertIgnore: 'INSERT OR IGNORE INTO z_native_fixture_probe(probe_id,run_id,seq,version) VALUES(?,?,?,0)',
  count: 'SELECT COUNT(*) AS n FROM z_native_fixture_probe WHERE run_id=?',
  cas: 'UPDATE z_native_fixture_probe SET version=version+1 WHERE probe_id=? AND version=0',
  revision: 'SELECT version FROM z_native_fixture_probe WHERE probe_id=?'
});

const HEADERS = Object.freeze({
  'X-Zenryoku-Native-Fixture': NATIVE_FIXTURE_OWNER,
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
});
const reply = (status, body) => new Response(JSON.stringify(body), {status,headers:HEADERS});
const safeMatch = (got, secret) => {
  if(typeof secret !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(secret)) return false;
  if(typeof got !== 'string') return false;
  const expected='Bearer '+secret;
  if(got.length !== expected.length) return false;
  let d=0;
  for(let i=0;i<expected.length;i++) d|=got.charCodeAt(i)^expected.charCodeAt(i);
  return d===0;
};
const value = (result) => {
  if(!Number.isSafeInteger(result?.n) || result.n < 0) throw new Error('BAD_COUNT');
  return result.n;
};
const affected = (result) => {
  if(!Number.isSafeInteger(result?.meta?.changes)) throw new Error('NO_CHANGE_COUNT');
  return result.meta.changes;
};

/** The only mutations are the probe table DDL and its own synthetic rows. */
export async function exerciseNativeBatch(db) {
  const actual=await db.prepare(SQL.fingerprint).first();
  const expected={members:1,practices:1,payments:1,ledgers:2,sessions:1,revisions:3,audits:2};
  for(const [key,n] of Object.entries(expected)){
    if(Number(actual?.[key])!==n) throw new Error('FIXTURE_FINGERPRINT_MISMATCH');
  }
  // No original business table is created, updated or deleted.
  await db.prepare(SQL.create).run();
  const runId='generated-native-'+crypto.randomUUID();
  const failed=runId+'-failed', first=runId+'-first', second=runId+'-second';
  let rolledBackError=false;
  try{
    await db.batch([
      db.prepare(SQL.insert).bind(failed,runId,0),
      db.prepare(SQL.insert).bind(runId+'-invalid',runId,-1)
    ]);
  }catch(_){rolledBackError=true;}
  if(!rolledBackError) throw new Error('EXPECTED_BATCH_FAILURE');
  if(value(await db.prepare(SQL.count).bind(runId).first())!==0)
    throw new Error('FAILED_BATCH_NOT_ATOMIC');

  const committed=await db.batch([
    db.prepare(SQL.insert).bind(first,runId,1),
    db.prepare(SQL.insert).bind(second,runId,2)
  ]);
  if(!Array.isArray(committed)||committed.length!==2||committed.some(x=>affected(x)!==1))
    throw new Error('SUCCESS_BATCH_NOT_ATOMIC');
  if(value(await db.prepare(SQL.count).bind(runId).first())!==2)
    throw new Error('COMMITTED_BATCH_INCOMPLETE');

  const replay=await db.prepare(SQL.insertIgnore).bind(first,runId,1).run();
  if(affected(replay)!==0) throw new Error('IDEMPOTENCY_REGRESSION');
  // CAS is an atomic UPDATE predicate; two candidate writes target version 0.
  const [a,b]=await Promise.all([
    db.prepare(SQL.cas).bind(first).run(),
    db.prepare(SQL.cas).bind(first).run()
  ]);
  if([affected(a),affected(b)].sort().join(',')!=='0,1')
    throw new Error('CAS_CONFLICT_REGRESSION');
  const v=await db.prepare(SQL.revision).bind(first).first();
  if(Number(v?.version)!==1) throw new Error('CAS_VERSION_REGRESSION');
  return {
    nativeBatchRollback:true,nativeBatchCommit:true,
    idempotentReplay:true,casSingleWinner:true
  };
}

export async function handleNativeFixture(request,env={}){
  if(env.NATIVE_FIXTURE_ENABLED!=='true'||!env.ZENRYOKU_FIXTURE_DB||
     !env.NATIVE_FIXTURE_RUN_TOKEN) return reply(404,{ok:false,code:'DISABLED'});
  if(!safeMatch(request.headers.get('Authorization'),env.NATIVE_FIXTURE_RUN_TOKEN))
    return reply(401,{ok:false,code:'UNAUTHORIZED'});
  let url;
  try{url=new URL(request.url);}catch(_){return reply(400,{ok:false,code:'BAD_URL'});}
  if(url.search||url.hash) return reply(400,{ok:false,code:'QUERY_NOT_ALLOWED'});
  if(url.pathname.startsWith('/native/concurrent/'))
    return processConcurrent(request,env,reply,SQL.fingerprint);
  if(url.pathname==='/native/health'&&request.method==='GET')
    return reply(200,{ok:true,mode:'fixture-only'});
  if(url.pathname==='/native/run'&&request.method==='POST'){
    if(request.headers.get('content-length') && request.headers.get('content-length')!=='0')
      return reply(400,{ok:false,code:'BODY_NOT_ALLOWED'});
    try{
      const result=await exerciseNativeBatch(env.ZENRYOKU_FIXTURE_DB);
      return reply(200,{ok:true,mode:'synthetic-native-batch',results:result});
    }catch(_){
      // Never echo SQL, secret, IDs, D1 errors or fixture values.
      return reply(503,{ok:false,code:'NATIVE_PROBE_FAILED'});
    }
  }
  if(url.pathname==='/native/health'||url.pathname==='/native/run')
    return reply(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  return reply(404,{ok:false,code:'NOT_FOUND'});
}
export default {fetch:handleNativeFixture};
