#!/usr/bin/env python3
"""Offline contract checks; uses ONLY an ephemeral in-memory SQLite DB.
Never connects to Google Sheets, Cloudflare, Workers, or production data.
"""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
DB = sqlite3.connect(":memory:")
DB.execute("PRAGMA foreign_keys=ON")
for migration in sorted((ROOT / "d1-staging/migrations").glob("*.sql")):
    DB.executescript(migration.read_text(encoding="utf-8"))

expected = {
  "members", "duty_teams", "team_memberships", "practices",
  "attendances", "payments", "ledger_rows", "operation_audit",
  "match_sessions", "match_revision_chunks", "match_operation_audit",
  "registration_requests", "guest_links", "withdrawal_history",
  "cash_audits", "practice_delete_archive_chunks",
  "participant_action_archive", "match_delete_archive_chunks",
  "visitor_requests", "visitor_decision_archive",
}
tables = {r[0] for r in DB.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
)}
assert tables == expected | {"stage_d1_bootstrap"}, sorted(tables ^ (expected | {"stage_d1_bootstrap"}))

def columns(table):
    return {r[1] for r in DB.execute(f"PRAGMA table_info({table})")}

required = {
  "members": {"member_id", "line_user_id", "is_admin", "active", "name_kana"},
  "practices": {"practice_id", "practice_date", "enabled", "version"},
  "attendances": {"practice_id", "participant_id", "attending", "version", "registered_by_member_id"},
  "payments": {"practice_id", "participant_id", "completed", "version"},
  "ledger_rows": {"row_id", "kind", "ledger_date", "balance_yen", "adjustment_yen", "status", "receipt_file_id", "version"},
  "operation_audit": {"operation_id", "result_json", "actor_member_id"},
  "match_sessions": {"practice_id", "active_revision_id", "session_version", "settings_version"},
  "match_revision_chunks": {"revision_id", "stage", "state_json_chunk", "sha256", "chunk_index", "chunk_total"},
  "match_operation_audit": {"operation_id", "session_version"},
  "withdrawal_history": {"member_id", "operation_id", "state"},
  "visitor_requests": {"request_id", "participant_id", "requested_by_member_id", "status", "version"},
  "cash_audits": {"cash_total_yen", "book_balance_yen", "difference_yen", "counts_json"},
}
for table, fields in required.items():
    assert fields <= columns(table), f"{table} missing {fields - columns(table)}"

# Historical actor / withdrawn member ID links must deliberately survive
# removal of the current member identity. No FK from immutable history.
for table in ("operation_audit", "withdrawal_history",
              "match_operation_audit", "visitor_decision_archive",
              "participant_action_archive"):
    historical_fk_targets = {row[2] for row in DB.execute(f"PRAGMA foreign_key_list({table})")}
    assert "members" not in historical_fk_targets, table

def raises_integrity(fn):
    try:
        fn()
        assert False, "expected sqlite3.IntegrityError"
    except sqlite3.IntegrityError:
        pass

# Only test-made fictional rows, never the connected staging workbook.
DB.execute("INSERT INTO members(member_id,display_name,line_user_id,active,is_admin,name_kana) VALUES(?,?,?,?,?,?)",
           ("M-TEST-01","Test","U001",1,0,""))
raises_integrity(lambda: DB.execute(
    "INSERT INTO members(member_id,display_name,line_user_id,active,is_admin) VALUES(?,?,?,?,?)",
    ("M-TEST-02","Duplicate","U001",1,0)))
