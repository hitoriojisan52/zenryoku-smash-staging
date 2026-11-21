-- Phase26 APPROVED DESIGN A: SQLite :memory: PROOF ONLY.
-- Deliberately in analysis/ (NOT d1-staging/migrations/).
-- Not a migration, not a live D1 write, and not a permission to copy PII.
-- Source: current 13-tab management workbook, Form response A:G only.
-- 3-tab sample is excluded. No FK or write path to active domain tables.

CREATE TABLE phase26_synthetic_form_snapshots (
  snapshot_id TEXT PRIMARY KEY NOT NULL
    CHECK (length(snapshot_id) BETWEEN 8 AND 96),
  source_role TEXT NOT NULL
    CHECK (source_role = 'management-13-tabs'),
  source_tab TEXT NOT NULL
    CHECK (source_tab = 'フォームの回答'),
  source_columns INTEGER NOT NULL CHECK (source_columns = 7),
  capture_basis TEXT NOT NULL
    CHECK (capture_basis = 'displayed-only-unverified-native-types'),
  captured_at_utc TEXT NOT NULL CHECK (length(captured_at_utc) >= 20),
  expected_rows INTEGER NOT NULL CHECK (expected_rows >= 0),
  manifest_sha256 TEXT NOT NULL
    CHECK (length(manifest_sha256) = 64
      AND manifest_sha256 NOT GLOB '*[^0-9a-f]*')
);

CREATE TABLE phase26_synthetic_form_rows (
  snapshot_id TEXT NOT NULL
    REFERENCES phase26_synthetic_form_snapshots(snapshot_id),
  source_row_number INTEGER NOT NULL CHECK (source_row_number >= 2),
  -- Source columns A:G in original order, as a seven-element JSON array.
  displayed_cells_json TEXT NOT NULL
    CHECK (json_valid(displayed_cells_json) = 1
      AND json_type(displayed_cells_json) = 'array'
      AND json_array_length(displayed_cells_json) = 7),
  row_sha256 TEXT NOT NULL
    CHECK (length(row_sha256) = 64
      AND row_sha256 NOT GLOB '*[^0-9a-f]*'),
  date_index TEXT NOT NULL
    CHECK (date_index GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  is_in_current_master_at_capture INTEGER NOT NULL
    CHECK (is_in_current_master_at_capture IN (0,1)),
  PRIMARY KEY (snapshot_id, source_row_number)
);

CREATE INDEX phase26_synthetic_form_snapshot_order
  ON phase26_synthetic_form_rows(snapshot_id, source_row_number);

CREATE VIEW phase26_synthetic_form_readonly AS
  SELECT r.snapshot_id,r.source_row_number,r.displayed_cells_json,
         r.row_sha256,r.date_index,r.is_in_current_master_at_capture
  FROM phase26_synthetic_form_rows AS r;

-- Protect an observed snapshot from accidental UPDATE/DELETE/REPLACE.
-- BEFORE INSERT duplicate guard also rejects INSERT OR REPLACE (whose delete
-- trigger behavior may depend on recursive_triggers).
CREATE TRIGGER phase26_form_snapshot_reject_duplicate
BEFORE INSERT ON phase26_synthetic_form_snapshots
WHEN EXISTS (
  SELECT 1 FROM phase26_synthetic_form_snapshots
  WHERE snapshot_id=NEW.snapshot_id
)
BEGIN
  SELECT RAISE(ABORT,'FORM_SNAPSHOT_ALREADY_EXISTS');
END;

CREATE TRIGGER phase26_form_row_reject_duplicate
BEFORE INSERT ON phase26_synthetic_form_rows
WHEN EXISTS (
  SELECT 1 FROM phase26_synthetic_form_rows
  WHERE snapshot_id=NEW.snapshot_id AND source_row_number=NEW.source_row_number
)
BEGIN
  SELECT RAISE(ABORT,'FORM_SOURCE_ROW_ALREADY_EXISTS');
END;

CREATE TRIGGER phase26_form_snapshot_reject_update
BEFORE UPDATE ON phase26_synthetic_form_snapshots
BEGIN SELECT RAISE(ABORT,'FORM_SNAPSHOT_IMMUTABLE'); END;

CREATE TRIGGER phase26_form_snapshot_reject_delete
BEFORE DELETE ON phase26_synthetic_form_snapshots
BEGIN SELECT RAISE(ABORT,'FORM_SNAPSHOT_IMMUTABLE'); END;

CREATE TRIGGER phase26_form_row_reject_update
BEFORE UPDATE ON phase26_synthetic_form_rows
BEGIN SELECT RAISE(ABORT,'FORM_SOURCE_ROW_IMMUTABLE'); END;

CREATE TRIGGER phase26_form_row_reject_delete
BEFORE DELETE ON phase26_synthetic_form_rows
BEGIN SELECT RAISE(ABORT,'FORM_SOURCE_ROW_IMMUTABLE'); END;
