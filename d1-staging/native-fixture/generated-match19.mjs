/**
 * Phase19, user-approved direction A: entirely GENERATED synthetic match life cycle.
 * NOT a real match API, legacy archive import, recovery runbook, or business-data route.
 * The only mutations touch four newly named z_native_fixture_match19_* tables.
 * Original SHA-mismatched 46 revisions are not imported, inspected, or rewritten.
 */
const P='z_native_fixture_match19_';
export const MATCH19_SQL=Object.freeze({
  sessionDDL: `CREATE TABLE IF NOT EXISTS z_native_fixture_match19_session (fixture_id TEXT PRIMARY KEY NOT NULL, active_revision_id TEXT, version INTEGER NOT NULL DEFAULT 0 CHECK(version BETWEEN 0 AND 3), deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)))`,
  chunkDDL: `CREATE TABLE IF NOT EXISTS z_native_fixture_match19_chunk (revision_id TEXT NOT NULL, fixture_id TEXT NOT NULL, idx INTEGER NOT NULL CHECK(idx BETWEEN 1 AND 30), total INTEGER NOT NULL CHECK(total BETWEEN 1 AND 30), stage TEXT NOT NULL CHECK(stage='ready'), state_chunk TEXT NOT NULL, sha256 TEXT NOT NULL CHECK(length(sha256)=64), PRIMARY KEY(revision_id,idx), FOREIGN KEY(fixture_id) REFERENCES z_native_fixture_match19_session(fixture_id))`,
  archiveDDL: `CREATE TABLE IF NOT EXISTS z_native_fixture_match19_archive (delete_op_id TEXT PRIMARY KEY NOT NULL, fixture_id TEXT NOT NULL, snapshot_json TEXT NOT NULL, snapshot_sha TEXT NOT NULL CHECK(length(snapshot_sha)=64), status TEXT NOT NULL CHECK(status='completed'), FOREIGN KEY(fixture_id) REFERENCES z_native_fixture_match19_session(fixture_id))`,
  auditDDL: `CREATE TABLE IF NOT EXISTS z_native_fixture_match19_audit (operation_id TEXT PRIMARY KEY NOT NULL, fixture_id TEXT NOT NULL, actor_id TEXT NOT NULL CHECK(actor_id='fixture-only-duty'), action TEXT NOT NULL CHECK(action IN ('save','delete','restore')), expected_version INTEGER NOT NULL CHECK(expected_version BETWEEN 0 AND 2), state TEXT NOT NULL CHECK(state='committed'), FOREIGN KEY(fixture_id) REFERENCES z_native_fixture_match19_session(fixture_id))`,
  seed: `INSERT INTO z_native_fixture_match19_session(fixture_id,active_revision_id,version,deleted) VALUES(?,NULL,0,0)`,
  oneChunk: `INSERT INTO z_native_fixture_match19_chunk(revision_id,fixture_id,idx,total,stage,state_chunk,sha256) VALUES(?,?,?,?, 'ready',CASE WHEN EXISTS(SELECT 1 FROM z_native_fixture_match19_session WHERE fixture_id=? AND version=0 AND deleted=0 AND active_revision_id IS NULL) THEN ? ELSE NULL END,?)`,
  savePointer: `UPDATE z_native_fixture_match19_session SET active_revision_id=?,version=1 WHERE fixture_id=? AND version=0 AND deleted=0 AND active_revision_id IS NULL AND (SELECT COUNT(*) FROM z_native_fixture_match19_chunk WHERE revision_id=? AND fixture_id=?)=?`,
  auditSave: `INSERT INTO z_native_fixture_match19_audit(operation_id,fixture_id,actor_id,action,expected_version,state) VALUES(? ,?,'fixture-only-duty','save',0,CASE WHEN EXISTS(SELECT 1 FROM z_native_fixture_match19_session WHERE fixture_id=? AND active_revision_id=? AND version=1 AND deleted=0) THEN ? ELSE 'invalid' END)`,
  archive: `INSERT INTO z_native_fixture_match19_archive(delete_op_id,fixture_id,snapshot_json,snapshot_sha,status) VALUES(?,?,?,?,CASE WHEN EXISTS(SELECT 1 FROM z_native_fixture_match19_session WHERE fixture_id=? AND version=1 AND deleted=0 AND active_revision_id=?) THEN 'completed' ELSE 'invalid' END)`,
  deletePointer: `UPDATE z_native_fixture_match19_session SET active_revision_id=NULL,version=2,deleted=1 WHERE fixture_id=? AND version=1 AND deleted=0 AND active_revision_id=? AND EXISTS(SELECT 1 FROM z_native_fixture_match19_archive WHERE delete_op_id=? AND fixture_id=? AND status='completed')`,
  auditDelete: `INSERT INTO z_native_fixture_match19_audit(operation_id,fixture_id,actor_id,action,expected_version,state) VALUES(? ,?,'fixture-only-duty','delete',1,CASE WHEN EXISTS(SELECT 1 FROM z_native_fixture_match19_session WHERE fixture_id=? AND version=2 AND deleted=1 AND active_revision_id IS NULL) THEN ? ELSE 'invalid' END)`,
  restorePointer: `UPDATE z_native_fixture_match19_session SET active_revision_id=?,version=3,deleted=0 WHERE fixture_id=? AND version=2 AND deleted=1 AND active_revision_id IS NULL AND EXISTS(SELECT 1 FROM z_native_fixture_match19_archive WHERE delete_op_id=? AND fixture_id=? AND status='completed') AND EXISTS(SELECT 1 FROM z_native_fixture_match19_chunk WHERE revision_id=? AND fixture_id=? AND stage='ready')`,
  auditRestore: `INSERT INTO z_native_fixture_match19_audit(operation_id,fixture_id,actor_id,action,expected_version,state) VALUES(? ,?,'fixture-only-duty','restore',2,CASE WHEN EXISTS(SELECT 1 FROM z_native_fixture_match19_session WHERE fixture_id=? AND version=3 AND deleted=0 AND active_revision_id=?) THEN ? ELSE 'invalid' END)`,
  state: `SELECT active_revision_id AS active,version,deleted FROM z_native_fixture_match19_session WHERE fixture_id=?`,
  chunks: `SELECT idx,total,stage,state_chunk,sha256 FROM z_native_fixture_match19_chunk WHERE fixture_id=? AND revision_id=? ORDER BY idx`,
  auditLookup: `SELECT fixture_id,actor_id,action,expected_version FROM z_native_fixture_match19_audit WHERE operation_id=?`,
  archiveLookup: `SELECT fixture_id,snapshot_json,snapshot_sha,status FROM z_native_fixture_match19_archive WHERE delete_op_id=?`,
  stats: `SELECT (SELECT version FROM z_native_fixture_match19_session WHERE fixture_id=?) AS version,(SELECT deleted FROM z_native_fixture_match19_session WHERE fixture_id=?) AS deleted,(SELECT COUNT(*) FROM z_native_fixture_match19_chunk WHERE fixture_id=?) AS chunks,(SELECT COUNT(*) FROM z_native_fixture_match19_audit WHERE fixture_id=?) AS audits,(SELECT COUNT(*) FROM z_native_fixture_match19_archive WHERE fixture_id=?) AS archives,(SELECT COUNT(*) FROM z_native_fixture_match19_session WHERE fixture_id=? AND active_revision_id IS NOT NULL) AS hasActive`
});
const ID=/^phase19-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-match$/;
const OP=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FP={members:1,practices:1,payments:1,ledgers:2,sessions:1,revisions:3,audits:2};
const errors=(reply,code,status=409)=>reply(status,{ok:false,code});
const affects=(r)=>{if(!Number.isSafeInteger(r?.meta?.changes))throw Error('INVALID_CHANGES');return r.meta.changes;};
async function bodyOf(request,fields){
  if(request.headers.get('content-type')!=='application/json')return null;
  const n=Number(request.headers.get('content-length')||0);
  if(!Number.isSafeInteger(n)||n<0||n>256)return null;
  let raw;try{raw=await request.text();}catch(_){return null;}
  if(raw.length>256)return null;
  let x;try{x=JSON.parse(raw);}catch(_){return null;}
  return x&&typeof x==='object'&&!Array.isArray(x)&&
    Object.keys(x).sort().join(',')===fields.slice().sort().join(',')?x:null;
}
async function sha(text){
  const bytes=new TextEncoder().encode(text);
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
}
function chunksOf(text,limit=30000){
  const parts=[];let start=0;
  while(start<text.length){
    let end=Math.min(start+limit,text.length);
    // Ensure SQLite TEXT never gets a detached UTF-16 surrogate.
    if(end<text.length&&end>start&&
       /[\uD800-\uDBFF]/.test(text.charAt(end-1))&&
       /[\uDC00-\uDFFF]/.test(text.charAt(end)))end--;
    if(end<=start)throw Error('UNSAFE_UTF16_BOUNDARY');
    parts.push(text.slice(start,end));start=end;
  }
  return parts.length?parts:[''];
}
function newMatchPayload(large){
  // Fixed synthetic state only: no user-origin or legacy-sheet data can enter.
  return JSON.stringify({
    generatedOnly:true, schema:1, sessionVersion:1, settingsVersion:1,
    participants:['Fiction A','Fiction B','Fiction C','Fiction D'],
    rounds:[{number:1,courts:[{court:1,pairs:[[0,1],[2,3]]}]}],
    comment:large?'x'.repeat(29902)+'🏸'+'y'.repeat(211):'架空試合🏸'
  });
}
async function verified(db,id,revision){
  const rows=(await db.prepare(MATCH19_SQL.chunks).bind(id,revision).all())?.results;
  if(!Array.isArray(rows)||rows.length<1||rows.length>30)throw Error('CHUNKS_MISSING');
  const n=rows.length,hex=rows[0].sha256;
  if(!/^[a-f0-9]{64}$/.test(hex)||
     rows.some((r,i)=>r.idx!==i+1||r.total!==n||r.stage!=='ready'||r.sha256!==hex))
    throw Error('BAD_CHUNK_METADATA');
  const text=rows.map(r=>r.state_chunk).join('');
  if(await sha(text)!==hex)throw Error('SHA_MISMATCH');
  let parsed;try{parsed=JSON.parse(text);}catch(_){throw Error('JSON_INVALID');}
  if(parsed?.generatedOnly!==true||parsed?.schema!==1||parsed?.sessionVersion!==1)
    throw Error('FIXTURE_NOT_GENERATED');
  return {text,sha:hex,chunks:n,revision};
}
async function archived(db,fixtureId,deleteOpId){
  const a=await db.prepare(MATCH19_SQL.archiveLookup).bind(deleteOpId).first();
  if(!a)return null;
  if(a.fixture_id!==fixtureId||a.status!=='completed')throw Error('ARCHIVE_TARGET_MISMATCH');
  if(await sha(a.snapshot_json)!==a.snapshot_sha)throw Error('ARCHIVE_SHA_MISMATCH');
  let data;try{data=JSON.parse(a.snapshot_json);}catch(_){throw Error('ARCHIVE_JSON_INVALID');}
  if(data?.fixtureId!==fixtureId||!OP.test(data.revision)||data.sha!==await sha(data.text))
    throw Error('ARCHIVE_CONTENT_MISMATCH');
  const actual=await verified(db,fixtureId,data.revision);
  if(actual.sha!==data.sha||actual.text!==data.text||actual.chunks!==data.chunks)
    throw Error('ARCHIVE_NOT_EQUAL_TO_REVISION');
  return data;
}
async function replay(db,reply,op,id,action,expected){
  const old=await db.prepare(MATCH19_SQL.auditLookup).bind(op).first();
  if(!old)return null;
  if(old.fixture_id!==id||old.actor_id!=='fixture-only-duty'||
     old.action!==action||Number(old.expected_version)!==expected)
    return errors(reply,'OPERATION_ID_REUSED');
  return reply(200,{ok:true,applied:true,replayed:true});
}
async function batchAndCheck(db,stmts,reply,dbError='MATCH19_ATOMIC_PROBE_FAILED'){
  try{
    const results=await db.batch(stmts);
    if(!Array.isArray(results)||results.length!==stmts.length||
       results.some(r=>affects(r)!==1))throw Error('PARTIAL_BATCH_RESULT');
    return true;
  }catch(_){return errors(reply,dbError,503);}
}
export async function processMatch19(request,env,reply,fingerprint){
  if(env.NATIVE_SYNTHETIC_MATCH19_ENABLED!=='true')
    return errors(reply,'DISABLED',404);
  if(request.method!=='POST')return errors(reply,'METHOD_NOT_ALLOWED',405);
  const u=new URL(request.url);
  if(u.search||u.hash)return errors(reply,'QUERY_NOT_ALLOWED',400);
  const db=env.ZENRYOKU_FIXTURE_DB;
  if(!db)return errors(reply,'DB_UNAVAILABLE',503);
  try{
    if(u.pathname==='/native/match19/seed'){
      if(request.headers.get('content-length')&&request.headers.get('content-length')!=='0')
        return errors(reply,'BODY_NOT_ALLOWED',400);
      const fp=await db.prepare(fingerprint).first();
      if(Object.entries(FP).some(([k,n])=>Number(fp?.[k])!==n))
        return errors(reply,'SOURCE_FIXTURE_FINGERPRINT_FAILED',503);
      for(const sql of [MATCH19_SQL.sessionDDL,MATCH19_SQL.chunkDDL,
                        MATCH19_SQL.archiveDDL,MATCH19_SQL.auditDDL])
        await db.prepare(sql).run();
      const fixtureId='phase19-'+crypto.randomUUID()+'-match';
      await db.prepare(MATCH19_SQL.seed).bind(fixtureId).run();
      return reply(200,{ok:true,fixtureId});
    }
    if(u.pathname==='/native/match19/stats'){
      const p=await bodyOf(request,['fixtureId']);
      if(!p||!ID.test(p.fixtureId))return errors(reply,'INVALID_PROBE_INPUT',400);
      const x=await db.prepare(MATCH19_SQL.stats)
        .bind(...Array(6).fill(p.fixtureId)).first();
      if(!Number.isSafeInteger(x?.version))return errors(reply,'NOT_FOUND',404);
      const {version,deleted,chunks,audits,archives,hasActive}=x;
      if([deleted,chunks,audits,archives,hasActive].some(
        v=>!Number.isSafeInteger(v)||v<0))throw Error('INVALID_STATS');
      return reply(200,{ok:true,version,deleted:deleted===1,chunks,audits,archives,hasActive:hasActive===1});
    }
    if(u.pathname==='/native/match19/read'){
      const p=await bodyOf(request,['fixtureId']);
      if(!p||!ID.test(p.fixtureId))return errors(reply,'INVALID_PROBE_INPUT',400);
      const s=await db.prepare(MATCH19_SQL.state).bind(p.fixtureId).first();
      if(!s)return errors(reply,'NOT_FOUND',404);
      if(s.deleted||!s.active)return errors(reply,'DELETED_OR_NOT_SAVED',409);
      const result=await verified(db,p.fixtureId,s.active);
      return reply(200,{ok:true,shaVerified:true,chunkCount:result.chunks,version:s.version});
    }
    if(u.pathname==='/native/match19/preview'){
      const p=await bodyOf(request,['fixtureId','deleteOperationId']);
      if(!p||!ID.test(p.fixtureId)||!OP.test(p.deleteOperationId))
        return errors(reply,'INVALID_PROBE_INPUT',400);
      const a=await archived(db,p.fixtureId,p.deleteOperationId);
      if(!a)return errors(reply,'ARCHIVE_NOT_FOUND',404);
      return reply(200,{ok:true,archiveVerified:true,chunkCount:a.chunks,reactivated:false});
    }
    if(u.pathname==='/native/match19/save'){
      const p=await bodyOf(request,['fixtureId','operationId','large','injectAuditFailure']);
      if(!p||!ID.test(p.fixtureId)||!OP.test(p.operationId)||
         typeof p.large!=='boolean'||typeof p.injectAuditFailure!=='boolean')
        return errors(reply,'INVALID_PROBE_INPUT',400);
      const old=await replay(db,reply,p.operationId,p.fixtureId,'save',0);
      if(old)return old;
      const content=newMatchPayload(p.large),parts=chunksOf(content);
      if(parts.length<1||parts.length>30)return errors(reply,'CHUNK_LIMIT',400);
      const digest=await sha(content),rev=crypto.randomUUID();
      const stmts=parts.map((chunk,i)=>db.prepare(MATCH19_SQL.oneChunk)
        .bind(rev,p.fixtureId,i+1,parts.length,p.fixtureId,chunk,digest));
      stmts.push(db.prepare(MATCH19_SQL.savePointer)
        .bind(rev,p.fixtureId,rev,p.fixtureId,parts.length));
      stmts.push(db.prepare(MATCH19_SQL.auditSave)
        .bind(p.operationId,p.fixtureId,p.fixtureId,rev,
              p.injectAuditFailure?'fault':'committed'));
      const ok=await batchAndCheck(db,stmts,reply);
      if(ok!==true){
        const after=await replay(db,reply,p.operationId,p.fixtureId,'save',0);
        return after||ok;
      }
      return reply(200,{ok:true,applied:true,replayed:false,chunkCount:parts.length});
    }
    if(u.pathname==='/native/match19/delete'){
      const p=await bodyOf(request,['fixtureId','operationId','injectAuditFailure']);
      if(!p||!ID.test(p.fixtureId)||!OP.test(p.operationId)||
         typeof p.injectAuditFailure!=='boolean')
        return errors(reply,'INVALID_PROBE_INPUT',400);
      const old=await replay(db,reply,p.operationId,p.fixtureId,'delete',1);
      if(old)return old;
      const s=await db.prepare(MATCH19_SQL.state).bind(p.fixtureId).first();
      if(!s||s.version!==1||s.deleted!==0||!OP.test(s.active||''))
        return errors(reply,'VERSION_CONFLICT');
      const content=await verified(db,p.fixtureId,s.active);
      const snapshot=JSON.stringify({fixtureId:p.fixtureId,revision:s.active,
        text:content.text,sha:content.sha,chunks:content.chunks,schema:1});
      const digest=await sha(snapshot);
      const stmts=[
        db.prepare(MATCH19_SQL.archive).bind(p.operationId,p.fixtureId,snapshot,digest,
          p.fixtureId,s.active),
        db.prepare(MATCH19_SQL.deletePointer)
          .bind(p.fixtureId,s.active,p.operationId,p.fixtureId),
        db.prepare(MATCH19_SQL.auditDelete).bind(p.operationId,p.fixtureId,p.fixtureId,
          p.injectAuditFailure?'fault':'committed')
      ];
      const ok=await batchAndCheck(db,stmts,reply);
      if(ok!==true){
        const after=await replay(db,reply,p.operationId,p.fixtureId,'delete',1);
        return after||ok;
      }
      return reply(200,{ok:true,applied:true,replayed:false,archived:true});
    }
    if(u.pathname==='/native/match19/restore'){
      const p=await bodyOf(request,
        ['fixtureId','operationId','deleteOperationId','injectAuditFailure']);
      if(!p||!ID.test(p.fixtureId)||!OP.test(p.operationId)||
         !OP.test(p.deleteOperationId)||typeof p.injectAuditFailure!=='boolean')
        return errors(reply,'INVALID_PROBE_INPUT',400);
      const old=await replay(db,reply,p.operationId,p.fixtureId,'restore',2);
      if(old)return old;
      const a=await archived(db,p.fixtureId,p.deleteOperationId);
      if(!a)return errors(reply,'ARCHIVE_NOT_FOUND',404);
      const stmts=[
        db.prepare(MATCH19_SQL.restorePointer)
          .bind(a.revision,p.fixtureId,p.deleteOperationId,p.fixtureId,
                a.revision,p.fixtureId),
        db.prepare(MATCH19_SQL.auditRestore)
          .bind(p.operationId,p.fixtureId,p.fixtureId,a.revision,
                p.injectAuditFailure?'fault':'committed')
      ];
      const ok=await batchAndCheck(db,stmts,reply);
      if(ok!==true){
        const after=await replay(db,reply,p.operationId,p.fixtureId,'restore',2);
        return after||ok;
      }
      return reply(200,{ok:true,applied:true,replayed:false,restored:true});
    }
  }catch(_){return errors(reply,'MATCH19_PROBE_FAILED',503);}
  return errors(reply,'NOT_FOUND',404);
}
