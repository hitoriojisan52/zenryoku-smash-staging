"""D1 phase12: purely OFFLINE transaction candidate against in-memory SQLite.

Never open a file/remote D1/SaaS, migrate a source workbook, or bind the live
Worker. Error codes only; no stored identifiers/JSON/PII in exception text.
Transaction semantics are candidates, not an authorized replacement of GAS.
"""
from __future__ import annotations

import copy
from contextlib import contextmanager
from datetime import date
import hashlib
import json
import re
import sqlite3

SCOPE = "fabricated_offline_only"
FEE_YEN = {"member": 800, "student": 400, "visitor": 1000,
           "duty": 400, "shuttle": 400}
KIND_WEIGHT = {"opening": 0, "practice": 1, "reimbursement": 2, "other": 3}
VALID_OP = re.compile(r"^[A-Za-z0-9_-]{8,100}$")
SAFE_INTEGER = (1 << 53) - 1


class Blocked(ValueError):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def guard(condition, code):
    if not condition:
        raise Blocked(code)


def _yen(value):
    guard(type(value) is int and 0 <= value <= SAFE_INTEGER,
          "INVALID_MONEY")
    return value


def _version(value):
    guard(type(value) is int and value >= 0, "INVALID_VERSION")
    return value


def _date(value):
    guard(isinstance(value, str) and
          re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) is not None,
          "INVALID_DATE")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise Blocked("INVALID_DATE") from None


def _require_scope(scope, db):
    guard(scope == SCOPE, "LIVE_SCOPE_FORBIDDEN")
    guard(type(db) is sqlite3.Connection, "NOT_SQLITE_MEMORY")
    # For main, a true in-memory sqlite connection reports an empty filename.
    # Attached file databases must be rejected too.
    dbs = db.execute("PRAGMA database_list").fetchall()
    guard(bool(dbs) and any(row[1] == "main" and row[2] == "" for row in dbs) and
          all(row[2] == "" for row in dbs), "NOT_SQLITE_MEMORY")
    guard(db.execute("PRAGMA foreign_keys").fetchone()[0] == 1,
          "FOREIGN_KEYS_DISABLED")
    guard(not db.in_transaction, "NESTED_TRANSACTION_FORBIDDEN")


def _op_id(op_id):
    guard(isinstance(op_id, str) and VALID_OP.fullmatch(op_id) is not None,
          "INVALID_OPERATION_ID")


def _actor_role(db, member_id):
    member = db.execute(
        "SELECT display_name,active,is_admin FROM members WHERE member_id=?",
        (member_id,)).fetchone()
    guard(member is not None and member[1] == 1, "UNAUTHORIZED")
    if member[2]:
        return "admin", member[0]
    exists = db.execute("""SELECT 1 FROM team_memberships tm
         JOIN duty_teams t ON t.team_id=tm.team_id
         WHERE tm.member_id=? AND tm.active=1 AND t.active=1 LIMIT 1""",
        (member_id,)).fetchone()
    return ("duty" if exists else "member"), member[0]


def _require_role(db, actor_id, *, admin_only=False):
    role, name = _actor_role(db, actor_id)
    guard(role == "admin" if admin_only else role in ("admin", "duty"),
          "FORBIDDEN")
    return role, name


@contextmanager
def _txn(db, *, scope):
    _require_scope(scope, db)
    # BEGIN IMMEDIATE serializes the synthetic local write boundary. This is
    # NOT proof that future Cloudflare D1 RPC/batch semantics are identical.
    db.execute("BEGIN IMMEDIATE")
    try:
        yield
        db.commit()
    except BaseException:
        db.rollback()
        raise


def _audit_replay(db, op_id, operation, actor_id, target_id):
    record = db.execute("""SELECT operation,actor_member_id,target_id,result_json
                            FROM operation_audit WHERE operation_id=?""",
                        (op_id,)).fetchone()
    if not record:
        return None
    # Legacy GAS verifies operation and actor, not target or request payload.
    # Target check is a safer candidate only; integration must be approved.
    guard((record[0], record[1], record[2]) ==
          (operation, actor_id, target_id), "OP_ID_REUSE")
    try:
        result = json.loads(record[3])
    except (TypeError, ValueError):
        raise Blocked("AUDIT_JSON_INVALID") from None
    guard(isinstance(result, dict) and result.get("ok") is True,
          "AUDIT_JSON_INVALID")
    return result


def _write_audit(db, op_id, operation, actor, target, result):
    db.execute("""INSERT INTO operation_audit
      (operation_id,operation,actor_member_id,timestamp_raw,target_id,result_json)
      VALUES(?,?,?,?,?,?)""",
      (op_id, operation, actor, "2026-11-21 10:00:00", target,
       json.dumps(result, ensure_ascii=False, separators=(",", ":"))))


