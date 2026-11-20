#!/usr/bin/env python3
"""Offline-only schedule.list parity probe using fabricated rows & in-memory SQLite.

The canonical live API still uses GAS + Sheets and verifies LINE/role on every
request. This is NOT an authenticated D1 endpoint, production migration/import,
or proof of original sheet date-cell conversion. Never feed real records.
"""
from pathlib import Path
from datetime import date
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "d1-staging" / "migrations"
SQL = (ROOT / "d1-staging" / "phase5" / "schedule-list-offline.sql").read_text("utf-8")
assert SQL.strip().splitlines()[-4].strip() == "hours, enabled, remark, version" or "hours, enabled" in SQL
assert SQL.lstrip().startswith("--")
assert "SELECT" in SQL and "WHERE practice_date >= ?" in SQL
assert "ORDER BY practice_date, start_time" in SQL
assert not any(" " + word + " " in SQL.upper() for word in
               ("INSERT", "UPDATE", "DELETE", "ALTER", "DROP", "REPLACE"))

TODAY = "2026-11-21"  # fixed clock: matches legacy Asia/Tokyo today_ semantics
FICTIONAL = [
    ("P-PAST", "2026-11-20", "架空体育館", "09:00", "13:00", 4, 1, "", 0),
    ("P-FUTURE", "2026-12-01", "架空第二体育館", "18:00", "21:00", 3, 1, "備考", 2),
    ("P-TODAY", "2026-11-21", "架空体育館", "08:30", "12:00", 2, 1, "", 0),
    ("P-UNPUBLISHED", "2026-11-25", "架空第三体育館", "09:00", "13:00", 4, 0, "準備中", 1),
]

def db_with_schema():
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    for path in sorted(MIGRATIONS.glob("*.sql")):
        db.executescript(path.read_text("utf-8"))
    return db

def insert_test_rows(db, rows):
    db.executemany("""INSERT INTO practices(
        practice_id,practice_date,place,start_time,end_time,hours,enabled,remark,version
        ) VALUES (?,?,?,?,?,?,?,?,?)""", rows)

def validate_whole_table(db):
    # GAS scheduleRows_ rejects duplicate IDs/dates, even for past/disabled
    # rows. The candidate D1 schema lacks UNIQUE(practice_date).
    items = db.execute("""SELECT practice_id,practice_date,start_time,end_time,
        hours,enabled,version FROM practices""").fetchall()
    seen_ids, seen_dates = set(), set()
    for r in items:
        pid, day = r["practice_id"], r["practice_date"]
        if not isinstance(pid, str) or not pid or pid in seen_ids:
            raise ValueError("schedule ID invalid or duplicate")
        if not isinstance(day, str) or not day or day in seen_dates:
            raise ValueError("schedule date invalid or duplicate")
        try:
            if date.fromisoformat(day).isoformat() != day:
                raise ValueError("noncanonical date")
        except ValueError as e:
            raise ValueError("invalid schedule date") from e
        if not isinstance(r["version"], int) or r["version"] < 0:
            raise ValueError("invalid version")
        if r["enabled"] not in (0, 1):
            raise ValueError("invalid enabled flag")
        # Unnormalized time values cannot silently become a new business rule.
        for name in ("start_time", "end_time"):
            value = r[name]
            if not isinstance(value, str) or len(value) != 5 or value[2] != ":":
                raise ValueError("noncanonical time")
            hh, mm = value[:2], value[3:]
            if not (hh.isdigit() and mm.isdigit() and int(hh) < 24 and int(mm) < 60):
                raise ValueError("invalid time")
        seen_ids.add(pid)
        seen_dates.add(day)

def projection(row):
    return {
        "practiceId":row[0], "date":row[1], "place":row[2],
        "startTime":row[3], "endTime":row[4], "hours":row[5],
        "enabled":bool(row[6]), "remark":row[7], "version":row[8]
    }

def reference_gas_schedule_list(rows, today):
    # Reproduces scheduleList_ for PRENORMALIZED fictional scheduleRows_ rows:
    # >=today, date/startTime ascending, includes unpublished schedules,
    # removes rowNumber. Does not claim full GAS date-cell conversion parity.
    return [projection(row) for row in sorted(
        (r for r in rows if r[1] >= today),
        key=lambda r: (r[1],r[3])
    )]

def query_candidate(db, today):
    validate_whole_table(db)
    # An SQLite query-only session catches accidental writes in this candidate.
    db.execute("PRAGMA query_only=ON")
    try:
        rows = db.execute(SQL, (today,)).fetchall()
    finally:
        db.execute("PRAGMA query_only=OFF")
    return [projection(tuple(row)) for row in rows]

db = db_with_schema()
insert_test_rows(db, FICTIONAL)
actual = query_candidate(db, TODAY)
reference = reference_gas_schedule_list(FICTIONAL, TODAY)
assert actual == reference, (actual,reference)
assert [r["practiceId"] for r in actual] == ["P-TODAY","P-UNPUBLISHED","P-FUTURE"]
assert actual[1]["enabled"] is False, "unpublished management schedule lost"
assert all("rowNumber" not in x for x in actual)
assert query_candidate(db, "2027-01-01") == []

# Detect conflicts GAS rejects, including a second row with same *past* date.
bad = db_with_schema()
insert_test_rows(bad, FICTIONAL + [
    ("P-OTHER-PAST","2026-11-20","架空別会場","14:00","18:00",4,1,"",0)])
try:
    query_candidate(bad, TODAY)
    raise AssertionError("duplicate date incorrectly accepted")
except ValueError:
    pass

# Empty D1 returns empty schedules; NEVER interpret that as a valid migration
# of a populated sheet without a verified snapshot and reconciliation.
empty = db_with_schema()
assert query_candidate(empty, TODAY) == []
print("PASS: schedule.list fictional parity, disabled/future/today ordering, no rowNumber, global duplicate-date fail-closed, query-only; no D1/GAS network")
