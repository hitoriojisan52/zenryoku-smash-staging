/**
 * Phase24: source eligibility for D1 migration planning.
 * User confirmed the pre-management three-tab accounting workbook contains only
 * sample data; it is outside migration scope, not a financial archive candidate.
 * This is an offline plan gate only; it has no Google/D1/network/credential access.
 */
export const PHASE24_SOURCE_POLICY = Object.freeze({
  canonicalCandidateRole: 'management-13-tabs',
  excludedRoles: Object.freeze([
    'historical-3-tabs-readonly',
    'synthetic-21-tabs'
  ]),
  legacyThreeTabIsSampleOnly: true,
  legacyThreeTabBusinessMigrationAllowed: false,
  legacyThreeTabHistoricalArchiveRequired: false,
  backupFolderMustRemainUnmodified: true,
  actualDataCopyAuthorized: false,
  actualD1WriteAuthorized: false,
  productionCutoverAuthorized: false
});

export function assertD1MigrationPlanSource(sourceRole, operation = 'plan') {
  if (typeof sourceRole !== 'string' ||
      !['management-13-tabs','historical-3-tabs-readonly','synthetic-21-tabs'].includes(sourceRole)) {
    throw new Error('UNRECOGNIZED_SOURCE_ROLE');
  }
  if (operation !== 'plan') {
    throw new Error('ACTUAL_DATA_TRANSFER_NOT_AUTHORIZED');
  }
  if (sourceRole !== PHASE24_SOURCE_POLICY.canonicalCandidateRole) {
    throw new Error('NONCANONICAL_SAMPLE_SOURCE_EXCLUDED');
  }
  return Object.freeze({
    sourceRole,
    scope: 'plan-only',
    actualDataTransferAuthorized: false,
    currentGASIsOperationalTruth: true
  });
}
