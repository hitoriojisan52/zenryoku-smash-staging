/**
 * Phase22: user-approved 13-tab canonical *candidate*, 3-tab reference ONLY.
 *
 * Strict non-identifying aggregate contract. Absolutely no Google/D1 read/write,
 * live values, source IDs, dates, row contents, file copy, or migration actions.
 * Neither selection nor a clean census authorizes a real-data import.
 */
const KEYS=Object.freeze([
  'mode','canonicalCandidateTabs','legacyReferenceTabs','d1CandidateBusinessTables',
  'canonicalLedgerDatedRows','canonicalLedgerDistinctDateKeys',
  'legacyLedgerDatedRows','legacyLedgerDistinctDateKeys',
  'sharedLedgerDistinctDateKeys','legacyRowsOlderThanCanonicalRange',
  'legacyRowsInsideCanonicalRange','legacyRowsNewerThanCanonicalRange',
  'pastAttendanceMissingMasterRows','repeatedAttendanceCompositeRows',
  'legacyMatchShaMismatches'
]);
const NUM=KEYS.filter(k=>k!=='mode');
export const PHASE22_SOURCE_ROLES=Object.freeze({
  canonicalCandidate:'management-13-tabs',
  legacyReference:'historical-3-tabs-readonly',
  legacyAutoMerged:false,
  individualDataAuthorized:false,
  fileCopyAuthorized:false,
  cloudD1WriteAuthorized:false,
  productionCutoverAuthorized:false
});
function validate(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.keys(input).sort().join('|')!==[...KEYS].sort().join('|')||
     input.mode!=='aggregate-only')throw Error('REJECT_PERSONAL_OR_UNEXPECTED_FIELD');
  for(const k of NUM)if(!Number.isSafeInteger(input[k])||input[k]<0)
    throw Error('REJECT_INVALID_AGGREGATE');
  if(input.canonicalLedgerDistinctDateKeys>input.canonicalLedgerDatedRows||
    input.legacyLedgerDistinctDateKeys>input.legacyLedgerDatedRows||
    input.sharedLedgerDistinctDateKeys>Math.min(input.canonicalLedgerDistinctDateKeys,input.legacyLedgerDistinctDateKeys)||
    input.legacyRowsOlderThanCanonicalRange+input.legacyRowsInsideCanonicalRange+
      input.legacyRowsNewerThanCanonicalRange!==input.legacyLedgerDatedRows)
    throw Error('REJECT_INCONSISTENT_CENSUS');
}
export function assessCanonicalReferenceOnly(input){
  validate(input);
  const flags=[];
  if(input.canonicalCandidateTabs!==13||input.legacyReferenceTabs!==3||
     input.d1CandidateBusinessTables!==20)flags.push('SCHEMA_ROLES_NEED_REVIEW');
  if(input.legacyLedgerDatedRows>0&&
     (input.sharedLedgerDistinctDateKeys<input.legacyLedgerDistinctDateKeys ||
      input.legacyRowsOlderThanCanonicalRange>0))
    flags.push('OLD_REFERENCE_HAS_NONOVERLAPPING_LEDGER_DATES');
  if(input.pastAttendanceMissingMasterRows>0)
    flags.push('OLD_ATTENDANCE_DATES_REQUIRE_HISTORY_POLICY');
  if(input.repeatedAttendanceCompositeRows>0)
    flags.push('ATTENDANCE_REPEATED_COMPOSITE_KEYS_NEED_RULE');
  if(input.legacyMatchShaMismatches>0)
    flags.push('LEGACY_MATCH_SHA_NOT_VERIFIED');
  flags.push('OLD_REFERENCE_ARCHIVE_CHOICE_NOT_APPROVED');
  flags.push('FINANCIAL_OPENING_AND_CONFIRMED_BALANCE_PARITY_NOT_PROVED');
  flags.push('REAL_DATA_MIGRATION_AND_PRODUCTION_NOT_APPROVED');
  return Object.freeze({
    policy:'CANONICAL_CANDIDATE_AND_REFERENCE_ONLY',
    roles:PHASE22_SOURCE_ROLES,
    historicalReferenceCanBeAddedToActiveLedger:false,
    oldReferenceLedgerMayBeDeleted:false,
    readOnlyHistoricalArchiveAuthorized:false,
    doNotDeduplicateOrRecalculateLegacyBalances:true,
    status:'STOP_BEFORE_REAL_DATA_MIGRATION',
    issues:Object.freeze(flags)
  });
}
