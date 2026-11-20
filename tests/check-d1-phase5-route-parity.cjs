#!/usr/bin/env node
'use strict';
/**
 * Phase 5 cutover SAFETY gate. Run offline. No credentials, network, personal
 * records, Cloudflare D1 queries, or production traffic.
 * An exact Worker route inventory prevents a new endpoint from silently
 * being classified as D1-ready. All live routes remain GAS_ONLY.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const catalog=JSON.parse(read('d1-staging/phase5/route-catalog.json'));
const worker=read('cloudflare-worker/worker.js');
const gas=read('gas-staging/コード.gs');
const wrangler=read('cloudflare-worker/wrangler.toml');
const isolated=read('d1-staging/readonly-pilot/worker.mjs');
const critical={
  'overview':'blocked-side-effecting-read',
  'attendance.mine':'blocked-authenticated-read',
  'schedule.list':'blocked-authenticated-read',
  'ledger.list':'blocked-authenticated-read',
  'match.guest.get':'blocked-guest-capability',
  'stage.selfRole':'blocked-mixed'
};
function extractRoutes(source){
  const match=/const VALID_PATHS\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\);/.exec(source);
  assert.ok(match,'Cannot find legacy route declaration');
  const lines=match[1].split('\n').map(x=>x.replace(/\/\/.*$/,'').trim()).filter(Boolean);
  const routes=[];
  for (const line of lines){
    const m=/^'([^']+)':\s*'([^']+)'\s*,?$/.exec(line);
    assert.ok(m,'Unrecognized route syntax; migration gate requires review');
    routes.push({path:m[1],op:m[2]});
  }
  return routes;
}
function functionSource(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,'Missing original GAS function: '+name);
  // Excerpt until the next top-level function (no parsing user records).
  const end=source.indexOf('\nfunction ',start+10);
  return source.slice(start,end<0?undefined:end);
}
assert.equal(catalog.schemaVersion,1);
assert.equal(catalog.defaultRoute,'GAS_ONLY');
assert.equal(catalog.source,'cloudflare-worker/worker.js');
assert.ok(Array.isArray(catalog.routes));
const actual=extractRoutes(worker);
assert.equal(actual.length,47,'Unexpected route inventory; review before D1 migration');
assert.deepEqual(
  catalog.routes.map(x=>({path:x.path,op:x.op})),
  actual,
  'Legacy routing changed without a migration assessment'
);
assert.equal(new Set(actual.map(x=>x.path)).size,actual.length);
assert.equal(new Set(actual.map(x=>x.op)).size,actual.length);
for (const item of catalog.routes){
  assert.match(item.path,/^\/api\/[a-z0-9/-]+$/);
  assert.match(item.op,/^[a-zA-Z0-9.]+$/);
  assert.equal(item.cutoverApproved,false,'Never cut over a live API before role/data parity');
  assert.equal(item.review,critical[item.op]||'blocked-unreviewed',
    'Migration risk classification changed without review');
}
assert.ok(worker.includes('verifyLineToken(tokenMatch[1],env.LINE_LOGIN_CHANNEL_ID)'));
assert.ok(worker.includes('fetchGasOnce(env.GAS_WEB_APP_URL'));
assert.ok(worker.includes("origin!==env.FRONTEND_ORIGIN"));
assert.ok(gas.includes('member_(ss,body.lineUserId)'));
assert.ok(gas.includes('requireDuty_(member)'));
// The old overview can append an accounting row/audit ON A READ.
// A direct D1 count/query replacement would omit this mutation.
assert.match(functionSource(gas,'overview_'),/ensureCollectionLedger_\(/);
assert.match(functionSource(gas,'ensureCollectionLedger_'),/writeLedger_\(/);
assert.match(functionSource(gas,'ensureCollectionLedger_'),/audit_\(/);
// Personal attendance reads old audit history, match locks and ledger status.
const mine=functionSource(gas,'attendanceMine_');
for(const required of ['attendanceAuditDates_','participantMatchLocked_','ledgerSnapshot','lastReportedAt'])
  assert.ok(mine.includes(required),'Attendance read-parity requirement missing: '+required);
// Schedule manager includes unpublished days and validates whole-sheet ID/date uniqueness.
const schedule=functionSource(gas,'scheduleList_');
const rows=functionSource(gas,'scheduleRows_');
assert.match(schedule,/date>=today_\(\)/);
assert.match(schedule,/schedules:rows/);
assert.doesNotMatch(schedule,/\.filter\(function\(r\)\{return r\.enabled/);
assert.match(rows,/seenId\[id\]\|\|seenDate\[date\]/);
const ledger=functionSource(gas,'monthLedger_');
assert.match(ledger,/canConfirm/);
assert.match(ledger,/canUnlock/);
assert.match(ledger,/carried/);
// No original gateway binding or route to the isolated pilot is authorized.
assert.doesNotMatch(wrangler,/\[\[services\]\]|\[\[d1_databases\]\]/);
assert.doesNotMatch(worker,/ZENRYOKU_STAGE_DB|D1_PILOT_ENABLED|\/pilot\//);
assert.match(isolated,/D1_PILOT_ENABLED/);
assert.match(isolated,/PILOT_READ_TOKEN/);
assert.doesNotMatch(isolated,/lineUserId|LINE_LOGIN_CHANNEL_ID/);
console.log('PASS: '+actual.length+' live routes exactly reviewed and D1 cutover denied; GAS role, ledger side-effect, attendance history, schedule and binding guards intact');
