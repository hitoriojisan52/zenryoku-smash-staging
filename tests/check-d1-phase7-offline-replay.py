#!/usr/bin/env python3
"""Phase 7: fabricated-only, isolated SQLite replay and rollback contract.

No network, Google Sheets, Cloudflare or production data. The 20 business
tables are the existing migrations, never a new or remote schema.
"""
from pathlib import Path
import sqlite3
import sys
import json

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "d1-staging" / "phase6"))
from civil_codec import project_cell, UnsafeCell
from audit_preflight import preflight_operation_audit, attendance_audit_window

def database():
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    for path in sorted((ROOT / "d1-staging" / "migrations").glob("*.sql")):
        db.executescript(path.read_text("utf-8"))
    return db

def seed(db):
    with db:
        db.executemany(
            "INSERT INTO members(member_id,display_name,line_user_id,active,is_admin) VALUES(?,?,?,?,?)",
            [("M-ADMIN","Fiction Admin","U-ADMIN",1,1),
             ("M-DUTY","Fiction Duty","U-DUTY",1,0)])
        db.execute("INSERT INTO duty_teams VALUES('T-DUTY','Fiction Team',1)")
        db.execute("INSERT INTO team_memberships VALUES('T-DUTY','M-DUTY',1)")
        practice_date = project_cell("2026-11-22", "date", None, "Asia/Tokyo").canonical
        db.execute("""INSERT INTO practices
          (practice_id,practice_date,place,start_time,end_time,hours,enabled,remark,version)
          VALUES(?,?,?,?,?,?,?,?,?)""",
          ("P-1",practice_date,"Fiction Gym","09:00","12:00",3,1,"",0))
        db.execute("""INSERT INTO attendances
          (practice_id,participant_id,display_name,category,attending,version,registered_by_member_id)
          VALUES(?,?,?,?,?,?,?)""",
          ("P-1","M-DUTY","Fiction Duty","member",1,1,"M-DUTY"))
        db.execute("""INSERT INTO payments
          (practice_id,participant_id,completed,version,updated_by_member_id)
          VALUES(?,?,?,?,?)""",("P-1","M-DUTY",1,1,"M-DUTY"))
        db.execute("""INSERT INTO ledger_rows
          (row_id,ledger_date,label,income_yen,expense_yen,balance_yen,
           kind,practice_id,status,version)
          VALUES(?,?,?,?,?,?,?,?,?,?)""",
          ("L-OPEN","2026-11-21","Opening",0,0,1000,"opening",None,"confirmed",1))
        db.execute("""INSERT INTO ledger_rows
          (row_id,ledger_date,label,income_yen,expense_yen,balance_yen,
           kind,practice_id,status,version)
          VALUES(?,?,?,?,?,?,?,?,?,?)""",
          ("L-P","2026-11-22","Practice",500,200,1300,"practice","P-1","open",1))

