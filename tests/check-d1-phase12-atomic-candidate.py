#!/usr/bin/env python3
"""Phase12: fabricated-only real SQLite multi-table atomicity regression.

One in-memory database, no network, no Google/Cloudflare data, no file copy,
no source transaction or remote D1 SQL. Values in tests are fictional.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "d1-staging" / "phase12"))
from transaction_candidate import (
    SCOPE, Blocked, FEE_YEN, _fee, _ordered_ledger,
    ledger_transition, payment_transition, match_transition,
)

TODAY = "2026-11-21"
ADMIN = "FICT-ADMIN"
DUTY = "FICT-DUTY"
MEMBER = "FICT-MEMBER"
P_A = "FICT-PA"
P_B = "FICT-PB"
R = "R-FICT-AAAABBBB"
O = "O-FICT-AAAABBBB"
PLEDGER = "P-" + P_B


def database():
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    for sql in sorted((ROOT / "d1-staging/migrations").glob("*.sql")):
        db.executescript(sql.read_text("utf-8"))
    return db


def seed(db):
    with db:
        db.executemany("""INSERT INTO members
            (member_id,display_name,line_user_id,active,is_admin)
            VALUES(?,?,?,?,?)""", [
            (ADMIN, "Fiction Admin", "FICT-U-A", 1, 1),
            (DUTY, "Fiction Duty", "FICT-U-D", 1, 0),
            (MEMBER, "Fiction Member", "FICT-U-M", 1, 0),
        ])
        db.execute("INSERT INTO duty_teams VALUES('FICT-T','Fiction Team',1)")
        db.execute("INSERT INTO team_memberships VALUES('FICT-T',?,1)", (DUTY,))
        db.executemany("""INSERT INTO practices
          (practice_id,practice_date,place,start_time,end_time,
           hours,enabled,remark,version) VALUES(?,?,?,?,?,?,?,?,?)""", [
            (P_A, "2026-11-20", "Imaginary Gym", "09:00", "12:00", 3, 1, "", 1),
            (P_B, "2026-11-21", "Imaginary Gym", "09:00", "12:00", 3, 1, "", 1),
        ])
        db.executemany("""INSERT INTO attendances
            (practice_id,participant_id,display_name,category,attending,
             version,registered_by_member_id) VALUES(?,?,?,?,?,?,?)""", [
            (P_B, DUTY, "Fiction Duty", "member", 1, 1, DUTY),
            (P_B, MEMBER, "Fiction Member", "student", 1, 1, MEMBER),
        ])
        db.executemany("""INSERT INTO ledger_rows
          (row_id,ledger_date,label,income_yen,expense_yen,balance_yen,
           kind,practice_id,status,version,adjustment_yen)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)""", [
            ("FICT-OPEN", "2026-11-19", "Opening", 0, 0, 1000,
             "opening", None, "confirmed", 1, 0),
            ("P-" + P_A, "2026-11-20", "Old Practice", 300, 0, 1300,
             "practice", P_A, "confirmed", 1, 0),
            (PLEDGER, TODAY, "New Practice", 0, 0, 1300,
             "practice", P_B, "open", 1, 0),
            (R, TODAY, "Refund", 0, 100, 1200,
             "reimbursement", None, "open", 1, 0),
            (O, TODAY, "Misc", 25, 0, 1225,
             "other", None, "open", 1, 0),
        ])


def snapshot(db):
    tabs = [r[0] for r in db.execute("""SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        AND name!='d1_migrations' ORDER BY name""").fetchall()]
    return {t: db.execute('SELECT * FROM "' + t + '" ORDER BY rowid').fetchall()
            for t in tabs}


def blocked(fn, code, db=None):
    before = snapshot(db) if db is not None else None
    try:
        fn()
    except Blocked as exc:
        assert exc.code == code, (code, exc.code)
    else:
        raise AssertionError("unsafe operation was accepted: " + code)
    if db is not None:
        assert snapshot(db) == before
        assert not db.in_transaction


def ledger(db, **kw):
    return ledger_transition(
        db, scope=SCOPE, op_id=kw.pop("op_id", "FICT-LEDGER-OP"),
        actor_id=kw.pop("actor", DUTY),
        row_id=kw.pop("row", PLEDGER),
        action=kw.pop("action", "confirm"),
        expected_version=kw.pop("version", 1),
        today=kw.pop("today", TODAY), **kw)


def payment(db, **kw):
    return payment_transition(
        db, scope=SCOPE, op_id=kw.pop("op_id", "FICT-PAY-OP-1"),
        actor_id=kw.pop("actor", DUTY),
        practice_id=kw.pop("practice", P_B),
        participant_id=kw.pop("person", DUTY),
        completed=kw.pop("completed", True),
        expected_version=kw.pop("version", 0),
        today=kw.pop("today", TODAY), **kw)


def match(db, **kw):
    return match_transition(
        db, scope=kw.pop("scope", SCOPE), op_id=kw.pop("op_id", "FICT-MATCH-OP-1"),
        actor_id=kw.pop("actor", DUTY),
        practice_id=kw.pop("practice", P_B),
        action=kw.pop("action", "create"),
        expected_session_version=kw.pop("expected_s", 0),
        expected_settings_version=kw.pop("expected_g", 0),
        proposed_state=kw.pop("state", {
            "sessionVersion": 1, "settingsVersion": 1,
            "appliedOperations": {}, "rounds": [], "label": "架空🏸",
        }), **kw)


def accounting_tests():
    db = database()
    seed(db)
    assert [r["row_id"] for r in _ordered_ledger(db)] == [
        "FICT-OPEN", "P-" + P_A, PLEDGER, R, O]
    assert _fee("member", 3) == 700
    assert _fee("student", 3) == 400
    assert _fee("visitor", 3) == 900
    assert _fee("member", 4) == 800
    assert _fee("member", 2) == 600
    assert FEE_YEN == {"member": 800, "student": 400, "visitor": 1000,
                       "duty": 400, "shuttle": 400}
    blocked(lambda: ledger(db, row=O), "PRIOR_PENDING", db)
    blocked(lambda: ledger(db, row=R), "PRIOR_PENDING", db)
    blocked(lambda: ledger(db, row="FICT-OPEN"), "OPENING_IMMUTABLE", db)
    blocked(lambda: ledger(db, today="2026-11-20"), "FUTURE_CONFIRM_FORBIDDEN", db)
    blocked(lambda: ledger(db, version=99), "VERSION_CONFLICT", db)
    blocked(lambda: ledger(db, actor=MEMBER), "FORBIDDEN", db)
    blocked(lambda: payment(db, actor=MEMBER), "FORBIDDEN", db)
    blocked(lambda: payment(db, practice=P_A), "LEDGER_LOCKED", db)
    blocked(lambda: payment(db, version=8), "VERSION_CONFLICT", db)
    blocked(lambda: payment(db, completed=1), "INVALID_COMPLETED", db)
    blocked(lambda: payment(db, person="FICT-UNKNOWN"), "NOT_ATTENDING", db)
    blocked(lambda: payment(db, today="2026-11-20"),
            "FUTURE_COLLECTION_FORBIDDEN", db)
    blocked(lambda: payment_transition(db, scope="real_data",
            op_id="FICT-PAY-OP-1", actor_id=DUTY, practice_id=P_B,
            participant_id=DUTY, completed=True,
            expected_version=0, today=TODAY), "LIVE_SCOPE_FORBIDDEN", db)
    blocked(lambda: ledger_transition(db, scope="real_data",
            op_id="FICT-LEDGER-OP", actor_id=DUTY, row_id=R,
            action="confirm", expected_version=1, today=TODAY),
            "LIVE_SCOPE_FORBIDDEN", db)

    # Failure injection at each write boundary restores the ENTIRE DB,
    # not just the originally targeted payments or ledger row.
    for checkpoint in ("after_payment", "after_income",
                       "after_balances", "after_audit"):
        blocked(lambda checkpoint=checkpoint: payment(db, inject=checkpoint),
                "INJECTED_ROLLBACK", db)
    result = payment(db)
    assert result["data"]["completed"] is True
    assert result["data"]["income"] == 700
    assert result["data"]["balance"] == 2000
    paid = db.execute("SELECT completed,version FROM payments WHERE "
                      "practice_id=? AND participant_id=?", (P_B, DUTY)).fetchone()
    assert paid == (1, 1)
    a = {r["row_id"]: r for r in _ordered_ledger(db)}
    assert (a[PLEDGER]["balance"], a[R]["balance"], a[O]["balance"]) == (
        2000, 1900, 1925)
    assert a["P-" + P_A]["balance"] == 1300
    assert a[PLEDGER]["version"] == 2  # legacy payment increments target once
    assert a[R]["version"] == 2 and a[O]["version"] == 2
    frozen = snapshot(db)
    assert payment(db) == result
    assert snapshot(db) == frozen, "idempotent retry must be read-only"
    blocked(lambda: payment(db, person=MEMBER),
            "OP_ID_REUSE", db)
    blocked(lambda: payment(db, op_id="FICT-PAY-OP-2", version=0),
            "VERSION_CONFLICT", db)
    assert payment(db, op_id="FICT-PAY-OP-2", version=1,
                   completed=False)["data"]["income"] == 0
    assert db.execute("SELECT version FROM payments WHERE practice_id=? "
                      "AND participant_id=?", (P_B, DUTY)).fetchone() == (2,)

    # Prior schedule must be confirmed, including when different practice was
    # not the chronologically last physical row.
    db.execute("UPDATE ledger_rows SET status='open' WHERE row_id=?",
               ("P-" + P_A,))
    db.commit()
    blocked(lambda: payment(db, op_id="FICT-PAY-OP-3", version=2),
            "PRIOR_PRACTICE_PENDING", db)
    db.execute("UPDATE ledger_rows SET status='confirmed' WHERE row_id=?",
               ("P-" + P_A,))
    db.commit()

    for checkpoint in ("after_ledger", "after_audit"):
        blocked(lambda checkpoint=checkpoint: ledger(db, inject=checkpoint),
                "INJECTED_ROLLBACK", db)
    confirmed = ledger(db)
    assert confirmed["data"]["version"] == 3  # updated balance incremented once
    assert ledger(db) == confirmed
    blocked(lambda: ledger(db, op_id="FICT-LEDGER-2", version=2),
            "ALREADY_CONFIRMED", db)
    blocked(lambda: ledger(db, actor=MEMBER, op_id="FICT-LEDGER-3"),
            "FORBIDDEN", db)
    blocked(lambda: ledger(db, row=R, op_id="FICT-LEDGER-4", action="unlock"),
            "NOT_CONFIRMED", db)
    blocked(lambda: ledger(db, row=PLEDGER, op_id="FICT-LEDGER-5",
                           action="unlock", version=3),
            "FORBIDDEN", db)
    rresult = ledger(db, row=R, op_id="FICT-LEDGER-6", version=2)
    assert rresult["data"]["version"] == 3
    ledger(db, row=O, op_id="FICT-LEDGER-7", version=2)
    blocked(lambda: ledger(db, row=PLEDGER, op_id="FICT-LEDGER-8",
                           action="unlock", version=3, actor=ADMIN),
            "LATER_CONFIRMED", db)
    blocked(lambda: ledger(db, row=R, op_id="FICT-LEDGER-9",
                           action="unlock", version=3, actor=ADMIN),
            "LATER_CONFIRMED", db)
    # Latest confirmed non-opening row must be unlocked first. Same-day
    # kind ordering: practice, reimbursement, other (regardless of row order).
    ledger(db, row=O, op_id="FICT-LEDGER-10",
           action="unlock", version=3, actor=ADMIN)
    ledger(db, row=R, op_id="FICT-LEDGER-11",
           action="unlock", version=3, actor=ADMIN)
    ledger(db, row=PLEDGER, op_id="FICT-LEDGER-12",
           action="unlock", version=3, actor=ADMIN)
    # If a downstream *confirmed* balance would change, payment and audit
    # must roll back as one: no orphan paid flag or skewed balance.
    db.execute("UPDATE ledger_rows SET status='confirmed' WHERE row_id=?", (R,))
    db.commit()
    blocked(lambda: payment(db, op_id="FICT-PAY-OP-4",
                            version=2, completed=True),
            "CONFIRMED_BALANCE_PROTECTED", db)
    db.execute("UPDATE ledger_rows SET status='open' WHERE row_id=?", (R,))
    db.commit()
    assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    db.close()


def match_tests():
    db = database()
    seed(db)
    for checkpoint in ("after_chunks", "after_ready", "after_pointer",
                       "after_audit"):
        blocked(lambda checkpoint=checkpoint: match(db, inject=checkpoint),
                "INJECTED_ROLLBACK", db)
    assert db.execute("SELECT COUNT(*) FROM match_revision_chunks").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM match_sessions").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM match_operation_audit").fetchone()[0] == 0
    blocked(lambda: match(db, actor=MEMBER), "FORBIDDEN", db)
    blocked(lambda: match(db, scope="real_data"),
            "LIVE_SCOPE_FORBIDDEN", db)
    created = match(db)
    assert created["data"]["sessionVersion"] == 1
    assert db.execute("SELECT COUNT(*) FROM match_revision_chunks").fetchone()[0] == 1
    assert db.execute("SELECT stage FROM match_revision_chunks").fetchone() == (
        "ready",)
    frozen = snapshot(db)
    replay = match(db)
    assert replay["data"]["alreadyApplied"] is True
    assert snapshot(db) == frozen
    blocked(lambda: match(db, action="change"),
            "OP_ID_REUSE", db)
    blocked(lambda: match(db, op_id="FICT-MATCH-OP-2"),
            "MATCH_ALREADY_EXISTS", db)
    blocked(lambda: match(db, op_id="FICT-MATCH-OP-2", action="change",
                          expected_s=0, expected_g=0),
            "VERSION_CONFLICT", db)
    blocked(lambda: match(db, op_id="FICT-MATCH-OP-2", action="change",
                          expected_s=1, expected_g=1,
                          state={"sessionVersion": 1,
                                 "settingsVersion": 1,
                                 "appliedOperations": {
                                     "FICT-MATCH-OP-1": "create"}}),
            "MATCH_VERSION_INVALID", db)
    blocked(lambda: match(db, op_id="FICT-MATCH-OP-2", action="change",
                          expected_s=1, expected_g=1,
                          state={"sessionVersion": 2,
                                 "settingsVersion": 1,
                                 "appliedOperations": {}}),
            "MATCH_OP_HISTORY_DRIFT", db)
    updated = {"sessionVersion": 2, "settingsVersion": 1,
               "appliedOperations": {"FICT-MATCH-OP-1": "create"},
               "rounds": [{"courts": 2, "players": ["🏸", "架空"]}]}
    for checkpoint in ("after_chunks", "after_ready", "after_pointer",
                       "after_audit"):
        blocked(lambda checkpoint=checkpoint: match(
            db, op_id="FICT-MATCH-OP-2", action="change",
            expected_s=1, expected_g=1, state=updated, inject=checkpoint),
            "INJECTED_ROLLBACK", db)
    updated_result = match(db, op_id="FICT-MATCH-OP-2", action="change",
                           expected_s=1, expected_g=1, state=updated,
                           chunk_units=32)
    assert updated_result["data"]["sessionVersion"] == 2
    assert db.execute("SELECT COUNT(*) FROM match_sessions").fetchone()[0] == 1
    assert db.execute("SELECT COUNT(*) FROM match_operation_audit").fetchone()[0] == 2
    rows = db.execute("""SELECT state_json_chunk,sha256,stage,chunk_index,
        chunk_total FROM match_revision_chunks WHERE revision_id=?
        ORDER BY chunk_index""", (updated_result["data"]["revisionId"],)).fetchall()
    assert len(rows) > 1
    raw = "".join(r[0] for r in rows)
    assert all(r[2] == "ready" and r[3] == i + 1 and r[4] == len(rows)
               for i, r in enumerate(rows))
    import hashlib
    assert all(r[1] == hashlib.sha256(raw.encode("utf-8")).hexdigest()
               for r in rows)
    assert json.loads(raw)["appliedOperations"] == {
        "FICT-MATCH-OP-1": "create",
        "FICT-MATCH-OP-2": "change"}
    frozen = snapshot(db)
    assert match(db, op_id="FICT-MATCH-OP-2", action="change",
                 expected_s=1, expected_g=1, state=updated)["data"]["alreadyApplied"]
    assert snapshot(db) == frozen
    blocked(lambda: match(db, op_id="FICT-MATCH-OP-3", action="change",
                          expected_s=1, expected_g=1, state=updated),
            "VERSION_CONFLICT", db)
    # Invalid or mismatched stored hash blocks all future revisions.
    db.execute("""UPDATE match_revision_chunks SET sha256=?
        WHERE revision_id=?""",
        ("0" * 64, updated_result["data"]["revisionId"]))
    db.commit()
    blocked(lambda: match(db, op_id="FICT-MATCH-OP-4", action="change",
                          expected_s=2, expected_g=1,
                          state={"sessionVersion": 3, "settingsVersion": 1,
                                 "appliedOperations": {
                                     "FICT-MATCH-OP-1": "create",
                                     "FICT-MATCH-OP-2": "change"}}),
            "MATCH_SHA_MISMATCH", db)
    assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    db.close()


def verify_source_contract():
    gas = (ROOT / "gas-staging/コード.gs").read_text(encoding="utf-8")
    assert "fees: {member:800,student:400,visitor:1000,duty:400,shuttle:400}" in gas
    assert "var factor={2:6/8,3:7/8,4:1}[hours]" in gas
    assert "var weight={opening:0,practice:1,reimbursement:2,other:3}" in gas
    assert "function ledgerPriorPending_" in gas
    assert "function ledgerLaterConfirmed_" in gas
    assert "function balanceRecalc_" in gas
    assert "function matchCommit_" in gas
    assert "function matchHash_" in gas
    assert "function auditExisting_" in gas
    assert "function setPayment_" in gas
    assert "function withLock_" in gas
    assert "matchHash_(readback)!==sha" in gas
    assert "var MATCH_CHUNK_CHARS = 30000" in gas
    assert "var MATCH_MAX_CHUNKS = 30" in gas


def main():
    verify_source_contract()
    accounting_tests()
    match_tests()
    print("PASS: fictional in-memory SQLite atomic payment/ledger/match CAS, idempotency, rolling balances, rollback and SHA; no external I/O")


if __name__ == "__main__":
    main()
