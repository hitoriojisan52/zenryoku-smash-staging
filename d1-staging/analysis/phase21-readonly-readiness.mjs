/**
 * Phase21: privacy-safe, aggregate-only D1 migration-readiness gate.
 * NO Google OAuth, no fetch, no filesystem, no source-data serialization,
 * no Cloudflare calls, no personal values, no migration/write route.
 * Caller must supply already-computed NON-IDENTIFYING counts only.
 */
const NUMERIC_FIELDS=[
  'managementTabs','legacyTabs','syntheticTabs','d1BusinessTables',
  'practiceDates','receptionEnabledDates','responseRows',
  'responseDatesMatched','responseDatesUnmatched',
  'unmatchedBeforeEarliestMaster','unmatchedWithinMasterRange',
  'unmatchedAfterLatestMaster','duplicateEmailDateRows',
  'sampledFormulaCells','shaMismatchVersions'
];
export const CENSUS_CONTRACT=Object.freeze({
  mode:'read-only-aggregate',
  sourceOfTruth:'unconfirmed',
  readonly:true,
  migrationAuthorized:false,
  destinationWritesAuthorized:false,
  sourceFileCopiesAuthorized:false
});
const FAIL=Object.freeze({
  UNCONFIRMED_SOURCE:'AUTHORITATIVE_SOURCE_NOT_SELECTED',
  DIFFERENT_SHAPES:'SOURCE_AND_CANDIDATE_SCHEMAS_NOT_ISOMORPHIC',
  HISTORICAL:'HISTORICAL_RESPONSES_ABSENT_FROM_CURRENT_PRACTICE_MASTER',
  DUPLICATE:'REPEATED_LEGACY_RESPONSE_KEY_REQUIRES_HISTORY_RULE',
  FORMULA:'LEDGER_FORMULA_PARITY_NOT_PROVEN',
  SHA:'MATCH_SHA_MISMATCH_UNRESOLVED',
  APPROVAL:'REAL_DATA_MIGRATION_NOT_AUTHORIZED'
});
export function assessReadOnlyAggregates(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||
     input.mode!==CENSUS_CONTRACT.mode)throw Error('AGGREGATE_MODE_REQUIRED');
  const keys=Object.keys(input).sort(),allowed=['mode',...NUMERIC_FIELDS].sort();
  if(keys.join('|')!==allowed.join('|'))throw Error('AGGREGATE_FIELDS_ONLY');
  for(const k of NUMERIC_FIELDS)if(!Number.isSafeInteger(input[k])||input[k]<0)
    throw Error('BAD_NONIDENTIFYING_COUNT');
  if(input.receptionEnabledDates>input.practiceDates||
     input.responseDatesMatched+input.responseDatesUnmatched!==input.responseRows||
     input.unmatchedBeforeEarliestMaster+input.unmatchedWithinMasterRange+
       input.unmatchedAfterLatestMaster!==input.responseDatesUnmatched||
     input.duplicateEmailDateRows>input.responseRows)
    throw Error('AGGREGATE_INVARIANT_VIOLATION');
  const blocks=[FAIL.UNCONFIRMED_SOURCE];
  if(input.managementTabs!==input.syntheticTabs||
     input.managementTabs!==input.d1BusinessTables||
     input.legacyTabs!==input.d1BusinessTables)
    blocks.push(FAIL.DIFFERENT_SHAPES);
  if(input.responseDatesUnmatched>0)blocks.push(FAIL.HISTORICAL);
  if(input.duplicateEmailDateRows>0)blocks.push(FAIL.DUPLICATE);
  if(input.sampledFormulaCells>0)blocks.push(FAIL.FORMULA);
  if(input.shaMismatchVersions>0)blocks.push(FAIL.SHA);
  blocks.push(FAIL.APPROVAL);
  return Object.freeze({
    status:'BLOCKED_FROM_MIGRATION',
    mode:CENSUS_CONTRACT.mode,
    dataCopied:false,sourceWritten:false,d1Written:false,
    apiRoutingChanged:false,
    issues:Object.freeze(blocks)
  });
}
