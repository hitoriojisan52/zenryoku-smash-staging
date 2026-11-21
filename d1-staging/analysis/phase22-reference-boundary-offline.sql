-- Phase22: OFFLINE SQLITE IN-MEMORY FIXTURE ONLY.
-- Not a Cloudflare D1 migration or business schema. NEVER deploy or fill
-- these tables with Google Sheet contents. All rows inserted by tests are invented.
PRAGMA foreign_keys=ON;

CREATE TABLE synthetic_canonical_ledger (
  fixture_row_id TEXT PRIMARY KEY NOT NULL,
  event_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('opening','practice','reimbursement','other')),
  income_yen INTEGER NOT NULL CHECK(income_yen>=0),
  expense_yen INTEGER NOT NULL CHECK(expense_yen>=0),
  balance_yen INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','confirmed')),
  source_role TEXT NOT NULL CHECK(source_role='canonical-13-only')
);

CREATE TABLE synthetic_legacy_reference_ledger (
  fixture_ref_id TEXT PRIMARY KEY NOT NULL,
  historical_date TEXT NOT NULL,
  marker TEXT NOT NULL,
  source_role TEXT NOT NULL CHECK(source_role='legacy-3-reference-only')
);

CREATE TRIGGER deny_reference_to_canonical
BEFORE INSERT ON synthetic_canonical_ledger
WHEN NEW.source_role <> 'canonical-13-only'
BEGIN
  SELECT RAISE(ABORT,'LEGACY_REFERENCE_NOT_AUTHORIZED_FOR_ACTIVE_LEDGER');
END;

CREATE TRIGGER deny_reference_edit
BEFORE UPDATE ON synthetic_legacy_reference_ledger
BEGIN
  SELECT RAISE(ABORT,'LEGACY_REFERENCE_IS_IMMUTABLE');
END;

CREATE TRIGGER deny_reference_delete
BEFORE DELETE ON synthetic_legacy_reference_ledger
BEGIN
  SELECT RAISE(ABORT,'LEGACY_REFERENCE_DELETION_NOT_AUTHORIZED');
END;

CREATE VIEW synthetic_active_ledger_only AS
SELECT fixture_row_id,event_date,kind,income_yen,expense_yen,balance_yen,status
FROM synthetic_canonical_ledger
WHERE source_role='canonical-13-only';

-- A reference row must never be included in active balance or silently mapped
-- into active row identifiers. Archive/import SQL is intentionally absent.
