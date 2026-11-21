#!/usr/bin/env python3
"""Phase17: approved match+audit atomicity against SQLite in-memory only.

Runs exact SQL exported from the isolated Worker candidate. No Cloudflare calls,
no real users, no external file database and no source Sheets mutation.
"""
import json
import sqlite3
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
module = ROOT / "d1-staging/native-fixture/approved-match17.mjs"
script = ("import {MATCH17_SQL} from " + json.dumps(module.as_uri()) +
          "; console.log(JSON.stringify(MATCH17_SQL));")
result = subprocess.run(
    ["node", "--input-type=module", "-e", script],
    cwd=ROOT, text=True, capture_output=True, check=True, timeout=10
)
sql = json.loads(result.stdout)

assert len(sql) == 9
for name, statement in sql.items():
    assert name.endswith("DDL") or statement.startswith(("INSERT ", "UPDATE ", "SELECT "))
    assert "z_native_fixture_match17_" in statement
    assert all(word not in statement.upper() for word in
               ("DROP TABLE", "DELETE FROM", "ATTACH DATABASE", "REPLACE INTO"))
    for business in ("members", "payments", "ledger_rows", "match_sessions",
                     "match_revision_chunks", "match_operation_audit", "operation_audit"):
        assert business not in statement.split("z_native_fixture_match17_")[0]

db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
for ddl in ("pointerDDL", "revisionDDL", "auditDDL"):
    db.execute(sql[ddl])
db.commit()

def seed(fid):
    with db:
        db.execute(sql["seed"], (fid,))

def state(fid):
    version, revs, audits, active = db.execute(sql["state"], (fid, fid, fid, fid)).fetchone()
    return (version, revs, audits, active)

def apply(fid, op, *, fault=False, expected=0, revision="synthetic-rev"):
    db.execute("BEGIN IMMEDIATE")
    try:
        c1 = db.execute(sql["revision"], (revision, '{"fictional":true}', fid, expected)).rowcount
        c2 = db.execute(sql["pointer"], (revision, fid, expected, revision, fid)).rowcount
        c3 = db.execute(sql["audit"], (op, fid, "synthetic-duty-only", expected,
                             revision, "fault" if fault else "committed",
                             fid, revision, expected + 1)).rowcount
        db.commit()
        return (c1, c2, c3)
    except BaseException:
        db.rollback()
        raise

a = "phase17-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-match"
b = "phase17-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-match"
c = "phase17-cccccccc-cccc-4ccc-8ccc-cccccccccccc-match"
seed(a)
before = state(a)
assert before == (0, 0, 0, 0)
try:
    apply(a, "synthetic-audit-error", fault=True)
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("audit CHECK failure was not raised")
assert state(a) == before, "MATCH_REVISION_OR_POINTER_ESCAPED_FAILED_AUDIT"

success = apply(a, "synthetic-approved-op-a")
assert success == (1, 1, 1)
assert state(a) == (1, 1, 1, 1)
assert apply(a, "synthetic-stale-op", revision="synthetic-stale-rev") == (0, 0, 0)
assert state(a) == (1, 1, 1, 1)
stored = db.execute(sql["replay"], ("synthetic-approved-op-a",)).fetchone()
assert stored == (a, "synthetic-duty-only", "match.save", 0)
assert db.execute(sql["replay"], ("synthetic-stale-op",)).fetchone() is None

seed(b)
try:
    apply(b, "synthetic-approved-op-a", revision="synthetic-other-revision")
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("same operation ID across targets must fail")
assert state(b) == (0, 0, 0, 0), "CROSS_TARGET_UNIQUE_FAILURE_WAS_NOT_ATOMIC"
assert db.execute(sql["replay"], ("synthetic-approved-op-a",)).fetchone()[0] == a
assert state(a) == (1, 1, 1, 1)

seed(c)
assert apply(c, "synthetic-approved-op-c", revision="synthetic-rev-c") == (1, 1, 1)
assert state(c) == (1, 1, 1, 1)
assert db.execute("PRAGMA foreign_key_check").fetchall() == []
db.close()
print("PASS: Phase17 exact Worker SQL in-memory SQLite audit-check rollback, matched version pointer+revision+audit, replay metadata, conflicting target atomic rollback, no business writes")
