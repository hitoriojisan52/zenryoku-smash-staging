#!/usr/bin/env python3
"""Phase23 preflight: synthetic data + the repository's exact D1 candidate DDL.

This is NOT a migration, importer, backup, or remote probe. It never reads Google
Sheets, Cloudflare or user records. The only database is SQLite :memory:.
"""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "d1-staging" / "migrations" / "0002_business_skeleton.sql"
sql = SCHEMA.read_text(encoding="utf-8")
assert "CREATE TABLE IF NOT EXISTS attendances" in sql
assert "CREATE TABLE IF NOT EXISTS practices" in sql
assert "PRIMARY KEY (practice_id, participant_id)" in sql
assert "FOREIGN KEY (practice_id) REFERENCES practices(practice_id)" in sql

db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")
db.executescript(sql)

columns = db.execute("PRAGMA table_info(attendances)").fetchall()
pk = [name for _, name, _, _, _, ordinal in sorted(columns, key=lambda c: c[5])
      if ordinal > 0]
assert pk == ["practice_id", "participant_id"], pk
assert any(row[2] == "practices" and row[3] == "practice_id"
           for row in db.execute("PRAGMA foreign_key_list(attendances)"))

# All identifiers, dates, and names below are fictitious test constants.
with db:
    db.execute(
        """INSERT INTO practices
           (practice_id,practice_date,place,start_time,end_time,hours,enabled)
           VALUES (?,?,?,?,?,?,?)""",
        ("fixture-current", "2099-04-12", "Fictional Hall", "09:00", "12:00", 3, 1),
    )
before = db.execute("SELECT COUNT(*) FROM attendances").fetchone()[0]
assert before == 0

def assert_rejected(sql, params, expected):
    try:
        with db:
            db.execute(sql, params)
    except sqlite3.IntegrityError as e:
        assert expected in str(e), str(e)
    else:
        raise AssertionError("UNAPPROVED_INPUT_WAS_SILENTLY_ACCEPTED")

insert_attendance = """INSERT INTO attendances
    (practice_id, participant_id, display_name, category, attending, version)
    VALUES (?,?,?,?,?,?)"""

# Historical answers without the corresponding historical practice cannot be
# inserted into the current D1 candidate by silently ignoring the missing FK.
assert_rejected(
    insert_attendance,
    ("fixture-history-not-in-master", "fixture-member-a", "Fiction A", "member", 1, 0),
    "FOREIGN KEY constraint failed",
)
assert db.execute("SELECT COUNT(*) FROM attendances").fetchone() == (0,)
assert db.execute("SELECT COUNT(*) FROM practices").fetchone() == (1,)

with db:
    db.execute(
        insert_attendance,
        ("fixture-current", "fixture-member-a", "Fiction A", "member", 1, 0),
    )
baseline = db.execute("SELECT * FROM attendances").fetchall()

# A synthetic collision after an identity mapping must not be silently
# INSERT OR IGNORE/REPLACE'd. Source email+date repeats do NOT prove that two
# source responses map to this exact same D1 participant_id: reconciliation
# and historical revision semantics require a separate approved design.
assert_rejected(
    insert_attendance,
    ("fixture-current", "fixture-member-a", "Fiction A", "member", 0, 1),
    "UNIQUE constraint failed",
)
assert db.execute("SELECT * FROM attendances").fetchall() == baseline

# Distinct identities remain distinct; email is not automatically a trusted
# LINE/member identity. No automatic merge, deletion or identity inference.
with db:
    db.execute(
        insert_attendance,
        ("fixture-current", "fixture-member-b", "Fiction B", "member", 0, 0),
    )
assert db.execute("SELECT COUNT(*) FROM attendances").fetchone() == (2,)
assert db.execute("SELECT COUNT(*) FROM practices").fetchone() == (1,)
assert db.execute("PRAGMA integrity_check").fetchone() == ("ok",)
db.close()
print("PHASE23_HISTORY_PREFLIGHT_PASS: exact candidate D1 FK/PK, missing historical schedule rejected, hypothetical same-participant revision collision rejected without replacement, no source data or remote writes")
