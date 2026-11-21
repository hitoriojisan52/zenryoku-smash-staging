#!/usr/bin/env python3
"""Phase10 fixture-only match import no-go regression. Never fetch real Sheets."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "d1-staging" / "phase10"))
from match_preflight import inspect_fabricated_match_snapshot, PreflightInputError


def mk_revision(revision, practice, operation, payload, *, cut=None):
    txt = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    digest = hashlib.sha256(txt.encode("utf-8")).hexdigest()
    if cut is None:
        chunks = [txt]
    else:
        # Split at a JS UTF-16 code-unit boundary even inside an emoji pair.
        b = txt.encode("utf-16-le", errors="surrogatepass")
        chunks = [b[:cut * 2].decode("utf-16-le", errors="surrogatepass"),
                  b[cut * 2:].decode("utf-16-le", errors="surrogatepass")]
    return [{
        "revisionId": revision, "practiceId": practice, "stage": "ready",
        "stateJSON": text, "sha256": digest, "operationId": operation,
        "createdAt": "2026/11/21 12:00:00",
        "chunkIndex": i + 1, "chunkTotal": len(chunks),
    } for i, text in enumerate(chunks)]


def inspect(revisions, sessions, audits, *, scope="fabricated_offline_only"):
    return inspect_fabricated_match_snapshot(scope=scope, revisions=revisions,
                                             sessions=sessions, audits=audits)


def issue(result, code):
    assert result["status"] == "BLOCKED", result
    assert result["issue_counts"].get(code, 0) >= 1, result
    assert result["write_authorized"] is False
    assert result["cutover_authorized"] is False


def main():
    older = mk_revision("RV-FICTION-OLD", "FICTION-P", "FICTION-OP-1",
                        {"sessionVersion": 1, "settingsVersion": 1, "state": []})
    newer_payload = {"sessionVersion": 2, "settingsVersion": 1, "players": ["青", "🏸"]}
    raw = json.dumps(newer_payload, ensure_ascii=False, separators=(",", ":"))
    emoji_location = raw.index("🏸")
    cut = len(raw[:emoji_location].encode("utf-16-le")) // 2 + 1
    newer = mk_revision("RV-FICTION-NEW", "FICTION-P", "FICTION-OP-2",
                        newer_payload, cut=cut)
    assert len(newer) == 2
    assert any("\ud83c" in row["stateJSON"] or "\udff8" in row["stateJSON"] for row in newer)

    rows = older + newer
    sessions = [{"practiceId": "FICTION-P", "activeRevisionId": "RV-FICTION-NEW",
                 "sessionVersion": 2, "settingsVersion": 1}]
    audits = [
        {"operationId": "FICTION-OP-1", "practiceId": "FICTION-P"},
        {"operationId": "FICTION-OP-2", "practiceId": "FICTION-P"},
    ]
    frozen = copy.deepcopy([rows, sessions, audits])
    good = inspect(rows, sessions, audits)
    assert good["status"] == "CANDIDATE_ONLY" and not good["issue_counts"]
    assert good["counts"]["verified_revisions"] == 2
    assert good["counts"]["revision_rows"] == 3
    assert good["write_authorized"] is False and good["cutover_authorized"] is False
    assert [rows, sessions, audits] == frozen
    exposed = json.dumps(good, ensure_ascii=False)
    for private in ["RV-FICTION-NEW", "FICTION-P", "FICTION-OP-2", "🏸", "青"]:
        assert private not in exposed

    bad = copy.deepcopy(rows)
    bad[2]["stateJSON"] = bad[2]["stateJSON"] + " "  # Valid JSON but different hash.
    issue(inspect(bad, sessions, audits), "REVISION_SHA256_MISMATCH")
    bad = copy.deepcopy(rows)
    bad[2]["sha256"] = bad[1]["sha256"]
    bad[1]["sha256"] = "0" * 64
    issue(inspect(bad, sessions, audits), "REVISION_GROUP_MISMATCH")
    bad = copy.deepcopy(rows)
    bad[2]["chunkIndex"] = 1
    issue(inspect(bad, sessions, audits), "REVISION_CHUNK_INDEX")
    bad = copy.deepcopy(rows)
    bad[2]["stage"] = "staging"
    issue(inspect(bad, sessions, audits), "REVISION_NOT_READY")
    bad = copy.deepcopy(rows)
    bad[2]["stateJSON"] = "a" * 30001
    issue(inspect(bad, sessions, audits), "REVISION_CHUNK_TEXT")
    bad = copy.deepcopy(rows)
    bad.pop(1)
    issue(inspect(bad, sessions, audits), "REVISION_CHUNK_COUNT")
    bad = copy.deepcopy(rows)
    bad[0].pop("sha256")
    issue(inspect(bad, sessions, audits), "REVISION_COLUMNS_MISSING")

    bad_session = copy.deepcopy(sessions)
    bad_session[0]["activeRevisionId"] = "RV-MISSING"
    issue(inspect(rows, bad_session, audits), "SESSION_ACTIVE_REVISION_UNVERIFIED")
    bad_session = copy.deepcopy(sessions)
    bad_session[0]["practiceId"] = "FICTION-OTHER"
    issue(inspect(rows, bad_session, audits), "SESSION_CROSS_PRACTICE_REVISION")
    bad_session = copy.deepcopy(sessions)
    bad_session[0]["sessionVersion"] = 1
    issue(inspect(rows, bad_session, audits), "SESSION_VERSION_MISMATCH")
    bad_session = copy.deepcopy(sessions)
    bad_session.append(dict(bad_session[0]))
    issue(inspect(rows, bad_session, audits), "SESSION_DUPLICATED")

    # Committed pointer can survive a late audit append failure in legacy GAS.
    missing_audit = inspect(rows, sessions, audits[:1])
    assert missing_audit["status"] == "CANDIDATE_ONLY"
    assert missing_audit["warning_counts"] == {"REVISION_AUDIT_NOT_FOUND": 1}
    duplicated_audit = audits + [dict(audits[-1])]
    issue(inspect(rows, sessions, duplicated_audit), "AUDIT_DUPLICATED_OPERATION")

    try:
        inspect(rows, sessions, audits, scope="real_sheet")
    except PreflightInputError:
        pass
    else:
        raise AssertionError("live data must not pass fixture-only preflight")

    print("PASS: fabricated match version SHA, split UTF-16, pointer/CAS, audit and NO-GO; no I/O")


if __name__ == "__main__":
    main()
