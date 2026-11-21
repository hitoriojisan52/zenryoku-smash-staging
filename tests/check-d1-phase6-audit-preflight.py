#!/usr/bin/env python3
"""Audit preflight + historical withdrawn actor with invented records only."""
from copy import deepcopy
from datetime import date
from decimal import Decimal
from pathlib import Path
import sqlite3
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"d1-staging"/"phase6"))
from audit_preflight import preflight_operation_audit, attendance_audit_window
from civil_codec import UnsafeCell

base=date(1899,12,30)
serial=Decimal((date(2026,11,21)-base).days)
def timestamp(h,m,s):
    return serial+Decimal(h*3600+m*60+s)/Decimal(86400)
def event(op_id,op,target,raw,format_type="DATE_TIME",result='{"ok": true}'):
    return {
        "operation_id":op_id,
        "operation":op,
        "actor_member_id":"M-FICTION-WITHDRAWN", # not in live members
        "timestamp_value":raw,
        "timestamp_format":format_type,
        "target_id":target,
        "result_json":result
    }
fixture=[
    event("OP-FICTION-01","attendance.submit","P-FICTION|M-FICTION",timestamp(23,30,0)),
    event("OP-FICTION-02","stage.selfRole","M-FICTION-WITHDRAWN",timestamp(23,35,0)),
    event("OP-FICTION-03","attendance.submit","P-FICTION|M-FICTION",timestamp(10,0,0)),
    event("OP-FICTION-04","attendance.submit","P-FICTION|M-FICTION",timestamp(22,15,0)),
    event("OP-FICTION-05","attendance.submit","P-OTHER|M-FICTION", "2026-11-20 18:00:02","TEXT",'{"ok":true,"data":{"x":1}}'),
]
converted=preflight_operation_audit(fixture,"Asia/Tokyo")
assert len(converted)==5
assert [r.operation_id for r in converted]==[x["operation_id"] for x in fixture]
assert converted[0].timestamp_raw=="2026-11-21 23:30:00"
assert converted[4].timestamp_raw=="2026-11-20 18:00:02"
assert converted[4].result_json==fixture[4]["result_json"]
assert converted[2].actor_member_id=="M-FICTION-WITHDRAWN"
windows=attendance_audit_window(converted)
assert windows["P-FICTION|M-FICTION"]==(
    "2026-11-21 10:00:00","2026-11-21 23:30:00")
assert windows["P-OTHER|M-FICTION"]==(
    "2026-11-20 18:00:02","2026-11-20 18:00:02")
assert "M-FICTION-WITHDRAWN" not in windows
assert preflight_operation_audit([],"Asia/Tokyo")==[]

n=0
def reject(override,extra=None):
    global n
    rows=deepcopy(fixture)
    rows[0].update(override)
    if extra:rows.append(deepcopy(extra))
    try:preflight_operation_audit(rows,"Asia/Tokyo")
    except UnsafeCell:n+=1;return
    raise AssertionError("Expected fail-closed audit rejection")
reject({"operation_id":""})
reject({"operation":""})
reject({"actor_member_id":""})
reject({"result_json":""})
reject({"result_json":"not-json"})
reject({"result_json":"[]"})
reject({"timestamp_value":"2026-11-21T23:30:00Z","timestamp_format":"TEXT"})
reject({"timestamp_value":timestamp(23,30,0),"timestamp_format":"TEXT"})
reject({"timestamp_value":timestamp(23,30,0)+Decimal("0.3")/Decimal(86400)})
reject({"target_id":42})
reject({},fixture[0]) # duplicate Operation ID

db=sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
for f in sorted((ROOT/"d1-staging/migrations").glob("*.sql")):
    db.executescript(f.read_text("utf-8"))
# Deliberately never insert M-FICTION-WITHDRAWN into current members:
# its historical audit evidence must remain readable after withdrawal.
assert db.execute("SELECT COUNT(*) FROM members").fetchone()[0]==0
db.executemany("""INSERT INTO operation_audit
(operation_id,operation,actor_member_id,timestamp_raw,target_id,result_json)
VALUES(?,?,?,?,?,?)""",[(x.operation_id,x.operation,x.actor_member_id,
     x.timestamp_raw,x.target_id,x.result_json) for x in converted])
assert db.execute("SELECT COUNT(*) FROM operation_audit").fetchone()[0]==len(converted)
assert db.execute("SELECT result_json FROM operation_audit WHERE operation_id=?",
    ("OP-FICTION-05",)).fetchone()[0]==fixture[4]["result_json"]
assert db.execute("SELECT COUNT(*) FROM operation_audit WHERE actor_member_id=?",
    ("M-FICTION-WITHDRAWN",)).fetchone()[0]==len(converted)
assert db.execute("SELECT COUNT(*) FROM members").fetchone()[0]==0
try:
    row=converted[0]
    db.execute("""INSERT INTO operation_audit
(operation_id,operation,actor_member_id,timestamp_raw,target_id,result_json)
VALUES(?,?,?,?,?,?)""", (row.operation_id,row.operation,row.actor_member_id,
    row.timestamp_raw,row.target_id,row.result_json))
    raise AssertionError("Duplicate operation ID accepted by D1")
except sqlite3.IntegrityError:
    pass
db.rollback()
gas=(ROOT/"gas-staging/コード.gs").read_text("utf-8")
assert "function attendanceAuditDates_(ss)" in gas
assert "when<out[target].first" in gas and "when>out[target].last" in gas
assert "function auditExisting_(ss,opId,op,member)" in gas
assert "JSON.parse(row[5])" in gas
print(f"PASS {n} rejected corrupt audit fixtures; retained operation IDs, original JSON, JST first/last, withdrawn actor with no current-member FK; no real records")
