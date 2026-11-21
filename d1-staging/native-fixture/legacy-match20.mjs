/**
 * Phase20 approved A: preserve legacy physical match deletion with full archive.
 * Synthetic-only fixture: no real match/ledger/member/link, no restore mutation.
 * Exact sheet physical row numbers are NOT reproduced: the sourceOrder values
 * are generated stand-ins to test the archive's {rowNumber,cells} structure.
 */
import {sha,chunksOf,newMatchPayload} from './generated-match19.mjs';
export const MATCH20_SQL=Object.freeze({
  sessionDDL: "CREATE TABLE IF NOT EXISTS z_native_fixture_match20_session (fixture_id TEXT PRIMARY KEY NOT NULL, revision_id TEXT NOT NULL, session_version INTEGER NOT NULL, settings_version INTEGER NOT NULL, source_order INTEGER NOT NULL)",
  revisionDDL: "CREATE TABLE IF NOT EXISTS z_native_fixture_match20_revision (revision_id TEXT NOT NULL, fixture_id TEXT NOT NULL, stage TEXT NOT NULL CHECK(stage='ready'), state_chunk TEXT NOT NULL, sha256 TEXT NOT NULL CHECK(length(sha256)=64), operation_id TEXT NOT NULL, idx INTEGER NOT NULL CHECK(idx>0), total INTEGER NOT NULL CHECK(total>0), source_order INTEGER NOT NULL, PRIMARY KEY(revision_id,idx))",
  auditDDL: "CREATE TABLE IF NOT EXISTS z_native_fixture_match20_audit (operation_id TEXT PRIMARY KEY NOT NULL, fixture_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, version INTEGER NOT NULL, timestamp_raw TEXT NOT NULL, revision_id TEXT NOT NULL, source_order INTEGER NOT NULL)",
  linkDDL: "CREATE TABLE IF NOT EXISTS z_native_fixture_match20_link (token_id TEXT PRIMARY KEY NOT NULL, fixture_id TEXT NOT NULL, expires_at_raw TEXT NOT NULL, revoked_at_raw TEXT NOT NULL DEFAULT '', issued_by TEXT NOT NULL, created_at_raw TEXT NOT NULL, source_order INTEGER NOT NULL)",
  archiveDDL: "CREATE TABLE IF NOT EXISTS z_native_fixture_match20_archive (delete_operation_id TEXT NOT NULL, fixture_id TEXT NOT NULL, actor_id TEXT NOT NULL CHECK(actor_id='fixture-duty'), idx INTEGER NOT NULL CHECK(idx>0), total INTEGER NOT NULL CHECK(total>0), snapshot_chunk TEXT NOT NULL, snapshot_sha TEXT NOT NULL CHECK(length(snapshot_sha)=64), status TEXT NOT NULL CHECK(status IN ('completed','')), PRIMARY KEY(delete_operation_id,idx))",
  seedSession: "INSERT INTO z_native_fixture_match20_session(fixture_id,revision_id,session_version,settings_version,source_order) VALUES(?,?,1,1,2)",
  seedRevision: "INSERT INTO z_native_fixture_match20_revision(revision_id,fixture_id,stage,state_chunk,sha256,operation_id,idx,total,source_order) VALUES(?,?,'ready',?,?,?,?,?,?)",
  seedAudit: "INSERT INTO z_native_fixture_match20_audit(operation_id,fixture_id,actor_id,action,version,timestamp_raw,revision_id,source_order) VALUES(?,?,'fixture-duty','match.save',?,'2026/11/21 12:00:00',?,?)",
  seedLink: "INSERT INTO z_native_fixture_match20_link(token_id,fixture_id,expires_at_raw,revoked_at_raw,issued_by,created_at_raw,source_order) VALUES(?,?,'2026/12/31 23:59:59',?,'fixture-duty','2026/11/21 12:00:00',?)",
  session: "SELECT fixture_id,revision_id,session_version,settings_version,source_order FROM z_native_fixture_match20_session WHERE fixture_id=?",
  revisions: "SELECT revision_id,fixture_id,stage,state_chunk,sha256,operation_id,idx,total,source_order FROM z_native_fixture_match20_revision WHERE fixture_id=? ORDER BY source_order",
  audits: "SELECT operation_id,fixture_id,actor_id,action,version,timestamp_raw,revision_id,source_order FROM z_native_fixture_match20_audit WHERE fixture_id=? ORDER BY source_order",
  links: "SELECT token_id,fixture_id,expires_at_raw,revoked_at_raw,issued_by,created_at_raw,source_order FROM z_native_fixture_match20_link WHERE fixture_id=? ORDER BY source_order",
  archiveRows: "SELECT delete_operation_id,fixture_id,actor_id,idx,total,snapshot_chunk,snapshot_sha,status FROM z_native_fixture_match20_archive WHERE delete_operation_id=? ORDER BY idx",
  archiveSeed: "INSERT INTO z_native_fixture_match20_archive(delete_operation_id,fixture_id,actor_id,idx,total,snapshot_chunk,snapshot_sha,status) VALUES(?,?,'fixture-duty',?,?,?, ?,CASE WHEN (SELECT COUNT(*) FROM z_native_fixture_match20_session WHERE fixture_id=? AND session_version=1 AND settings_version=1 AND revision_id=?)=1 AND (SELECT COUNT(*) FROM z_native_fixture_match20_revision WHERE fixture_id=?)=? AND (SELECT COUNT(*) FROM z_native_fixture_match20_audit WHERE fixture_id=?)=? AND (SELECT COUNT(*) FROM z_native_fixture_match20_link WHERE fixture_id=? AND revoked_at_raw='')=? THEN 'completed' ELSE 'invalid' END)",
  archiveNext: "INSERT INTO z_native_fixture_match20_archive(delete_operation_id,fixture_id,actor_id,idx,total,snapshot_chunk,snapshot_sha,status) VALUES(?,?,'fixture-duty',?,?,?,?,'')",
  revoke: "UPDATE z_native_fixture_match20_link SET revoked_at_raw='2026/11/21 12:30:00' WHERE fixture_id=? AND revoked_at_raw=''",
  deleteRevisions: "DELETE FROM z_native_fixture_match20_revision WHERE fixture_id=?",
  deleteAudits: "DELETE FROM z_native_fixture_match20_audit WHERE fixture_id=?",
  deleteSession: "DELETE FROM z_native_fixture_match20_session WHERE fixture_id=? AND session_version=1 AND settings_version=1",
  fault: "INSERT INTO z_native_fixture_match20_archive(delete_operation_id,fixture_id,actor_id,idx,total,snapshot_chunk,snapshot_sha,status) VALUES(?,?,'fixture-duty',99,99,'fault',?,'invalid')",
  stats: "SELECT (SELECT COUNT(*) FROM z_native_fixture_match20_session WHERE fixture_id=?) AS sessions,(SELECT COUNT(*) FROM z_native_fixture_match20_revision WHERE fixture_id=?) AS revisions,(SELECT COUNT(*) FROM z_native_fixture_match20_audit WHERE fixture_id=?) AS audits,(SELECT COUNT(*) FROM z_native_fixture_match20_link WHERE fixture_id=? AND revoked_at_raw='') AS activeLinks,(SELECT COUNT(*) FROM z_native_fixture_match20_link WHERE fixture_id=? AND revoked_at_raw<>'') AS revokedLinks,(SELECT COUNT(*) FROM z_native_fixture_match20_archive WHERE fixture_id=?) AS archives"
});
const MATCH_ID=/^phase20-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-match$/;
const OP=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FP={members:1,practices:1,payments:1,ledgers:2,sessions:1,revisions:3,audits:2};
const fail=(reply,code,status=409)=>reply(status,{ok:false,code});
const num=x=>{if(!Number.isSafeInteger(x?.meta?.changes))throw Error('CHANGES_MISSING');return x.meta.changes};
async function readBody(request,keys){
  if(request.headers.get('content-type')!=='application/json')return null;
  const size=Number(request.headers.get('content-length')||0);
  if(!Number.isSafeInteger(size)||size>200||size<0)return null;
  let raw;try{raw=await request.text();}catch(_){return null;}
  if(raw.length>200)return null;
  let data;try{data=JSON.parse(raw);}catch(_){return null;}
  return data&&typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).sort().join(',')===keys.slice().sort().join(',')?data:null;
}
async function seed(db,fpSql){
  const fingerprint=await db.prepare(fpSql).first();
  if(Object.entries(FP).some(([k,v])=>Number(fingerprint?.[k])!==v))throw Error('WRONG_FIXTURE_DB');
  for(const k of ['sessionDDL','revisionDDL','auditDDL','linkDDL','archiveDDL'])
    await db.prepare(MATCH20_SQL[k]).run();
  const id='phase20-'+crypto.randomUUID()+'-match';
  const older=crypto.randomUUID(),active=crypto.randomUUID();
  const op1=crypto.randomUUID(),op2=crypto.randomUUID();
  const s1=newMatchPayload(false),s2=newMatchPayload(true);
  const chunks1=chunksOf(s1),chunks2=chunksOf(s2);
  if(chunks1.length!==1||chunks2.length!==2)throw Error('BAD_GENERATED_FIXTURE');
  const hash1=await sha(s1),hash2=await sha(s2);
  const stmts=[db.prepare(MATCH20_SQL.seedSession).bind(id,active)];
  for(const [rev,part,hash,op,start] of [[older,chunks1,hash1,op1,2],[active,chunks2,hash2,op2,3]])
    for(let i=0;i<part.length;i++)stmts.push(db.prepare(MATCH20_SQL.seedRevision)
      .bind(rev,id,part[i],hash,op,i+1,part.length,start+i));
  stmts.push(db.prepare(MATCH20_SQL.seedAudit).bind(op1,id,1,older,2));
  stmts.push(db.prepare(MATCH20_SQL.seedAudit).bind(op2,id,1,active,3));
  for(let i=0;i<3;i++)stmts.push(db.prepare(MATCH20_SQL.seedLink)
    .bind(crypto.randomUUID(),id,i===2?'2026/11/20 12:00:00':'',i+2));
  const result=await db.batch(stmts);
  if(!Array.isArray(result)||result.length!==stmts.length||result.some(x=>num(x)!==1))
    throw Error('SEED_INCOMPLETE');
  return id;
}
const keyOrder={
  '試合セッション':r=>[r.fixture_id,r.revision_id,r.session_version,r.settings_version,'2026/11/21 12:00:00'],
  '試合版管理':r=>[r.revision_id,r.fixture_id,r.stage,r.state_chunk,r.sha256,r.operation_id,'2026/11/21 12:00:00',r.idx,r.total],
  '試合操作履歴':r=>[r.operation_id,r.fixture_id,r.actor_id,r.action,r.version,r.timestamp_raw,r.revision_id]
};
const sheetRows=(rows,conv)=>rows.map(r=>({rowNumber:r.source_order,cells:conv(r)}));
async function plan(db,id){
  const [session,revisions,audits,links]=await Promise.all([
    db.prepare(MATCH20_SQL.session).bind(id).first(),
    db.prepare(MATCH20_SQL.revisions).bind(id).all(),
    db.prepare(MATCH20_SQL.audits).bind(id).all(),
    db.prepare(MATCH20_SQL.links).bind(id).all()
  ]);
  const rs=revisions?.results,as=audits?.results,ls=links?.results;
  if(!session||!Array.isArray(rs)||!Array.isArray(as)||!Array.isArray(ls)||
     rs.length!==3||as.length!==2||ls.filter(x=>x.revoked_at_raw==='').length!==2||
     session.session_version!==1||session.settings_version!==1)throw Error('UNEXPECTED_SOURCE_STATE');
  const active=rs.filter(r=>r.revision_id===session.revision_id).sort((a,b)=>a.idx-b.idx);
  if(active.length!==2||active[0].idx!==1||active[1].idx!==2||
     active.some(r=>r.total!==2||r.stage!=='ready'||r.sha256!==active[0].sha256))
    throw Error('INCOMPLETE_ACTIVE_REVISION');
  const activeJson=active.map(x=>x.state_chunk).join('');
  if(await sha(activeJson)!==active[0].sha256)throw Error('INVALID_SOURCE_HASH');
  try{if(JSON.parse(activeJson)?.generatedOnly!==true)throw Error('NOT_GENERATED');}
  catch(_){throw Error('INVALID_JSON')}
  const other=rs.find(r=>r.revision_id!==session.revision_id);
  if(!other||other.idx!==1||other.total!==1||await sha(other.state_chunk)!==other.sha256)
    throw Error('INVALID_OLD_REVISION');
  const targets={
    '試合セッション':sheetRows([session],keyOrder['試合セッション']),
    '試合版管理':sheetRows(rs,keyOrder['試合版管理']),
    '試合操作履歴':sheetRows(as,keyOrder['試合操作履歴'])
  };
  const activeLinks=ls.filter(x=>x.revoked_at_raw==='');
  const linksSnapshot=sheetRows(activeLinks,r=>[
    r.token_id,r.fixture_id,r.expires_at_raw,r.revoked_at_raw,r.issued_by,r.created_at_raw]);
  const json=JSON.stringify({schema:1,practiceId:id,sessionVersion:1,settingsVersion:1,
    targets,links:linksSnapshot});
  return {json,active:session.revision_id,revisionCount:rs.length,
    auditCount:as.length,linkCount:activeLinks.length};
}
async function verifiedArchive(db,opId,fixtureId){
  const rs=(await db.prepare(MATCH20_SQL.archiveRows).bind(opId).all())?.results;
  if(!Array.isArray(rs)||rs.length===0||rs.length>30)throw Error('NO_ARCHIVE');
  const first=rs[0],n=rs.length;
  if(first.fixture_id!==fixtureId||first.actor_id!=='fixture-duty'||
     first.status!=='completed'||!(/^[a-f0-9]{64}$/.test(first.snapshot_sha))||
     rs.some((r,i)=>r.delete_operation_id!==opId||r.fixture_id!==fixtureId||
       r.idx!==i+1||r.total!==n||r.snapshot_sha!==first.snapshot_sha||
       r.status!==(i===0?'completed':'')))throw Error('ARCHIVE_METADATA_INVALID');
  const raw=rs.map(x=>x.snapshot_chunk).join('');
  if(await sha(raw)!==first.snapshot_sha)throw Error('ARCHIVE_SHA_INVALID');
  let data;try{data=JSON.parse(raw)}catch(_){throw Error('ARCHIVE_JSON_INVALID')}
  const expected=['試合セッション','試合版管理','試合操作履歴'];
  if(data.schema!==1||data.practiceId!==fixtureId||
    data.sessionVersion!==1||data.settingsVersion!==1||
    expected.some(k=>!Array.isArray(data.targets?.[k]))||
    data.targets['試合セッション'].length!==1||
    data.targets['試合版管理'].length!==3||
    data.targets['試合操作履歴'].length!==2||
    !Array.isArray(data.links)||data.links.length!==2||
    [...expected.flatMap(k=>data.targets[k]),...data.links].some(
      x=>!Number.isSafeInteger(x.rowNumber)||x.rowNumber<2||!Array.isArray(x.cells)))
    throw Error('ARCHIVE_INCOMPLETE');
  return {n};
}
async function stats(db,id){
  const x=await db.prepare(MATCH20_SQL.stats).bind(id,id,id,id,id,id).first();
  if(!x)return null;
  const out={};
  for(const k of ['sessions','revisions','audits','activeLinks','revokedLinks','archives']){
    if(!Number.isSafeInteger(x[k])||x[k]<0)throw Error('INVALID_STATS');
    out[k]=x[k];
  }
  return out;
}
export async function processLegacyDelete20(req,env,reply,fpSql){
  if(env.NATIVE_LEGACY_DELETE20_ENABLED!=='true')return fail(reply,'DISABLED',404);
  if(req.method!=='POST')return fail(reply,'METHOD_NOT_ALLOWED',405);
  const url=new URL(req.url);
  if(url.search||url.hash)return fail(reply,'QUERY_NOT_ALLOWED',400);
  const db=env.ZENRYOKU_FIXTURE_DB;
  if(!db)return fail(reply,'NO_DB',503);
  try{
    if(url.pathname==='/native/match20/seed'){
      if(req.headers.get('content-length')&&req.headers.get('content-length')!=='0')return fail(reply,'BODY_NOT_ALLOWED',400);
      const fixtureId=await seed(db,fpSql);
      return reply(200,{ok:true,fixtureId});
    }
    if(url.pathname==='/native/match20/state'){
      const b=await readBody(req,['fixtureId']);
      if(!b||!MATCH_ID.test(b.fixtureId))return fail(reply,'INVALID_INPUT',400);
      return reply(200,{ok:true,...await stats(db,b.fixtureId)});
    }
    if(url.pathname==='/native/match20/preview'){
      const b=await readBody(req,['fixtureId','operationId']);
      if(!b||!MATCH_ID.test(b.fixtureId)||!OP.test(b.operationId))return fail(reply,'INVALID_INPUT',400);
      const data=await verifiedArchive(db,b.operationId,b.fixtureId);
      return reply(200,{ok:true,verified:true,archiveChunks:data.n,autoRestore:false});
    }
    if(url.pathname==='/native/match20/delete'){
      const b=await readBody(req,['fixtureId','operationId','injectAuditFailure']);
      if(!b||!MATCH_ID.test(b.fixtureId)||!OP.test(b.operationId)||
        typeof b.injectAuditFailure!=='boolean')return fail(reply,'INVALID_INPUT',400);
      const existing=(await db.prepare(MATCH20_SQL.archiveRows).bind(b.operationId).all())?.results||[];
      if(existing.length){
        if(existing[0].fixture_id!==b.fixtureId||existing[0].actor_id!=='fixture-duty')
          return fail(reply,'OPERATION_ID_REUSED');
        await verifiedArchive(db,b.operationId,b.fixtureId);
        return reply(200,{ok:true,applied:true,replayed:true});
      }
      let snapshot;
      try{snapshot=await plan(db,b.fixtureId);}catch(_){return fail(reply,'NOT_FOUND_OR_INCOMPLETE');}
      const chunks=chunksOf(snapshot.json,12000);
      if(chunks.length<1||chunks.length>30)return fail(reply,'ARCHIVE_SIZE_EXCEEDED',400);
      const hash=await sha(snapshot.json);
      const sts=[db.prepare(MATCH20_SQL.archiveSeed).bind(
        b.operationId,b.fixtureId,1,chunks.length,chunks[0],hash,
        b.fixtureId,snapshot.active,b.fixtureId,snapshot.revisionCount,
        b.fixtureId,snapshot.auditCount,b.fixtureId,snapshot.linkCount)];
      for(let i=1;i<chunks.length;i++)
        sts.push(db.prepare(MATCH20_SQL.archiveNext).bind(
          b.operationId,b.fixtureId,i+1,chunks.length,chunks[i],hash));
      sts.push(db.prepare(MATCH20_SQL.revoke).bind(b.fixtureId));
      sts.push(db.prepare(MATCH20_SQL.deleteRevisions).bind(b.fixtureId));
      sts.push(db.prepare(MATCH20_SQL.deleteAudits).bind(b.fixtureId));
      sts.push(db.prepare(MATCH20_SQL.deleteSession).bind(b.fixtureId));
      if(b.injectAuditFailure)sts.push(db.prepare(MATCH20_SQL.fault).bind(
        b.operationId,b.fixtureId,hash));
      try{
        const result=await db.batch(sts);
        const expected=[...Array(chunks.length).fill(1),
          snapshot.linkCount,snapshot.revisionCount,snapshot.auditCount,1];
        if(!Array.isArray(result)||result.length!==expected.length||
          result.some((x,i)=>num(x)!==expected[i]))throw Error('BATCH_OUTCOME_INCOMPLETE');
      }catch(_){
        const after=(await db.prepare(MATCH20_SQL.archiveRows).bind(b.operationId).all())?.results||[];
        if(after.length&&after[0].fixture_id===b.fixtureId){
          await verifiedArchive(db,b.operationId,b.fixtureId);
          return reply(200,{ok:true,applied:true,replayed:true});
        }
        return fail(reply,'ATOMIC_DELETE_ROLLED_BACK',503);
      }
      const done=await verifiedArchive(db,b.operationId,b.fixtureId);
      return reply(200,{ok:true,applied:true,replayed:false,archiveChunks:done.n});
    }
  }catch(_){return fail(reply,'MATCH20_PROBE_FAILED',503);}
  return fail(reply,'NOT_FOUND',404);
}
