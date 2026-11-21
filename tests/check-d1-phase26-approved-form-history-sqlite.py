#!/usr/bin/env python3
"""Phase26 offline-only: approved A DESIGN, fictional rows and SQLite :memory:."""
import hashlib
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.execute("PRAGMA recursive_triggers=OFF")  # Duplicate guard must not rely on ON.
db.executescript((ROOT / "d1-staging/migrations/0002_business_skeleton.sql").read_text())
db.executescript((ROOT / "d1-staging/analysis/phase26-approved-form-history-schema-offline.sql").read_text())

def sha(data):
    return hashlib.sha256(data.encode("utf-8")).hexdigest()

def canonical(cells):
    return json.dumps(cells, ensure_ascii=False, separators=(",", ":"))

# Only fabricated persons, future dates and RFC .invalid mail. No Google
# identifiers, no historical user data, no PII from the connected Sheet.
rows = [
    (2, ["2099/10/02 08:00:00", "group@example.invalid", "2099/09/03", "架空A", "参加", "メンバー", ""], "2099-09-03", 0),
    (3, ["2099/10/02 08:05:00", "group@example.invalid", "2099/09/03", "架空B", "参加", "ビジター", ""], "2099-09-03", 0),
    (4, ["2099/10/02 08:06:00", "group@example.invalid", "2099/09/03", "架空A", "欠席", "メンバー", "変更"], "2099-09-03", 0),
    (5, ["2099/10/03 08:00:00", "individual@example.invalid", "2099/12/05", "架空C", "参加", "当番担当", ""], "2099-12-05", 1),
]
snapshot = "SYNTHETIC-SNAPSHOT-A1"
second = "SYNTHETIC-SNAPSHOT-A2"

def manifest(what):
    entries = [str(num) + ":" + sha(canonical(cells))
               for num, cells, _date, _match in what]
    return sha("\n".join(entries))

def add_snapshot(identifier, contents):
    db.execute(
        "INSERT INTO phase26_synthetic_form_snapshots "
        "(snapshot_id, source_role, source_tab, source_columns,"
        " capture_basis, captured_at_utc, expected_rows, manifest_sha256)"
        " VALUES (?,'management-13-tabs','フォームの回答',7,"
        " 'displayed-only-unverified-native-types','2099-10-03T09:00:00Z',?,?)",
        (identifier, len(contents), manifest(contents)),
    )
    for num, cells, date, matched in contents:
        db.execute(
            "INSERT INTO phase26_synthetic_form_rows "
            "(snapshot_id,source_row_number,displayed_cells_json,row_sha256,"
            " date_index,is_in_current_master_at_capture)"
            " VALUES (?,?,?,?,?,?)",
            (identifier,num,canonical(cells),sha(canonical(cells)),date,matched),
        )

db.execute(
    "INSERT INTO practices (practice_id,practice_date,place,start_time,end_time,hours,enabled)"
    " VALUES ('PR-SYNTHETIC-CURRENT','2099-12-05','Fake Hall','10:00','12:00',2,1)"
)
db.execute(
    "INSERT INTO attendances (practice_id,participant_id,display_name,category,attending)"
    " VALUES ('PR-SYNTHETIC-CURRENT','P-SYNTHETIC','Fake C','member',1)"
)
add_snapshot(snapshot, rows)

def validate(identifier, contents):
    manifest_rows=db.execute(
        "SELECT source_row_number, displayed_cells_json, row_sha256, "
        "date_index, is_in_current_master_at_capture "
        "FROM phase26_synthetic_form_readonly WHERE snapshot_id=? "
        "ORDER BY source_row_number",(identifier,)
    ).fetchall()
    assert len(manifest_rows)==len(contents)
    for expected, got in zip(contents, manifest_rows):
        num,cells,day,matching=expected
        assert got[0]==num
        assert json.loads(got[1])==cells
        assert got[2]==sha(canonical(cells))
        assert got[3]==day and got[4]==matching
    metadata=db.execute(
        "SELECT expected_rows,manifest_sha256 FROM phase26_synthetic_form_snapshots"
        " WHERE snapshot_id=?",(identifier,)
    ).fetchone()
    assert metadata==(len(contents),manifest(contents))

validate(snapshot, rows)
assert db.execute(
    "SELECT COUNT(*) FROM phase26_synthetic_form_readonly WHERE snapshot_id=?",(snapshot,)
).fetchone()[0]==4
assert db.execute("SELECT COUNT(*) FROM practices").fetchone()[0]==1
assert db.execute("SELECT COUNT(*) FROM attendances").fetchone()[0]==1
assert db.execute("SELECT COUNT(*) FROM payments").fetchone()[0]==0
assert db.execute("SELECT COUNT(*) FROM ledger_rows").fetchone()[0]==0
assert db.execute(
    "SELECT COUNT(*) FROM practices WHERE practice_date='2099-09-03'"
).fetchone()[0]==0

