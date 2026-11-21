import assert from 'node:assert/strict';
import {assessReadOnlyAggregates,CENSUS_CONTRACT} from '../d1-staging/analysis/phase21-readonly-readiness.mjs';

// Intentionally artificial aggregate counts. Never import live cell data to CI.
const SAMPLE={mode:CENSUS_CONTRACT.mode,managementTabs:5,legacyTabs:2,
  syntheticTabs:7,d1BusinessTables:6,practiceDates:4,
  receptionEnabledDates:1,responseRows:9,responseDatesMatched:3,
  responseDatesUnmatched:6,unmatchedBeforeEarliestMaster:6,
  unmatchedWithinMasterRange:0,unmatchedAfterLatestMaster:0,
  duplicateEmailDateRows:2,sampledFormulaCells:13,shaMismatchVersions:3};
const x=assessReadOnlyAggregates(SAMPLE);
assert.equal(x.status,'BLOCKED_FROM_MIGRATION');
assert.deepEqual(x.issues,[
  'AUTHORITATIVE_SOURCE_NOT_SELECTED',
  'SOURCE_AND_CANDIDATE_SCHEMAS_NOT_ISOMORPHIC',
  'HISTORICAL_RESPONSES_ABSENT_FROM_CURRENT_PRACTICE_MASTER',
  'REPEATED_LEGACY_RESPONSE_KEY_REQUIRES_HISTORY_RULE',
  'LEDGER_FORMULA_PARITY_NOT_PROVEN',
  'MATCH_SHA_MISMATCH_UNRESOLVED',
  'REAL_DATA_MIGRATION_NOT_AUTHORIZED'
]);
assert.equal(x.dataCopied,false);
assert.equal(x.sourceWritten,false);
assert.equal(x.d1Written,false);
assert.equal(x.apiRoutingChanged,false);
assert.throws(()=>assessReadOnlyAggregates({...SAMPLE,memberEmail:'synthetic@example.com'}),/AGGREGATE_FIELDS_ONLY/);
assert.throws(()=>assessReadOnlyAggregates({...SAMPLE,individualData:['person']}),/AGGREGATE_FIELDS_ONLY/);
assert.throws(()=>assessReadOnlyAggregates({...SAMPLE,responseDatesUnmatched:7}),/AGGREGATE_INVARIANT/);
assert.throws(()=>assessReadOnlyAggregates({...SAMPLE,duplicateEmailDateRows:10}),/AGGREGATE_INVARIANT/);
assert.throws(()=>assessReadOnlyAggregates({...SAMPLE,managementTabs:-1}),/BAD_NONIDENTIFYING_COUNT/);
assert.throws(()=>assessReadOnlyAggregates({...SAMPLE,mode:'write'}),/AGGREGATE_MODE_REQUIRED/);
const empty=assessReadOnlyAggregates({...SAMPLE,managementTabs:6,
  syntheticTabs:6,legacyTabs:6,practiceDates:0,receptionEnabledDates:0,
  responseRows:0,responseDatesMatched:0,responseDatesUnmatched:0,
  unmatchedBeforeEarliestMaster:0,duplicateEmailDateRows:0,
  sampledFormulaCells:0,shaMismatchVersions:0});
assert.deepEqual(empty.issues,[
  'AUTHORITATIVE_SOURCE_NOT_SELECTED','REAL_DATA_MIGRATION_NOT_AUTHORIZED'
]);
assert.equal(empty.status,'BLOCKED_FROM_MIGRATION');
assert.ok(!JSON.stringify(x).includes('synthetic@example.com'));
console.log('PHASE21_READONLY_AGGREGATE_GATE_PASS: strict anonymous counts, missing-history and duplicate-response block, formula/SHA, no source/Cloudflare/API mutations, no implicit migration approval');