def _fault(label, inject):
    if inject == label:
        raise Blocked("INJECTED_ROLLBACK")


def _ordered_ledger(db):
    rows = [dict(zip(("row_id", "ledger_date", "kind", "status",
                       "income", "expense", "balance", "version"),
                      row)) for row in db.execute("""SELECT row_id,ledger_date,
          kind,status,income_yen,expense_yen,balance_yen,version
          FROM ledger_rows""").fetchall()]
    for r in rows:
        _date(r["ledger_date"])
        guard(r["kind"] in KIND_WEIGHT and r["status"] in ("open", "confirmed"),
              "LEDGER_ENUM_INVALID")
        _yen(r["income"])
        _yen(r["expense"])
        _version(r["version"])
    ordered = sorted(rows, key=lambda r: (r["ledger_date"],
                      KIND_WEIGHT[r["kind"]], r["row_id"]))
    guard(len(ordered) <= 5000 and len(ordered) > 0 and
          sum(r["kind"] == "opening" for r in ordered) == 1 and
          ordered[0]["kind"] == "opening", "OPENING_INVALID")
    expected = ordered[0]["balance"]
    _yen(expected)
    for r in ordered[1:]:
        next_balance = expected + r["income"] - r["expense"]
        guard(-SAFE_INTEGER <= next_balance <= SAFE_INTEGER,
              "BALANCE_RANGE")
        guard(r["balance"] == next_balance, "BALANCE_DRIFT")
        expected = next_balance
    return ordered


def ledger_transition(db, *, scope, op_id, actor_id, row_id,
                      action, expected_version, today, inject=None):
    """GAS-equivalent temporal ordering, role and CAS for synthetic ledger.

    No business table is written before confirmation / balance validation.
    An audit insert failure (or injected fault) rolls back ledger and audit.
    """
    _op_id(op_id)
    _date(today)
    guard(action in ("confirm", "unlock"), "INVALID_ACTION")
    guard(isinstance(row_id, str) and bool(row_id), "INVALID_TARGET")
    with _txn(db, scope=scope):
        _, display_name = _require_role(
            db, actor_id, admin_only=(action == "unlock"))
        replay = _audit_replay(db, op_id, "ledger.change", actor_id, row_id)
        if replay is not None:
            return copy.deepcopy(replay)
        ordered = _ordered_ledger(db)
        target = next((r for r in ordered if r["row_id"] == row_id), None)
        guard(target is not None, "NOT_FOUND")
        guard(target["kind"] != "opening", "OPENING_IMMUTABLE")
        guard(_version(expected_version) == target["version"], "VERSION_CONFLICT")
        key = lambda r: (r["ledger_date"], KIND_WEIGHT[r["kind"]], r["row_id"])
        if action == "confirm":
            guard(target["status"] == "open", "ALREADY_CONFIRMED")
            guard(target["ledger_date"] <= today, "FUTURE_CONFIRM_FORBIDDEN")
            guard(not any(r["kind"] != "opening" and r["status"] != "confirmed"
                          and key(r) < key(target) for r in ordered),
                  "PRIOR_PENDING")
            db.execute("""UPDATE ledger_rows SET status='confirmed',
                confirmed_by=?,version=version+1
                WHERE row_id=? AND version=? AND status='open'""",
                (display_name, row_id, expected_version))
        else:
            guard(target["status"] == "confirmed", "NOT_CONFIRMED")
            guard(not any(r["kind"] != "opening" and r["status"] == "confirmed"
                          and key(r) > key(target) for r in ordered),
                  "LATER_CONFIRMED")
            db.execute("""UPDATE ledger_rows SET status='open',
                confirmed_by='',version=version+1
                WHERE row_id=? AND version=? AND status='confirmed'""",
                (row_id, expected_version))
        guard(db.execute("SELECT changes()").fetchone()[0] == 1,
              "VERSION_CONFLICT")
        _fault("after_ledger", inject)
        # Verify no changed balance and no transaction-local data drift.
        _ordered_ledger(db)
        result = {"ok": True, "data": {
            "rowId": row_id, "action": action, "version": expected_version + 1}}
        _write_audit(db, op_id, "ledger.change", actor_id, row_id, result)
        _fault("after_audit", inject)
        return result