# All three responses with same email/date, different name and opposite
# attendance coexist. Source row numbers retain original order and identity.
select=db.execute(
    "SELECT displayed_cells_json FROM phase26_synthetic_form_readonly "
    "WHERE snapshot_id=? ORDER BY source_row_number",(snapshot,)
).fetchall()
decoded=[json.loads(r[0]) for r in select]
assert sum(r[1]=="group@example.invalid" for r in decoded)==3
assert sum(r[3]=="架空A" for r in decoded)==2
assert {"参加","欠席"}.issubset({r[4] for r in decoded})

def blocked(query, values=()):
    try:
        db.execute(query,values)
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Unapproved mutation or source accepted: "+query[:75])

# Fail closed for UPDATE, DELETE, accidental REPLACE and duplicate import,
# even when recursive_triggers is OFF.
blocked("UPDATE phase26_synthetic_form_rows SET date_index='2099-01-01' WHERE snapshot_id=?", (snapshot,))
blocked("DELETE FROM phase26_synthetic_form_rows WHERE snapshot_id=?", (snapshot,))
blocked("UPDATE phase26_synthetic_form_snapshots SET expected_rows=0 WHERE snapshot_id=?", (snapshot,))
blocked("DELETE FROM phase26_synthetic_form_snapshots WHERE snapshot_id=?", (snapshot,))
blocked("INSERT OR REPLACE INTO phase26_synthetic_form_rows "
        "(snapshot_id,source_row_number,displayed_cells_json,row_sha256,date_index,is_in_current_master_at_capture) "
        "VALUES (?,2,'[]',?,'2099-09-03',1)",(snapshot,sha("[]")))
blocked("INSERT OR IGNORE INTO phase26_synthetic_form_rows "
        "(snapshot_id,source_row_number,displayed_cells_json,row_sha256,date_index,is_in_current_master_at_capture) "
        "VALUES (?,2,'[]',?,'2099-09-03',1)",(snapshot,sha("[]")))
blocked("INSERT OR REPLACE INTO phase26_synthetic_form_snapshots "
        "(snapshot_id,source_role,source_tab,source_columns,capture_basis,captured_at_utc,expected_rows,manifest_sha256)"
        " VALUES (?,'management-13-tabs','フォームの回答',7,"
        "'displayed-only-unverified-native-types','2099-10-03T09:00:00Z',0,?)",
        (snapshot,manifest([])))
blocked("INSERT INTO phase26_synthetic_form_snapshots "
        "(snapshot_id,source_role,source_tab,source_columns,capture_basis,captured_at_utc,expected_rows,manifest_sha256)"
        " VALUES ('SYNTHETIC-BAD','historical-3-tabs-readonly','フォームの回答',7,"
        "'displayed-only-unverified-native-types','2099-10-03T09:00:00Z',1,?)",
        (manifest(rows),))
blocked("INSERT INTO phase26_synthetic_form_rows "
        "(snapshot_id,source_row_number,displayed_cells_json,row_sha256,date_index,is_in_current_master_at_capture)"
        " VALUES ('SYNTHETIC-MISSING',8,'[]',?,'2099-09-03',0)", (sha("[]"),))
blocked("INSERT INTO phase26_synthetic_form_rows "
        "(snapshot_id,source_row_number,displayed_cells_json,row_sha256,date_index,is_in_current_master_at_capture)"
        " VALUES (?,8,'[]',?,'2099-09-03',0)", (snapshot,sha("[]")))

validate(snapshot, rows)
# Multiple snapshots coexist instead of mutating source rows on later capture.
later = rows + [
    (6, ["2099/10/04 08:00:00","new@example.invalid","2099/12/05","架空D","参加","メンバー",""],"2099-12-05",1)
]
add_snapshot(second, later)
validate(snapshot, rows)
validate(second, later)
assert db.execute("SELECT COUNT(*) FROM phase26_synthetic_form_rows").fetchone()[0] == 9
assert db.execute("PRAGMA integrity_check").fetchone()[0]=="ok"

print("PHASE26_APPROVED_HISTORY_DESIGN_PASS: synthetic snapshots preserve A:G and row order, manifest+row SHA, multi-person/conflicting attendance, fail-closed mutation, no live FK or finance writes")
