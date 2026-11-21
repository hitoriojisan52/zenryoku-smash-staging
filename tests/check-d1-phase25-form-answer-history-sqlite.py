#!/usr/bin/env python3
"""Offline-only Phase25: use real 0002 candidate DDL, but ONLY fictional data."""
import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parent.parent
conn = sqlite3.connect(":memory:")
conn.execute("PRAGMA foreign_keys=ON")
conn.execute("PRAGMA recursive_triggers=ON")
conn.executescript((root / "d1-staging/migrations/0002_business_skeleton.sql").read_text())
conn.executescript((root / "d1-staging/analysis/phase25-form-answer-history-offline.sql").read_text())

conn.execute(
    "INSERT INTO practices (practice_id, practice_date, place, start_time, end_time, hours, enabled)"
    " VALUES ('PR-FICTIONAL-CURRENT','2099-12-01','Fictional Hall','09:00','12:00',3,1)"
)
conn.execute(
    "INSERT INTO attendances (practice_id, participant_id, display_name, category, attending)"
    " VALUES ('PR-FICTIONAL-CURRENT','M-FICTIONAL-1','Fake Member','member',1)"
)

# Same mail + date, multiple persons; same mail + date + person, changed attendance.
# These are fabricated and are NOT copied from any real Form responses.
rows = [
    (2, ["2099/10/01 08:00:00","proxy@example.invalid","2099/09/01","Fictional A","参加","メンバー",""], "2099-09-01", 1),
    (3, ["2099/10/01 08:02:00","proxy@example.invalid","2099/09/01","Fictional B","参加","ビジター",""], "2099-09-01", 1),
    (4, ["2099/10/02 08:00:00","proxy@example.invalid","2099/09/01","Fictional A","欠席","メンバー",""], "2099-09-01", 1),
    (5, ["2099/11/01 08:00:00","another@example.invalid","2099/12/01","Fictional C","参加","当番担当",""], "2099-12-01", 0),
    (6, ["2099/11/01 08:30:00","another@example.invalid","2099/12/01","Fictional D","参加","シャトル担当",""], "2099-12-01", 0),
]
for row_no, seven, date, old in rows:
    conn.execute(
        "INSERT INTO phase25_synthetic_form_response_history "
        "(source_role, source_row_number, source_displayed_cells_json, date_index, historical_outside_master) "
        "VALUES ('management-13-tabs', ?, ?, ?, ?)",
        (row_no, json.dumps(seven, ensure_ascii=False), date, old),
    )

saved = conn.execute(
    "SELECT source_row_number, source_displayed_cells_json, historical_outside_master "
    "FROM phase25_synthetic_form_history_readonly ORDER BY source_row_number"
).fetchall()
assert len(saved) == len(rows)
assert [r[0] for r in saved] == [r[0] for r in rows]
for r, original in zip(saved, rows):
    assert json.loads(r[1]) == original[1], "No value, name, category or timestamp can be silently dropped."
    assert r[2] == original[3]
assert len([r for r in saved if json.loads(r[1])[1] == "proxy@example.invalid"]) == 3
assert len([r for r in saved if json.loads(r[1])[3] == "Fictional A"]) == 2

# Historical-only records are separated from live attendance and don't create
# placeholder past practices or recalculate payments/ledger rows.
assert conn.execute("SELECT count(*) FROM practices").fetchone()[0] == 1
assert conn.execute("SELECT count(*) FROM attendances").fetchone()[0] == 1
assert conn.execute("SELECT count(*) FROM payments").fetchone()[0] == 0
assert conn.execute("SELECT count(*) FROM ledger_rows").fetchone()[0] == 0
assert conn.execute("SELECT enabled FROM practices").fetchone()[0] == 1
assert conn.execute("SELECT count(*) FROM practices WHERE practice_date = '2099-09-01'").fetchone()[0] == 0

try:
    conn.execute(
        "INSERT INTO attendances (practice_id, participant_id, display_name, category, attending)"
        " VALUES ('PR-FICTIONAL-PAST','UNKNOWN','Fictional E','member',1)"
    )
except sqlite3.IntegrityError as ex:
    assert "FOREIGN KEY" in str(ex)
else:
    raise AssertionError("Unapproved placeholder historical practices cannot be implied.")

for sql in [
    "UPDATE phase25_synthetic_form_response_history SET historical_outside_master=0 WHERE source_row_number=2",
    "DELETE FROM phase25_synthetic_form_response_history WHERE source_row_number=2",
    ("INSERT OR REPLACE INTO phase25_synthetic_form_response_history "
     "(source_role,source_row_number,source_displayed_cells_json,date_index,historical_outside_master) "
     "VALUES ('management-13-tabs',2,'[]','2099-09-01',1)"),
]:
    try:
        conn.execute(sql)
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Archived fictional source must reject replacement and deletion.")

try:
    conn.execute(
        "INSERT INTO phase25_synthetic_form_response_history "
        "(source_role,source_row_number,source_displayed_cells_json,date_index,historical_outside_master) "
        "VALUES ('management-13-tabs',2,'[]','2099-09-01',1)"
    )
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("Duplicate physical row key must fail closed.")

assert len(conn.execute("SELECT * FROM phase25_synthetic_form_history_readonly").fetchall()) == len(rows)
assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
print("PHASE25_OFFLINE_SOURCE_HISTORY_PASS: fictional 7-column row provenance, duplicate mail/person revisions preserved, past days not reopened, active attendance/finance unaffected, updates/deletes blocked")