def _fee(category, hours):
    guard(category in FEE_YEN and type(hours) is int and hours in (2, 3, 4),
          "INVALID_FEE")
    numerator = {2: 6, 3: 7, 4: 8}[hours]
    return ((FEE_YEN[category] * numerator + 800 - 1) // 800) * 100


def payment_transition(db, *, scope, op_id, actor_id, practice_id,
                       participant_id, completed, expected_version,
                       today, inject=None):
    """Fabricated GAS fee delta + confirmed balance protection + atomic audit."""
    _op_id(op_id)
    _date(today)
    guard(type(completed) is bool, "INVALID_COMPLETED")
    guard(isinstance(practice_id, str) and bool(practice_id) and
          isinstance(participant_id, str) and bool(participant_id),
          "INVALID_TARGET")
    with _txn(db, scope=scope):
        _require_role(db, actor_id)
        replay = _audit_replay(db, op_id, "payment.set", actor_id,
                               participant_id)
        if replay is not None:
            # GAS replay only compares op/actor; candidate additionally rejects
            # same operationId used on a different practice/participant.
            data = replay.get("data")
            guard(isinstance(data, dict) and
                  data.get("practiceId") == practice_id and
                  data.get("participantId") == participant_id,
                  "OP_ID_REUSE")
            return copy.deepcopy(replay)
        practice = db.execute("""SELECT practice_date,hours,enabled
            FROM practices WHERE practice_id=?""", (practice_id,)).fetchone()
        guard(practice is not None and practice[2] == 1, "PRACTICE_UNAVAILABLE")
        guard(practice[0] <= today, "FUTURE_COLLECTION_FORBIDDEN")
        # Matches legacy collectionState_: only the latest *earlier date*
        # practice blocks collection. Same-day practices do not.
        earlier = db.execute("""SELECT practice_id FROM practices
            WHERE enabled=1 AND practice_date<? ORDER BY practice_date DESC,
            practice_id DESC LIMIT 1""", (practice[0],)).fetchone()
        if earlier:
            prior = db.execute("""SELECT status FROM ledger_rows WHERE
                  row_id=?""", ("P-" + earlier[0],)).fetchone()
            guard(prior is not None and prior[0] == "confirmed",
                  "PRIOR_PRACTICE_PENDING")
        ledger = db.execute("""SELECT income_yen,adjustment_yen,version,status
            FROM ledger_rows WHERE row_id=? AND kind='practice'
            AND practice_id=? AND ledger_date=?""",
            ("P-" + practice_id, practice_id, practice[0])).fetchone()
        guard(ledger is not None and ledger[3] == "open", "LEDGER_LOCKED")
        person = db.execute("""SELECT category FROM attendances
            WHERE practice_id=? AND participant_id=? AND attending=1""",
            (practice_id, participant_id)).fetchone()
        guard(person is not None, "NOT_ATTENDING")
        payment = db.execute("""SELECT completed,version FROM payments
            WHERE practice_id=? AND participant_id=?""",
            (practice_id, participant_id)).fetchone()
        version = payment[1] if payment else 0
        guard(_version(expected_version) == version, "VERSION_CONFLICT")
        old_completed = bool(payment[0]) if payment else False
        fee = _fee(person[0], practice[1])
        delta = (int(completed) - int(old_completed)) * fee
        # Corrupted previous financial state must never be patched by a
        # seemingly harmless duplicate payment update.
        ordered = _ordered_ledger(db)
        before = {r["row_id"]: r for r in ordered}
        changed = ledger[0] + delta
        guard(0 <= changed <= SAFE_INTEGER, "INVALID_MONEY")
        if payment:
            db.execute("""UPDATE payments SET completed=?,version=version+1,
                updated_by_member_id=?,updated_at_raw=?
                WHERE practice_id=? AND participant_id=? AND version=?""",
                (int(completed), actor_id, "2026-11-21 10:00:00",
                 practice_id, participant_id, expected_version))
        else:
            db.execute("""INSERT INTO payments
                (practice_id,participant_id,completed,version,
                 updated_by_member_id,updated_at_raw)
                 VALUES(?,?,?,?,?,?)""",
                (practice_id, participant_id, int(completed), 1, actor_id,
                 "2026-11-21 10:00:00"))
        guard(db.execute("SELECT changes()").fetchone()[0] == 1,
              "VERSION_CONFLICT")
        _fault("after_payment", inject)
        db.execute("""UPDATE ledger_rows SET income_yen=?,
            version=version+1 WHERE row_id=? AND version=? AND status='open'""",
            (changed, "P-" + practice_id, ledger[2]))
        guard(db.execute("SELECT changes()").fetchone()[0] == 1,
              "VERSION_CONFLICT")
        _fault("after_income", inject)
        balance = ordered[0]["balance"]
        for row in ordered[1:]:
            income = changed if row["row_id"] == "P-" + practice_id else row["income"]
            candidate = balance + income - row["expense"]
            guard(-SAFE_INTEGER <= candidate <= SAFE_INTEGER, "BALANCE_RANGE")
            if row["status"] == "confirmed" and candidate != row["balance"]:
                raise Blocked("CONFIRMED_BALANCE_PROTECTED")
            if candidate != row["balance"]:
                # GAS setPayment_ increments the target ledger version
                # once before balanceRecalc_; downstream balance changes
                # increment their own versions only once.
                db.execute("""UPDATE ledger_rows SET balance_yen=?,
                    version=version+? WHERE row_id=?""",
                    (candidate, 0 if row["row_id"] == "P-" + practice_id else 1,
                     row["row_id"]))
            balance = candidate
        _fault("after_balances", inject)
        _ordered_ledger(db)
        current = db.execute("""SELECT version,income_yen,balance_yen
            FROM ledger_rows WHERE row_id=?""",
            ("P-" + practice_id,)).fetchone()
        result = {"ok": True, "data": {
            "practiceId": practice_id, "participantId": participant_id,
            "completed": completed, "version": version + 1,
            "ledgerVersion": current[0], "income": current[1],
            "balance": current[2]}}
        _write_audit(db, op_id, "payment.set", actor_id, participant_id, result)
        _fault("after_audit", inject)
        return result


def _active_match(db, practice_id):
    ref = db.execute("""SELECT active_revision_id,session_version,
        settings_version FROM match_sessions WHERE practice_id=?""",
        (practice_id,)).fetchone()
    if ref is None:
        return None
    chunks = db.execute("""SELECT stage,state_json_chunk,sha256,
        chunk_index,chunk_total,practice_id FROM match_revision_chunks
        WHERE revision_id=? ORDER BY chunk_index""", (ref[0],)).fetchall()
    guard(bool(chunks), "MATCH_REVISION_MISSING")
    count = chunks[0][4]
    guard(type(count) is int and 1 <= count <= 30 and len(chunks) == count and
          all(r[0] == "ready" and r[2] == chunks[0][2] and
              r[3] == i + 1 and r[4] == count and r[5] == practice_id
              for i, r in enumerate(chunks)), "MATCH_CHUNKS_INVALID")
    raw = "".join(r[1] for r in chunks)
    guard(hashlib.sha256(raw.encode("utf-8")).hexdigest() == chunks[0][2],
          "MATCH_SHA_MISMATCH")
    try:
        data = json.loads(raw)
    except ValueError:
        raise Blocked("MATCH_JSON_INVALID") from None
    guard(isinstance(data, dict) and data.get("sessionVersion") == ref[1] and
          data.get("settingsVersion") == ref[2], "MATCH_VERSION_INVALID")
    return {"revision": ref[0], "sessionVersion": ref[1],
            "settingsVersion": ref[2], "state": data}


def _js_json_chunks(raw, unit_limit):
    """Do not silently split a Unicode surrogate pair in SQLite TEXT.

    Existing GAS slices UTF-16 units. D1 TEXT may not roundtrip an unpaired
    surrogate. Stop unsafe candidate instead of transcoding old originals.
    """
    result, part, units = [], [], 0
    for char in raw:
        take = 2 if ord(char) > 0xFFFF else 1
        guard(take <= unit_limit, "MATCH_UNSAFE_UTF16_BOUNDARY")
        if units + take > unit_limit:
            result.append("".join(part))
            part, units = [], 0
        part.append(char)
        units += take
    if part:
        result.append("".join(part))
    return result or [""]


def match_transition(db, *, scope, op_id, actor_id, practice_id, action,
                     expected_session_version, expected_settings_version,
                     proposed_state, inject=None, chunk_units=30000):
    """Synthetic candidate: match version, revision, and audit in one txn.

    Difference from GAS: GAS may commit pointer even if final audit append
    fails. This candidate rolls back the entire change; needs explicit review.
    """
    _op_id(op_id)
    guard(action in ("create", "change"), "INVALID_ACTION")
    guard(isinstance(practice_id, str) and bool(practice_id) and
          type(chunk_units) is int and 2 <= chunk_units <= 30000 and
          isinstance(proposed_state, dict), "INVALID_MATCH_INPUT")
    with _txn(db, scope=scope):
        _require_role(db, actor_id)
        exists = db.execute("SELECT 1 FROM practices WHERE practice_id=? AND enabled=1",
                            (practice_id,)).fetchone()
        guard(bool(exists), "PRACTICE_UNAVAILABLE")
        audit = db.execute("""SELECT practice_id,actor_member_id,action,
            session_version FROM match_operation_audit WHERE operation_id=?""",
            (op_id,)).fetchone()
        if audit is not None:
            guard((audit[0], audit[1], audit[2]) ==
                  (practice_id, actor_id, action), "OP_ID_REUSE")
            current = _active_match(db, practice_id)
            guard(current is not None and
                  op_id in current["state"].get("appliedOperations", {}),
                  "REPLAY_STATE_NOT_VERIFIED")
            return {"ok": True, "data": {
                "alreadyApplied": True, "operationId": op_id}}
        old = _active_match(db, practice_id)
        _version(expected_session_version)
        _version(expected_settings_version)
        if action == "create":
            guard(old is None and expected_session_version == 0 and
                  expected_settings_version == 0, "MATCH_ALREADY_EXISTS")
        else:
            guard(old is not None, "MATCH_NOT_FOUND")
            guard(old["sessionVersion"] == expected_session_version and
                  old["settingsVersion"] == expected_settings_version,
                  "VERSION_CONFLICT")
        state = copy.deepcopy(proposed_state)
        sver = _version(state.get("sessionVersion"))
        gver = _version(state.get("settingsVersion"))
        if action == "create":
            guard(sver >= 1 and gver >= 0, "MATCH_VERSION_INVALID")
            prior_ops = {}
        else:
            guard(sver >= expected_session_version and
                  gver >= expected_settings_version and
                  (sver > expected_session_version or
                   gver > expected_settings_version), "MATCH_VERSION_INVALID")
            prior_ops = old["state"].get("appliedOperations", {})
            guard(isinstance(prior_ops, dict) and
                  state.get("appliedOperations", {}) == prior_ops,
                  "MATCH_OP_HISTORY_DRIFT")
        state["appliedOperations"] = {**prior_ops, op_id: action}
        raw = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        chunks = _js_json_chunks(raw, chunk_units)
        guard(1 <= len(chunks) <= 30, "MATCH_CHUNK_LIMIT")
        sha = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        revision = "RV-FICTION-" + op_id
        for index, chunk in enumerate(chunks, start=1):
            db.execute("""INSERT INTO match_revision_chunks
                (revision_id,practice_id,stage,state_json_chunk,sha256,
                 operation_id,created_at_raw,chunk_index,chunk_total)
                VALUES(?,?,?,?,?,?,?,?,?)""",
                (revision, practice_id, "staging", chunk, sha, op_id,
                 "2026-11-21 10:00:00", index, len(chunks)))
        _fault("after_chunks", inject)
        persisted = db.execute("""SELECT state_json_chunk FROM
            match_revision_chunks WHERE revision_id=?
            ORDER BY chunk_index""", (revision,)).fetchall()
        guard(hashlib.sha256("".join(r[0] for r in persisted).encode("utf-8")).hexdigest() ==
              sha, "MATCH_SHA_MISMATCH")
        db.execute("""UPDATE match_revision_chunks SET stage='ready'
            WHERE revision_id=? AND stage='staging'""", (revision,))
        guard(db.execute("SELECT changes()").fetchone()[0] == len(chunks),
              "MATCH_READY_FAILED")
        _fault("after_ready", inject)
        if old is None:
            db.execute("""INSERT INTO match_sessions
                (practice_id,active_revision_id,session_version,
                 settings_version,updated_at_raw) VALUES(?,?,?,?,?)""",
                (practice_id, revision, sver, gver, "2026-11-21 10:00:00"))
        else:
            db.execute("""UPDATE match_sessions SET active_revision_id=?,
              session_version=?,settings_version=?,updated_at_raw=?
              WHERE practice_id=? AND active_revision_id=?
                AND session_version=? AND settings_version=?""",
                (revision, sver, gver, "2026-11-21 10:00:00",
                 practice_id, old["revision"], expected_session_version,
                 expected_settings_version))
        guard(db.execute("SELECT changes()").fetchone()[0] == 1,
              "VERSION_CONFLICT")
        _fault("after_pointer", inject)
        # D1 candidate changes legacy post-commit audit behavior intentionally.
        db.execute("""INSERT INTO match_operation_audit
           (operation_id,practice_id,actor_member_id,action,session_version,
            created_at_raw,details) VALUES(?,?,?,?,?,?,?)""",
           (op_id, practice_id, actor_id, action, sver,
            "2026-11-21 10:00:00", revision))
        _fault("after_audit", inject)
        return {"ok": True, "data": {
            "operationId": op_id, "revisionId": revision,
            "sessionVersion": sver, "settingsVersion": gver}}
