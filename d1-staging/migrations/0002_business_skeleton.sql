-- 0002: EMPTY staging-only business storage structures based on the 20 non-guide
-- sheets of "全力☆スマッシュ 接続検証用 v0.15（架空データ）", 2026-11-21.
-- NO rows are copied; legacy GAS/Sheets remain sole system of record.
-- These are candidate storage types: they do NOT authorize a read/write cutover.
-- Historical actor IDs intentionally have NO FK to current members: withdrawal
-- physically deletes the current member while preserving all prior audit rows.
CREATE TABLE IF NOT EXISTS members (
  member_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  line_user_id TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  is_admin INTEGER NOT NULL CHECK(is_admin IN (0,1)),
  name_kana TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS duty_teams (
  team_id TEXT PRIMARY KEY NOT NULL,
  team_name TEXT NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0,1))
);

CREATE TABLE IF NOT EXISTS team_memberships (
  team_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  PRIMARY KEY (team_id, member_id),
  FOREIGN KEY (team_id) REFERENCES duty_teams(team_id),
  FOREIGN KEY (member_id) REFERENCES members(member_id)
);

CREATE TABLE IF NOT EXISTS practices (
  practice_id TEXT PRIMARY KEY NOT NULL,
  practice_date TEXT NOT NULL,
  place TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  hours INTEGER NOT NULL,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  remark TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0)
);

CREATE TABLE IF NOT EXISTS attendances (
  practice_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  name_kana TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  attending INTEGER NOT NULL CHECK(attending IN (0,1)),
  remark TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
  registered_by_member_id TEXT,
  PRIMARY KEY (practice_id, participant_id),
  FOREIGN KEY (practice_id) REFERENCES practices(practice_id)
);

CREATE TABLE IF NOT EXISTS payments (
  practice_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  completed INTEGER NOT NULL CHECK(completed IN (0,1)),
  version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
  updated_by_member_id TEXT,
  updated_at_raw TEXT,
  PRIMARY KEY (practice_id, participant_id),
  FOREIGN KEY (practice_id, participant_id)
    REFERENCES attendances(practice_id, participant_id)
);

-- Monetary values use integer JPY. Negative balance is valid.
-- Previous balance + income - expense is calculated by the approved GAS rule;
-- this table does not independently authorize ledger mutations.
CREATE TABLE IF NOT EXISTS ledger_rows (
  row_id TEXT PRIMARY KEY NOT NULL,
  ledger_date TEXT NOT NULL,
  label TEXT NOT NULL,
  income_yen INTEGER NOT NULL DEFAULT 0 CHECK(income_yen >= 0),
  expense_yen INTEGER NOT NULL DEFAULT 0 CHECK(expense_yen >= 0),
  balance_yen INTEGER NOT NULL,
  confirmed_by TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK(kind IN ('opening','practice','reimbursement','other')),
  practice_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('open','confirmed')),
  version INTEGER NOT NULL CHECK(version >= 0),
  adjustment_yen INTEGER NOT NULL DEFAULT 0,
  item TEXT NOT NULL DEFAULT '',
  payee TEXT NOT NULL DEFAULT '',
  receipt_file_id TEXT NOT NULL DEFAULT '',
  created_by_member_id TEXT,
  FOREIGN KEY (practice_id) REFERENCES practices(practice_id)
);