DB.execute("INSERT INTO duty_teams(team_id,team_name,active) VALUES('T-TEST','Test',1)")
DB.execute("INSERT INTO team_memberships(team_id,member_id,active) VALUES('T-TEST','M-TEST-01',1)")
raises_integrity(lambda: DB.execute("DELETE FROM members WHERE member_id='M-TEST-01'"))
DB.execute("INSERT INTO operation_audit(operation_id,operation,actor_member_id,timestamp_raw,target_id,result_json) VALUES('OP-OLD','payment.set','M-TEST-01','2026-11-21','T','{}')")
DB.execute("INSERT INTO withdrawal_history(member_id,display_name,withdrawn_at_raw,state,operation_id) VALUES('M-TEST-01','Test','2026-11-21','completed','W-OLD')")
DB.execute("DELETE FROM team_memberships WHERE member_id='M-TEST-01'")
DB.execute("DELETE FROM members WHERE member_id='M-TEST-01'")
assert DB.execute("SELECT actor_member_id FROM operation_audit WHERE operation_id='OP-OLD'").fetchone()[0] == "M-TEST-01"
assert DB.execute("SELECT member_id FROM withdrawal_history WHERE operation_id='W-OLD'").fetchone()[0] == "M-TEST-01"
raises_integrity(lambda: DB.execute("INSERT INTO withdrawal_history(member_id,display_name,state,operation_id) VALUES('X','Y','completed','W-OLD')"))
DB.execute("INSERT INTO members(member_id,display_name,line_user_id,active,is_admin) VALUES('M-TEST-NEW','Test','U001',1,0)")
assert DB.execute("SELECT member_id FROM members WHERE line_user_id='U001'").fetchone()[0] == "M-TEST-NEW"

DB.execute("""INSERT INTO practices(practice_id,practice_date,place,start_time,end_time,hours,enabled,version)
VALUES('P-1','2026-11-21','Test','09:00','13:00',4,1,0)""")
DB.execute("""INSERT INTO attendances(practice_id,participant_id,display_name,category,attending,version)
VALUES('P-1','A-1','Test','member',1,0)""")
DB.execute("""INSERT INTO payments(practice_id,participant_id,completed,version)
VALUES('P-1','A-1',0,0)""")
raises_integrity(lambda: DB.execute("""INSERT INTO payments(practice_id,participant_id,completed,version)
VALUES('P-1','A-1',1,1)"""))
raises_integrity(lambda: DB.execute("""INSERT INTO payments(practice_id,participant_id,completed,version)
VALUES('P-1','A-NO-ATTENDANCE',1,1)"""))
DB.execute("SAVEPOINT optimistic")
cur = DB.execute("""UPDATE payments SET completed=1,version=version+1
  WHERE practice_id='P-1' AND participant_id='A-1' AND version=0""")
assert cur.rowcount == 1
cur = DB.execute("""UPDATE payments SET completed=0,version=version+1
  WHERE practice_id='P-1' AND participant_id='A-1' AND version=0""")
assert cur.rowcount == 0, "stale version not rejected by CAS condition"
DB.execute("ROLLBACK TO SAVEPOINT optimistic")
DB.execute("RELEASE SAVEPOINT optimistic")
assert DB.execute("SELECT version FROM payments WHERE practice_id='P-1'").fetchone()[0] == 0

# The only approved ledger sort order comes from current GAS
# ledgerChronologyCompare_ (date -> kind weight -> row_id).
rows = [
  ("P-LATE", "2026-11-22", "practice"),
  ("R-SAME", "2026-11-21", "reimbursement"),
  ("O-SAME", "2026-11-21", "other"),
  ("P-SAME", "2026-11-21", "practice"),
  ("OPENING", "2026-11-20", "opening"),
]
DB.executemany("""INSERT INTO ledger_rows(row_id,ledger_date,label,income_yen,expense_yen,balance_yen,kind,status,version)
 VALUES(?,?,?,0,0,0,?,'open',0)""", ((rid,date,rid,kind) for rid,date,kind in rows))
ordering_sql = """SELECT row_id FROM ledger_rows ORDER BY ledger_date,
 CASE kind WHEN 'opening' THEN 0 WHEN 'practice' THEN 1
 WHEN 'reimbursement' THEN 2 WHEN 'other' THEN 3 ELSE 5 END, row_id"""
order = [r[0] for r in DB.execute(ordering_sql)]
assert order == ["OPENING","P-SAME","R-SAME","O-SAME","P-LATE"], order
assert "CREATE" in (ROOT / "d1-staging/migrations/0002_business_skeleton.sql").read_text()
assert "d1_databases" not in (ROOT / "cloudflare-worker/wrangler.toml").read_text()

print(f"PASS: 20 empty-structure domain tables and {len(required)} required-column contracts; "
      "FKeys, history retention, duplicate IDs, CAS, transaction rollback, legacy sort")
