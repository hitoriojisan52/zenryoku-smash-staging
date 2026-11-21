import assert from 'node:assert/strict';
import {
  PHASE24_SOURCE_POLICY as p,
  assertD1MigrationPlanSource as assess
} from '../d1-staging/analysis/phase24-approved-source-guard.mjs';

assert.equal(p.canonicalCandidateRole, 'management-13-tabs');
assert.equal(p.legacyThreeTabIsSampleOnly, true);
assert.equal(p.legacyThreeTabBusinessMigrationAllowed, false);
assert.equal(p.legacyThreeTabHistoricalArchiveRequired, false);
assert.equal(p.backupFolderMustRemainUnmodified, true);
assert.equal(p.actualDataCopyAuthorized, false);
assert.equal(p.actualD1WriteAuthorized, false);
assert.equal(p.productionCutoverAuthorized, false);
assert.deepEqual(p.excludedRoles, [
  'historical-3-tabs-readonly','synthetic-21-tabs'
]);

const candidate = assess('management-13-tabs','plan');
assert.equal(candidate.scope, 'plan-only');
assert.equal(candidate.actualDataTransferAuthorized, false);
assert.equal(candidate.currentGASIsOperationalTruth, true);

for (const role of p.excludedRoles) {
  assert.throws(() => assess(role, 'plan'), /NONCANONICAL_SAMPLE_SOURCE_EXCLUDED/);
  assert.throws(() => assess(role, 'migrate'), /ACTUAL_DATA_TRANSFER_NOT_AUTHORIZED/);
}
for (const operation of ['migrate','copy','archive','cutover','write']) {
  assert.throws(() => assess('management-13-tabs',operation), /ACTUAL_DATA_TRANSFER_NOT_AUTHORIZED/);
}
assert.throws(() => assess('unknown-source','plan'), /UNRECOGNIZED_SOURCE_ROLE/);
assert.throws(() => assess({email:'fake@example.invalid'},'plan'), /UNRECOGNIZED_SOURCE_ROLE/);
assert.throws(() => assess('management-13-tabs',undefined), /ACTUAL_DATA_TRANSFER_NOT_AUTHORIZED/);
assert.ok(Object.isFrozen(p));
assert.ok(Object.isFrozen(p.excludedRoles));
console.log('PHASE24_SAMPLE_SOURCE_EXCLUSION_PASS: old three-tab and synthetic fixture excluded; 13-tab planning only; backup, actual migration and production unchanged');
