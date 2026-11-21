/**
 * Phase17 user-approved B/B policy proof on the ALREADY ISOLATED synthetic D1.
 * No real match, attendance, member, ledger, or match audit table is mutated.
 * All writes are limited to tables prefixed z_native_fixture_match17_.
 * "Actor" is a FIXED fictitious string, not LINE authentication.
 */
export const MATCH17_SQL=Object.freeze({
  pointerDDL: "CREATE TABLE IF NOT EXISTS z_native_fixture_match17_pointer (fixture_id TEXT PRIMARY KEY NOT NULL, active_revision_id TEXT, version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0))",
  revisionDDL: "CREATE TABLE IF NOT EXISTS z_native_fixture_match17_revision (revision_id TEXT PRIMARY KEY NOT NULL, fixture_id TEXT NOT NULL, state_json TEXT NOT NULL, FOREIGN KEY(fixture_id) REFERENCES z_native_fixture_match17_pointer(fixture_id))",
  auditDDL: "CREATE TABLE IF NOT EXISTS z_native_fixture_match17_audit (operation_id TEXT PRIMARY KEY NOT NULL, fixture_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, expected_version INTEGER NOT NULL, revision_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state='committed'), FOREIGN KEY(fixture_id) REFERENCES z_native_fixture_match17_pointer(fixture_id))",
  seed: "INSERT INTO z_native_fixture_match17_pointer(fixture_id,active_revision_id,version) VALUES(?,NULL,0)",
  revision: "INSERT INTO z_native_fixture_match17_revision(revision_id,fixture_id,state_json) SELECT ?,fixture_id,? FROM z_native_fixture_match17_pointer WHERE fixture_id=? AND version=? AND active_revision_id IS NULL",
  pointer: "UPDATE z_native_fixture_match17_pointer SET active_revision_id=?,version=version+1 WHERE fixture_id=? AND version=? AND active_revision_id IS NULL AND EXISTS(SELECT 1 FROM z_native_fixture_match17_revision WHERE revision_id=? AND fixture_id=?)",
  audit: "INSERT INTO z_native_fixture_match17_audit(operation_id,fixture_id,actor_id,action,expected_version,revision_id,state) SELECT ?,?,?, 'match.save', ?,?,? FROM z_native_fixture_match17_pointer WHERE fixture_id=? AND active_revision_id=? AND version=?",
  replay: "SELECT fixture_id,actor_id,action,expected_version FROM z_native_fixture_match17_audit WHERE operation_id=?",
  state: "SELECT (SELECT version FROM z_native_fixture_match17_pointer WHERE fixture_id=?) AS version,(SELECT COUNT(*) FROM z_native_fixture_match17_revision WHERE fixture_id=?) AS revisions,(SELECT COUNT(*) FROM z_native_fixture_match17_audit WHERE fixture_id=?) AS audits,(SELECT COUNT(*) FROM z_native_fixture_match17_pointer WHERE fixture_id=? AND active_revision_id IS NOT NULL) AS hasActive"
});
const CASE=/^phase17-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-match$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACTOR='synthetic-duty-only';
const STATE='{"fictional":true,"rounds":[],"sessionVersion":1}';
const cols={members:1,practices:1,payments:1,ledgers:2,sessions:1,revisions:3,audits:2};
const changes = result=>{
  if(!Number.isSafeInteger(result?.meta?.changes))throw Error('INVALID_CHANGE_COUNT');
  return result.meta.changes;
};
async function decode(request,keys){
  if(request.headers.get('content-type')!=='application/json')return null;
  const length=Number(request.headers.get('content-length')||0);
  if(!Number.isSafeInteger(length)||length>256||length<0)return null;
  let text;
  try{text=await request.text();}catch(_){return null;}
  if(text.length>256)return null;
  let body;try{body=JSON.parse(text);}catch(_){return null;}
  if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).sort().join(',')!==keys.slice().sort().join(','))return null;
  return body;
}

