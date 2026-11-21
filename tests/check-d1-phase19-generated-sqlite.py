#!/usr/bin/env python3
"""Exact Phase19 Worker SQL on isolated in-memory SQLite; fake data only."""
import hashlib
import json
import sqlite3
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
module = (ROOT / "d1-staging/native-fixture/generated-match19.mjs").as_uri()
script = "import {MATCH19_SQL} from " + json.dumps(module) + ";console.log(JSON.stringify(MATCH19_SQL))"
sql = json.loads(subprocess.run(["node", "--input-type=module", "-e", script],
    check=True, capture_output=True, text=True, timeout=12).stdout)
assert len(sql) == 18
for name, command in sql.items():
    assert "z_native_fixture_match19_" in command, name
    assert not any(s in command.upper() for s in
        ("DROP TABLE", "DELETE FROM", "ATTACH DATABASE", "REPLACE INTO",
         "UPDATE MEMBERS", "UPDATE LEDGER_ROWS", "UPDATE MATCH_SESSIONS"))
    if name.endswith("DDL"):
        assert command.startswith("CREATE TABLE IF NOT EXISTS "), name

conn = sqlite3.connect(":memory:")
conn.execute("PRAGMA foreign_keys=ON")
for name in ("sessionDDL", "chunkDDL", "archiveDDL", "auditDDL"):
    conn.execute(sql[name])
conn.commit()
def sha(text):
    return hashlib.sha256(text.encode("utf8")).hexdigest()
def seed(fid):
    with conn:
        conn.execute(sql["seed"], (fid,))
def snapshot(fid):
    return {t:conn.execute(f"SELECT * FROM z_native_fixture_match19_{t} "
        f"WHERE fixture_id=? ORDER BY rowid", (fid,)).fetchall()
        for t in ("session", "chunk", "archive", "audit")}
def txn(statements):
    conn.execute("BEGIN IMMEDIATE")
    try:
        counts=[conn.execute(query, args).rowcount for query,args in statements]
        conn.commit()
        return counts
    except BaseException:
        conn.rollback()
        raise

a="phase19-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-match"
b="phase19-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-match"
seed(a); seed(b)
def save(fid, rev, op, fault=False):
    data=json.dumps({"generatedOnly": True, "schema":1,
                     "sessionVersion":1, "rounds":["🏸"]*2,
                     "padding":"x"*30001}, separators=(",",":"), ensure_ascii=False)
    # Real Worker safe UTF-16 code-unit splitting is separately tested.
    boundary=29999
    parts=[data[:boundary],data[boundary:]]
    assert len(parts)==2 and sha("".join(parts))==sha(data)
    statements=[]
    for i,part in enumerate(parts,1):
        statements.append((sql["oneChunk"],(rev,fid,i,2,fid,part,sha(data))))
    statements += [
      (sql["savePointer"],(rev,fid,rev,fid,2)),
      (sql["auditSave"],(op,fid,fid,rev,"fault" if fault else "committed"))
    ]
    return txn(statements),data
def getchunks(fid,rev):
    return conn.execute(sql["chunks"],(fid,rev)).fetchall()

revA="11111111-2222-4333-8444-555555555555"
opSave="11111111-1111-4111-8111-111111111111"
old=snapshot(a)
try: save(a,revA,opSave,True)
except sqlite3.IntegrityError: pass
else: raise AssertionError("AUDIT_FAULT_DID_NOT_ROLLBACK")
assert snapshot(a)==old, "AUDIT_FAULT_LEFT_PARTIAL_MATCH"
counts,raw=save(a,revA,opSave)
assert counts==[1,1,1,1]
rows=getchunks(a,revA)
assert len(rows)==2 and rows[0][0]==1 and rows[1][0]==2
assert sha("".join(x[3] for x in rows))==rows[0][4]==sha(raw)
assert json.loads(raw)["generatedOnly"] is True
assert conn.execute(sql["state"],(a,)).fetchone()==(revA,1,0)
assert conn.execute(sql["auditLookup"],(opSave,)).fetchone()==(
    a,"fixture-only-duty","save",0)
after=snapshot(a)
# A stale concurrent save must throw BEFORE an orphan new revision is left.
try: save(a,"22222222-2222-4222-8222-222222222222","11111111-1111-4111-8111-111111111112")
except sqlite3.IntegrityError: pass
else: raise AssertionError("STALE_SAVE_NOT_REJECTED")
assert snapshot(a)==after
# The same operation ID for another target must be unique and atomic.
try: save(b,"33333333-2222-4333-8333-333333333333",opSave)
except sqlite3.IntegrityError: pass
else: raise AssertionError("CROSS_TARGET_OPERATION_REUSED")
assert snapshot(b)=={t:([("phase19-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-match",None,0,0)] if t=="session" else [])
                       for t in ("session","chunk","archive","audit")}

opDelete="22222222-1111-4222-8222-111111111111"
snapshotText=json.dumps({"fixtureId":a,"revision":revA,"text":raw,"sha":sha(raw),
                         "chunks":2,"schema":1},ensure_ascii=False,separators=(",",":"))
def do_delete(fault=False):
    return txn([
      (sql["archive"],(opDelete,a,snapshotText,sha(snapshotText),a,revA)),
      (sql["deletePointer"],(a,revA,opDelete,a)),
      (sql["auditDelete"],(opDelete,a,a,"fault" if fault else "committed"))
    ])
old=snapshot(a)
try: do_delete(True)
except sqlite3.IntegrityError: pass
else: raise AssertionError("DELETE_AUDIT_FAULT_NOT_REJECTED")
assert snapshot(a)==old, "DELETE_AUDIT_FAULT_LEFT_PARTIAL_DELETION"
assert do_delete()==[1,1,1]
assert conn.execute(sql["state"],(a,)).fetchone()==(None,2,1)
arc=conn.execute(sql["archiveLookup"],(opDelete,)).fetchone()
assert arc[0]==a and sha(arc[1])==arc[2] and arc[3]=="completed"
assert json.loads(arc[1])["text"]==raw
assert len(getchunks(a,revA))==2, "DELETION_DESTROYED_UNRECOVERABLE_ORIGINAL"
def restore(fault=False):
    return txn([
      (sql["restorePointer"],(revA,a,opDelete,a,revA,a)),
      (sql["auditRestore"],("33333333-1111-4333-8333-111111111111",a,a,revA,
          "fault" if fault else "committed"))
    ])
old=snapshot(a)
try: restore(True)
except sqlite3.IntegrityError: pass
else: raise AssertionError("RESTORE_AUDIT_FAULT_NOT_REJECTED")
assert snapshot(a)==old, "RESTORE_AUDIT_FAULT_LEFT_ACTIVE_POINTER"
assert restore()==[1,1]
assert conn.execute(sql["state"],(a,)).fetchone()==(revA,3,0)
assert len(getchunks(a,revA))==2 and sha(raw)==rows[0][4]
assert conn.execute(sql["stats"],(a,a,a,a,a,a)).fetchone()==(3,0,2,3,1,1)
assert conn.execute("PRAGMA foreign_key_check").fetchall()==[]
conn.close()
print("PHASE19_OFFLINE_SQL_PASS: strict SQLite exact Worker SQL 2-chunk verified SHA, save/delete/restore atomically rolled back at each injected audit failure; history preserved; stale and cross-target rejected")
