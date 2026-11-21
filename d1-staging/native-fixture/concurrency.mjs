/**
 * Phase16: multiple independent HTTP requests against ONE generated-only D1.
 * Only the z_native_fixture_probe and z_native_fixture_operation_probe tables
 * may be written; this is not a member, payment, ledger, or match API.
 */
export const CONCURRENCY_SQL=Object.freeze({
  createOperations: 'CREATE TABLE IF NOT EXISTS z_native_fixture_operation_probe (operation_id TEXT PRIMARY KEY NOT NULL, probe_id TEXT NOT NULL, expected_version INTEGER NOT NULL CHECK(expected_version >= 0))',
  seed: 'INSERT INTO z_native_fixture_probe(probe_id,run_id,seq,version) VALUES(?,?,16,0)',
  claim: 'INSERT OR IGNORE INTO z_native_fixture_operation_probe (operation_id,probe_id,expected_version) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM z_native_fixture_probe WHERE probe_id=? AND run_id=? AND version=?)',
  update: 'UPDATE z_native_fixture_probe SET version=version+1 WHERE probe_id=? AND run_id=? AND version=? AND EXISTS (SELECT 1 FROM z_native_fixture_operation_probe WHERE operation_id=? AND probe_id=? AND expected_version=?)',
  operation: 'SELECT probe_id,expected_version FROM z_native_fixture_operation_probe WHERE operation_id=?',
  state: 'SELECT (SELECT version FROM z_native_fixture_probe WHERE probe_id=?) AS version, (SELECT COUNT(*) FROM z_native_fixture_operation_probe WHERE probe_id=?) AS operationCount'
});

const ID=/^phase16-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-case$/;
const OP=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const runOf=probeId=>probeId.slice(0,-5);
const changes=result=>{
  if(!Number.isSafeInteger(result?.meta?.changes))throw Error('INVALID_CHANGE_COUNT');
  return result.meta.changes;
};
const validBody=(body,expected)=>{
  if(!body || typeof body!=='object'||Array.isArray(body))return false;
  return Object.keys(body).sort().join(',')===expected.slice().sort().join(',');
};
async function decode(request,fields){
  const size=Number(request.headers.get('content-length')||0);
  if(!Number.isSafeInteger(size)||size>256||size<0)return null;
  if(request.headers.get('content-type')!=='application/json')return null;
  let text;
  try{text=await request.text();}catch(_){return null;}
  if(text.length>256)return null;
  let body;try{body=JSON.parse(text);}catch(_){return null;}
  return validBody(body,fields)?body:null;
}
const failed=(reply)=>reply(503,{ok:false,code:'FIXTURE_CONCURRENCY_FAILED'});

export async function processConcurrent(request,env,reply,fingerprintSql){
  if(env.NATIVE_CONCURRENCY_ENABLED!=='true')return reply(404,{ok:false,code:'DISABLED'});
  if(request.method!=='POST')return reply(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const db=env.ZENRYOKU_FIXTURE_DB;
  const url=new URL(request.url);
  if(url.search||url.hash)return reply(400,{ok:false,code:'QUERY_NOT_ALLOWED'});
  try{
    if(url.pathname==='/native/concurrent/seed'){
      if(request.headers.get('content-length')&&request.headers.get('content-length')!=='0')
        return reply(400,{ok:false,code:'BODY_NOT_ALLOWED'});
      // Check the original Phase14 synthetic fingerprint before any DDL/write.
      const row=await db.prepare(fingerprintSql).first();
      const expected={members:1,practices:1,payments:1,ledgers:2,sessions:1,revisions:3,audits:2};
      if(Object.entries(expected).some(([k,v])=>Number(row?.[k])!==v))
        throw Error('UNEXPECTED_DB_DATA');
      await db.prepare(CONCURRENCY_SQL.createOperations).run();
      const id='phase16-'+crypto.randomUUID();
      const probeId=id+'-case';
      await db.prepare(CONCURRENCY_SQL.seed).bind(probeId,id).run();
      return reply(200,{ok:true,probeId});
    }
    if(url.pathname==='/native/concurrent/cas'){
      const payload=await decode(request,['probeId','operationId','expectedVersion']);
      if(!payload||!ID.test(payload.probeId)||!OP.test(payload.operationId)||
        payload.expectedVersion!==0)return reply(400,{ok:false,code:'INVALID_PROBE_INPUT'});
      const {probeId,operationId,expectedVersion}=payload;
      const runId=runOf(probeId);
      const results=await db.batch([
        db.prepare(CONCURRENCY_SQL.claim).bind(operationId,probeId,expectedVersion,probeId,runId,expectedVersion),
        db.prepare(CONCURRENCY_SQL.update).bind(probeId,runId,expectedVersion,operationId,probeId,expectedVersion)
      ]);
      if(!Array.isArray(results)||results.length!==2)throw Error('INVALID_BATCH_RESULT');
      const c=results.map(changes);
      if(c[0]===1&&c[1]===1){
        return reply(200,{ok:true,applied:true,replayed:false});
      }
      if(c[0]!==0||c[1]!==0)throw Error('BATCH_OUTCOME_INCONSISTENT');
      // A timed-out successful request can be retried with the SAME operationId.
      // Return the original accepted outcome, never apply the mutation again.
      const existing=await db.prepare(CONCURRENCY_SQL.operation).bind(operationId).first();
      if(existing){
        if(existing.probe_id!==probeId||Number(existing.expected_version)!==expectedVersion)
          return reply(409,{ok:false,code:'OPERATION_ID_REUSED'});
        return reply(200,{ok:true,applied:true,replayed:true});
      }
      return reply(200,{ok:true,applied:false,replayed:false});
    }
    if(url.pathname==='/native/concurrent/state'){
      const payload=await decode(request,['probeId']);
      if(!payload||!ID.test(payload.probeId))
        return reply(400,{ok:false,code:'INVALID_PROBE_INPUT'});
      const row=await db.prepare(CONCURRENCY_SQL.state).bind(payload.probeId,payload.probeId).first();
      if(!Number.isSafeInteger(row?.version)||row.version<0||
        !Number.isSafeInteger(row?.operationCount)||row.operationCount<0)
        return reply(404,{ok:false,code:'PROBE_NOT_FOUND'});
      return reply(200,{ok:true,version:row.version,operationCount:row.operationCount});
    }
  }catch(_){return failed(reply);}
  return reply(404,{ok:false,code:'NOT_FOUND'});
}