def snapshot(db):
    # No personal data is emitted; compare entire deterministic table contents in memory.
    tables = [r[0] for r in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='d1_migrations' ORDER BY name")]
    return {t:db.execute(f'SELECT * FROM "{t}" ORDER BY rowid').fetchall() for t in tables}

def role(db, mid):
    member = db.execute("SELECT active,is_admin FROM members WHERE member_id=?", (mid,)).fetchone()
    if not member or not member[0]:
        return "unauthorized"
    if member[1]:
        return "admin"
    return ("duty" if db.execute("""SELECT 1 FROM team_memberships m
       JOIN duty_teams t ON t.team_id=m.team_id
       WHERE m.member_id=? AND m.active=1 AND t.active=1 LIMIT 1""",(mid,)).fetchone()
            else "member")

def apply_role(db, op_id, actor, member, next_role):
    """Candidate transaction semantics, NOT a port of the GAS API."""
    if next_role not in ("admin","duty","member"):
        raise ValueError("invalid role")
    if db.execute("SELECT 1 FROM operation_audit WHERE operation_id=?", (op_id,)).fetchone():
        return False
    if role(db,actor)!="admin" or role(db,member)=="unauthorized":
        raise PermissionError("unauthorized")
    if role(db,member)=="admin" and next_role!="admin":
        if db.execute("SELECT COUNT(*) FROM members WHERE active=1 AND is_admin=1").fetchone()[0]<=1:
            raise PermissionError("last admin")
    with db:
        # All role mutation and audit insertion are in one SQLite transaction.
        if next_role=="member":
            db.execute("UPDATE team_memberships SET active=0 WHERE member_id=?", (member,))
        elif next_role=="duty":
            db.execute("""INSERT INTO team_memberships(team_id,member_id,active)
                 VALUES('T-DUTY',?,1)
                 ON CONFLICT(team_id,member_id) DO UPDATE SET active=1""", (member,))
        db.execute("UPDATE members SET is_admin=? WHERE member_id=?",
                   (int(next_role=="admin"),member))
        db.execute("""INSERT INTO operation_audit
          (operation_id,operation,actor_member_id,timestamp_raw,target_id,result_json)
          VALUES(?,?,?,?,?,?)""",
          (op_id,"member.manage.role",actor,"2026-11-21 10:00:00",member,
           json.dumps({"ok":True,"data":{"role":next_role}},separators=(",",":"))))
    return True

def main():
    db=database()
    seed(db)
    assert role(db,"M-ADMIN")=="admin"
    assert role(db,"M-DUTY")=="duty"
    original=snapshot(db)
    assert apply_role(db,"OP-1","M-ADMIN","M-DUTY","member")
    assert role(db,"M-DUTY")=="member"
    assert not apply_role(db,"OP-1","M-ADMIN","M-DUTY","member")
    assert db.execute("SELECT COUNT(*) FROM operation_audit").fetchone()[0]==1
    assert apply_role(db,"OP-2","M-ADMIN","M-DUTY","duty")
    assert role(db,"M-DUTY")=="duty"
    assert db.execute("SELECT COUNT(*) FROM team_memberships WHERE member_id='M-DUTY'").fetchone()[0]==1
    assert db.execute("SELECT COUNT(*) FROM operation_audit").fetchone()[0]==2
    # Inactive team overrides active membership.
    db.execute("UPDATE duty_teams SET active=0 WHERE team_id='T-DUTY'")
    assert role(db,"M-DUTY")=="member"
    db.execute("UPDATE duty_teams SET active=1 WHERE team_id='T-DUTY'")
    assert role(db,"M-DUTY")=="duty"
    try:
        apply_role(db,"OP-BAD","M-DUTY","M-ADMIN","member")
        raise AssertionError("non-admin could mutate")
    except PermissionError:
        pass
    try:
        apply_role(db,"OP-LAST","M-ADMIN","M-ADMIN","member")
        raise AssertionError("last admin could demote")
    except PermissionError:
        pass
    assert db.execute("SELECT COUNT(*) FROM operation_audit").fetchone()[0]==2
    # Historical audit actor must survive withdrawal of its member master.
    projected=preflight_operation_audit([{
        "operation_id":"OP-OLD","operation":"attendance.submit",
        "actor_member_id":"M-WITHDRAWN","timestamp_value":"2026-11-20 23:59:59",
        "timestamp_format":None,"target_id":"P-1|M-WITHDRAWN",
        "result_json":'{"ok":true}'
    }],"Asia/Tokyo")
    assert attendance_audit_window(projected)=={
        "P-1|M-WITHDRAWN":("2026-11-20 23:59:59","2026-11-20 23:59:59")}
    with db:
        db.execute("""INSERT INTO operation_audit
            (operation_id,operation,actor_member_id,timestamp_raw,target_id,result_json)
            VALUES(?,?,?,?,?,?)""",
            (projected[0].operation_id,projected[0].operation,
             projected[0].actor_member_id,projected[0].timestamp_raw,
             projected[0].target_id,projected[0].result_json))
    assert db.execute("SELECT actor_member_id FROM operation_audit WHERE operation_id='OP-OLD'").fetchone()[0]=="M-WITHDRAWN"
    # A failed multi-table mutation rolls back the member state and its audit.
    before=snapshot(db)
    try:
        with db:
            db.execute("UPDATE members SET is_admin=0 WHERE member_id='M-ADMIN'")
            db.execute("""INSERT INTO operation_audit
                (operation_id,operation,timestamp_raw,result_json)
                VALUES('OP-2','invalid','2026-11-21 10:00:00','{}')""")
        raise AssertionError("duplicate audit ID should reject transaction")
    except sqlite3.IntegrityError:
        pass
    assert snapshot(db)==before
    # A staged transaction that is explicitly rolled back restores every table.
    db.rollback()
    db.execute("BEGIN")
    db.execute("DELETE FROM payments WHERE practice_id='P-1'")
    db.execute("UPDATE ledger_rows SET balance_yen=-999 WHERE row_id='L-P'")
    db.rollback()
    assert snapshot(db)==before
    assert db.execute("PRAGMA foreign_key_check").fetchall()==[]
    assert db.execute("SELECT balance_yen FROM ledger_rows WHERE row_id='L-P'").fetchone()[0]==1300
    assert original["ledger_rows"]==snapshot(db)["ledger_rows"]
    print("PASS: fabricated role parity, audit idempotency, withdrawal actor, FK, and multi-table rollback; no external writes")

if __name__=="__main__":
    main()