CREATE TABLE IF NOT EXISTS operation_audit (
  operation_id TEXT PRIMARY KEY NOT NULL,
  operation TEXT NOT NULL,
  actor_member_id TEXT,
  timestamp_raw TEXT NOT NULL,
  target_id TEXT,
  result_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS match_sessions (
  practice_id TEXT PRIMARY KEY NOT NULL,
  active_revision_id TEXT NOT NULL,
  session_version INTEGER NOT NULL CHECK(session_version >= 0),
  settings_version INTEGER NOT NULL CHECK(settings_version >= 0),
  updated_at_raw TEXT,
  FOREIGN KEY (practice_id) REFERENCES practices(practice_id)
);

-- Sheet stateJSON is chunked by UTF-16 code units; retain chunk index/total and
-- hash until a byte-for-byte equivalence/undo test authorizes different storage.
CREATE TABLE IF NOT EXISTS match_revision_chunks (
  revision_id TEXT NOT NULL,
  practice_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK(stage IN ('staging','ready')),
  state_json_chunk TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  created_at_raw TEXT,
  chunk_index INTEGER NOT NULL CHECK(chunk_index >= 1),
  chunk_total INTEGER NOT NULL CHECK(chunk_total >= 1),
  PRIMARY KEY (revision_id, chunk_index),
  FOREIGN KEY (practice_id) REFERENCES practices(practice_id)
);

CREATE TABLE IF NOT EXISTS match_operation_audit (
  operation_id TEXT PRIMARY KEY NOT NULL,
  practice_id TEXT NOT NULL,
  actor_member_id TEXT,
  action TEXT NOT NULL,
  session_version INTEGER NOT NULL,
  created_at_raw TEXT NOT NULL,
  details TEXT,
  FOREIGN KEY (practice_id) REFERENCES practices(practice_id)
);

CREATE TABLE IF NOT EXISTS registration_requests (
  request_id TEXT PRIMARY KEY NOT NULL,
  line_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_at_raw TEXT,
  decided_by_member_id TEXT,
  decided_at_raw TEXT,
  member_id TEXT,
  name_kana TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS guest_links (
  token_hash TEXT PRIMARY KEY NOT NULL,
  practice_id TEXT NOT NULL,
  expires_at_raw TEXT NOT NULL,
  revoked_at_raw TEXT,
  issued_by_member_id TEXT,
  created_at_raw TEXT,
  FOREIGN KEY (practice_id) REFERENCES practices(practice_id)
);

CREATE TABLE IF NOT EXISTS withdrawal_history (
  member_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  withdrawn_at_raw TEXT,
  withdrawn_by_member_id TEXT,
  state TEXT NOT NULL,
  operation_id TEXT PRIMARY KEY NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_audits (
  practice_id TEXT NOT NULL,
  audit_date TEXT NOT NULL,
  counts_json TEXT NOT NULL,
  cash_total_yen INTEGER NOT NULL,
  book_balance_yen INTEGER NOT NULL,
  difference_yen INTEGER NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 0),
  updated_by_member_id TEXT,
  updated_at_raw TEXT,
  PRIMARY KEY (practice_id, audit_date),
  FOREIGN KEY (practice_id) REFERENCES practices(practice_id)
);

CREATE TABLE IF NOT EXISTS practice_delete_archive_chunks (
  operation_id TEXT NOT NULL,
  practice_id TEXT NOT NULL,
  archived_at_raw TEXT,
  archived_by_member_id TEXT,
  chunk_index INTEGER NOT NULL CHECK(chunk_index >= 1),
  chunk_count INTEGER NOT NULL CHECK(chunk_count >= 1),
  snapshot_chunk TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (operation_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS participant_action_archive (
  operation_id TEXT PRIMARY KEY NOT NULL,
  practice_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT NOT NULL,
  created_at_raw TEXT,
  actor_member_id TEXT,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS match_delete_archive_chunks (
  operation_id TEXT NOT NULL,
  practice_id TEXT NOT NULL,
  archived_at_raw TEXT,
  archived_by_member_id TEXT,
  chunk_index INTEGER NOT NULL CHECK(chunk_index >= 1),
  chunk_count INTEGER NOT NULL CHECK(chunk_count >= 1),
  snapshot_chunk TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (operation_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS visitor_requests (
  request_id TEXT PRIMARY KEY NOT NULL,
  practice_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_kana TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  requested_by_member_id TEXT,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
  requested_at_raw TEXT,
  reviewed_at_raw TEXT,
  reviewed_by_member_id TEXT,
  last_operation_id TEXT,
  FOREIGN KEY (practice_id) REFERENCES practices(practice_id)
);

CREATE TABLE IF NOT EXISTS visitor_decision_archive (
  operation_id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL,
  practice_id TEXT NOT NULL,
  actor_member_id TEXT,
  action TEXT NOT NULL,
  before_json TEXT NOT NULL,
  created_at_raw TEXT,
  status TEXT NOT NULL
);

-- Read-only lookup performance indexes, safe for empty staging tables.
CREATE INDEX IF NOT EXISTS ix_practices_date ON practices(practice_date, practice_id);
CREATE INDEX IF NOT EXISTS ix_attendances_practice ON attendances(practice_id, attending, category, name_kana);
CREATE INDEX IF NOT EXISTS ix_payments_practice ON payments(practice_id, completed);
CREATE INDEX IF NOT EXISTS ix_ledger_chronology ON ledger_rows(ledger_date, kind, row_id);
CREATE INDEX IF NOT EXISTS ix_ledger_practice ON ledger_rows(practice_id);
CREATE INDEX IF NOT EXISTS ix_guest_links_practice ON guest_links(practice_id);
CREATE INDEX IF NOT EXISTS ix_match_revision_practice ON match_revision_chunks(practice_id, revision_id);
CREATE INDEX IF NOT EXISTS ix_match_audit_practice ON match_operation_audit(practice_id, session_version);
CREATE INDEX IF NOT EXISTS ix_registration_line ON registration_requests(line_user_id);
CREATE INDEX IF NOT EXISTS ix_visitor_practice_status ON visitor_requests(practice_id, status);
CREATE INDEX IF NOT EXISTS ix_visitor_requested_by ON visitor_requests(requested_by_member_id);
CREATE INDEX IF NOT EXISTS ix_archive_practice ON practice_delete_archive_chunks(practice_id);
