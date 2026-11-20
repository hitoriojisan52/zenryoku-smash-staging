#!/usr/bin/env node
'use strict';
// Read-only remote schema checks. Never emit IDs, tokens, person names or payloads.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const tables = Object.freeze([
  'members','duty_teams','team_memberships','practices','attendances','payments',
  'ledger_rows','operation_audit','match_sessions','match_revision_chunks',
  'match_operation_audit','registration_requests','guest_links','withdrawal_history',
  'cash_audits','practice_delete_archive_chunks','participant_action_archive',
  'match_delete_archive_chunks','visitor_requests','visitor_decision_archive'
]);
function query() {
  const tableNames = tables.map(t=>"'"+t+"'").join(',');
  const totals = tables.map(t=>'(SELECT COUNT(*) FROM "'+t+'")').join(' + ');
  return 'SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type=\'table\' AND name IN (' +
    tableNames + ')) AS table_count, ('+ totals +') AS business_rows, ' +
    '(SELECT COUNT(*) FROM stage_d1_bootstrap) AS probe_rows;';
}
function verify(obj) {
  // Wrangler --json emits a list of query-results with a results array.
  const blocks = Array.isArray(obj) ? obj : Array.isArray(obj.result) ? obj.result : [obj];
  assert.equal(blocks.length,1,'Expected exactly one D1 query result set');
  const block = blocks[0];
  assert.equal(block.success, true, 'Remote D1 read-only query failed');
  assert.equal(block.results?.length, 1, 'Missing exact remote summary row');
  const row = block.results[0];
  assert.equal(row.table_count, tables.length, 'Missing or unexpected business table count');
  // Explicitly keep this empty-data gate until a separately-approved snapshot/cutover PR.
  assert.equal(row.business_rows, 0, 'Staging D1 contains business data before the authorized import phase');
  assert.equal(row.probe_rows, 0, 'Bootstrap probe table should still be empty');
  console.log('Remote D1 staging business table count=20; all business rows=0; probe rows=0; PASS');
}
const command = process.argv[2];
if(command==='sql') process.stdout.write(query());
else if(command==='verify') {
  assert.ok(process.argv[3], 'Path to D1 --json result is required');
  const raw = fs.readFileSync(process.argv[3], 'utf8');
  assert.ok(raw.length < 200000, 'Unexpectedly large D1 JSON response');
  verify(JSON.parse(raw));
} else if(command==='self-test') {
  assert.match(query(), /sqlite_master/);
  assert.equal(tables.length,new Set(tables).size);
  const good={success:true,results:[{table_count:20,business_rows:0,probe_rows:0}]};
  verify([good]);
  for(const bad of [
    [{success:true,results:[{table_count:19,business_rows:0,probe_rows:0}]}],
    [{success:true,results:[{table_count:20,business_rows:1,probe_rows:0}]}],
    [{success:false,results:[{table_count:20,business_rows:0,probe_rows:0}]}]
  ]) assert.throws(()=>verify(bad));
  console.log('D1 read-only schema contract self-test PASS');
} else throw new Error('Usage: sql | verify <wrangler-output.json> | self-test');
