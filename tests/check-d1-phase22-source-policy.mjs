import assert from 'node:assert/strict';
import {assessCanonicalReferenceOnly,PHASE22_SOURCE_ROLES}
  from '../d1-staging/analysis/phase22-canonical-source-policy.mjs';

// All numbers are deliberately fictitious. Never import production observations into CI.
const fictional={mode:'aggregate-only',canonicalCandidateTabs:13,
  legacyReferenceTabs:3,d1CandidateBusinessTables:20,
  canonicalLedgerDatedRows:9,canonicalLedgerDistinctDateKeys:6,
  legacyLedgerDatedRows:12,legacyLedgerDistinctDateKeys:8,
  sharedLedgerDistinctDateKeys:0,legacyRowsOlderThanCanonicalRange:12,
  legacyRowsInsideCanonicalRange:0,legacyRowsNewerThanCanonicalRange:0,
  pastAttendanceMissingMasterRows:7,repeatedAttendanceCompositeRows:3,
  legacyMatchShaMismatches:9};
const result=assessCanonicalReferenceOnly(fictional);
assert.equal(result.policy,'CANONICAL_CANDIDATE_AND_REFERENCE_ONLY');
assert.equal(result.roles.canonicalCandidate,'management-13-tabs');
assert.equal(result.roles.legacyReference,'historical-3-tabs-readonly');
assert.equal(result.roles.legacyAutoMerged,false);
assert.equal(result.status,'STOP_BEFORE_REAL_DATA_MIGRATION');
assert.equal(result.historicalReferenceCanBeAddedToActiveLedger,false);
assert.equal(result.oldReferenceLedgerMayBeDeleted,false);
assert.equal(result.readOnlyHistoricalArchiveAuthorized,false);
assert.equal(result.doNotDeduplicateOrRecalculateLegacyBalances,true);
assert.deepEqual(result.issues,[
  'OLD_REFERENCE_HAS_NONOVERLAPPING_LEDGER_DATES',
  'OLD_ATTENDANCE_DATES_REQUIRE_HISTORY_POLICY',
  'ATTENDANCE_REPEATED_COMPOSITE_KEYS_NEED_RULE',
  'LEGACY_MATCH_SHA_NOT_VERIFIED',
  'OLD_REFERENCE_ARCHIVE_CHOICE_NOT_APPROVED',
  'FINANCIAL_OPENING_AND_CONFIRMED_BALANCE_PARITY_NOT_PROVED',
  'REAL_DATA_MIGRATION_AND_PRODUCTION_NOT_APPROVED'
]);
assert.throws(()=>assessCanonicalReferenceOnly({...fictional,email:'fictional@example.invalid'}),/REJECT_PERSONAL_OR_UNEXPECTED_FIELD/);
assert.throws(()=>assessCanonicalReferenceOnly({...fictional,ledgerRowAmount:100}),/REJECT_PERSONAL_OR_UNEXPECTED_FIELD/);
assert.throws(()=>assessCanonicalReferenceOnly({...fictional,mode:'live-import'}),/REJECT_PERSONAL_OR_UNEXPECTED_FIELD/);
assert.throws(()=>assessCanonicalReferenceOnly({...fictional,legacyRowsOlderThanCanonicalRange:13}),/REJECT_INCONSISTENT_CENSUS/);
assert.throws(()=>assessCanonicalReferenceOnly({...fictional,sharedLedgerDistinctDateKeys:9}),/REJECT_INCONSISTENT_CENSUS/);
assert.throws(()=>assessCanonicalReferenceOnly({...fictional,canonicalLedgerDatedRows:-1}),/REJECT_INVALID_AGGREGATE/);
// No data means no implicit migration authorization, even if the shape matches.
const noHistory=assessCanonicalReferenceOnly({...fictional,
  canonicalLedgerDatedRows:0,canonicalLedgerDistinctDateKeys:0,
  legacyLedgerDatedRows:0,legacyLedgerDistinctDateKeys:0,sharedLedgerDistinctDateKeys:0,
  legacyRowsOlderThanCanonicalRange:0,
  pastAttendanceMissingMasterRows:0,repeatedAttendanceCompositeRows:0,
  legacyMatchShaMismatches:0});
assert.equal(noHistory.status,'STOP_BEFORE_REAL_DATA_MIGRATION');
assert.equal(noHistory.historicalReferenceCanBeAddedToActiveLedger,false);
assert.equal(noHistory.oldReferenceLedgerMayBeDeleted,false);
assert.equal(noHistory.readOnlyHistoricalArchiveAuthorized,false);
assert.deepEqual(noHistory.issues,[
  'OLD_REFERENCE_ARCHIVE_CHOICE_NOT_APPROVED',
  'FINANCIAL_OPENING_AND_CONFIRMED_BALANCE_PARITY_NOT_PROVED',
  'REAL_DATA_MIGRATION_AND_PRODUCTION_NOT_APPROVED'
]);
assert.ok(!JSON.stringify(result).includes('fictional@example.invalid'));
console.log('PHASE22_SOURCE_ROLE_GATES_PASS: strict anonymous aggregate, 13-tab candidate and 3-tab reference-only, zero silent legacy ledger merge, history archive requires explicit approval, copy/cutover blocked');
