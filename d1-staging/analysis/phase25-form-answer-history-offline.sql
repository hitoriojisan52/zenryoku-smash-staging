-- Phase25: PROPOSAL / FICTIONAL OFFLINE SQLITE ONLY. NOT a Cloudflare migration.
-- Preserve each original Form response row independently of current practices,
-- member IDs, payment records and active roster. No real Google records in tests.
-- Full native Sheet cell types/formulas/formatting require separate backup policy.
CREATE TABLE phase25_synthetic_form_response_history (
  source_role TEXT NOT NULL DEFAULT 'management-13-tabs'
    CHECK (source_role = 'management-13-tabs'),
  source_row_number INTEGER NOT NULL CHECK (source_row_number >= 2),
  -- JSON array of all 7 DISPLAYED cell values [A..G], including blanks.
  source_displayed_cells_json TEXT NOT NULL
    CHECK (json_valid(source_displayed_cells_json) = 1
      AND json_type(source_displayed_cells_json) = 'array'
      AND json_array_length(source_displayed_cells_json) = 7),
  date_index TEXT NOT NULL CHECK (length(date_index) = 10
      AND date_index GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  historical_outside_master INTEGER NOT NULL
    CHECK (historical_outside_master IN (0,1)),
  PRIMARY KEY (source_role, source_row_number)
);

CREATE TRIGGER phase25_no_history_update
BEFORE UPDATE ON phase25_synthetic_form_response_history
BEGIN SELECT RAISE(ABORT, 'SOURCE_FORM_HISTORY_IMMUTABLE'); END;

CREATE TRIGGER phase25_no_history_delete
BEFORE DELETE ON phase25_synthetic_form_response_history
BEGIN SELECT RAISE(ABORT, 'SOURCE_FORM_HISTORY_IMMUTABLE'); END;

-- This is intentionally a SOURCE-ONLY view: it never feeds the
-- live attendances/payments/ledger tables or reopens old schedule dates.
CREATE VIEW phase25_synthetic_form_history_readonly AS
 SELECT source_row_number, date_index, historical_outside_master,
        source_displayed_cells_json
 FROM phase25_synthetic_form_response_history;