export async function processApprovedMatch17(request,env,reply,readOnlyFingerprintSQL){
  if(env.NATIVE_APPROVED_MATCH_ENABLED!=='true')
    return reply(404,{ok:false,code:'DISABLED'});
  if(request.method!=='POST')return reply(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const u=new URL(request.url);
  if(u.search||u.hash)return reply(400,{ok:false,code:'QUERY_NOT_ALLOWED'});
  const db=env.ZENRYOKU_FIXTURE_DB;
  if(!db)return reply(503,{ok:false,code:'DB_UNAVAILABLE'});
  try{
    if(u.pathname==='/native/match17/seed'){
      if(request.headers.get('content-length')&&request.headers.get('content-length')!=='0')
        return reply(400,{ok:false,code:'BODY_NOT_ALLOWED'});
      // Same seven business-table fingerprint checks as the approved Phase15/16.
      const fp=await db.prepare(readOnlyFingerprintSQL).first();
      if(Object.entries(cols).some(([k,v])=>Number(fp?.[k])!==v))
        throw Error('ISOLATION_FINGERPRINT_MISMATCH');
      await db.prepare(MATCH17_SQL.pointerDDL).run();
      await db.prepare(MATCH17_SQL.revisionDDL).run();
      await db.prepare(MATCH17_SQL.auditDDL).run();
      const fixtureId='phase17-'+crypto.randomUUID()+'-match';
      await db.prepare(MATCH17_SQL.seed).bind(fixtureId).run();
      return reply(200,{ok:true,fixtureId});
    }
    if(u.pathname==='/native/match17/save'){
      const p=await decode(request,['fixtureId','operationId','expectedVersion','injectAuditFailure']);
      if(!p||!CASE.test(p.fixtureId)||!UUID.test(p.operationId)||
         p.expectedVersion!==0||typeof p.injectAuditFailure!=='boolean')
        return reply(400,{ok:false,code:'INVALID_PROBE_INPUT'});
      const replay=async()=>{
        const old=await db.prepare(MATCH17_SQL.replay).bind(p.operationId).first();
        if(!old)return null;
        if(old.fixture_id!==p.fixtureId||old.actor_id!==ACTOR||
           old.action!=='match.save'||Number(old.expected_version)!==p.expectedVersion)
          return reply(409,{ok:false,code:'OPERATION_ID_REUSED'});
        return reply(200,{ok:true,applied:true,replayed:true});
      };
      const existing=await replay();
      if(existing)return existing;
      const revisionId=crypto.randomUUID();
      const results=await db.batch([
        db.prepare(MATCH17_SQL.revision).bind(revisionId,STATE,p.fixtureId,p.expectedVersion),
        db.prepare(MATCH17_SQL.pointer).bind(revisionId,p.fixtureId,p.expectedVersion,revisionId,p.fixtureId),
        db.prepare(MATCH17_SQL.audit).bind(
          p.operationId,p.fixtureId,ACTOR,p.expectedVersion,revisionId,
          p.injectAuditFailure?'fault':'committed',p.fixtureId,revisionId,p.expectedVersion+1)
      ]);
      if(!Array.isArray(results)||results.length!==3)throw Error('BATCH_RESULT_INVALID');
      const counts=results.map(changes);
      if(counts.every(n=>n===1))return reply(200,{ok:true,applied:true,replayed:false});
      if(counts.every(n=>n===0)){
        const after=await replay();
        return after||reply(409,{ok:false,code:'VERSION_CONFLICT'});
      }
      // This is a fail-closed invariant. SQL constraints must make it unreachable.
      throw Error('PARTIAL_BATCH_RESULT');
    }
    if(u.pathname==='/native/match17/state'){
      const p=await decode(request,['fixtureId']);
      if(!p||!CASE.test(p.fixtureId))
        return reply(400,{ok:false,code:'INVALID_PROBE_INPUT'});
      const result=await db.prepare(MATCH17_SQL.state)
        .bind(p.fixtureId,p.fixtureId,p.fixtureId,p.fixtureId).first();
      if(!Number.isSafeInteger(result?.version)||result.version<0)
        return reply(404,{ok:false,code:'NOT_FOUND'});
      const {version,revisions,audits,hasActive}=result;
      if([revisions,audits,hasActive].some(n=>!Number.isSafeInteger(n)||n<0))
        throw Error('BAD_STATE');
      return reply(200,{ok:true,version,revisions,audits,hasActive:hasActive===1});
    }
  }catch(_){
    // Never expose SQL, IDs, secret, fault details, Cloudflare metadata.
    return reply(503,{ok:false,code:'MATCH17_ATOMIC_PROBE_FAILED'});
  }
  return reply(404,{ok:false,code:'NOT_FOUND'});
}
