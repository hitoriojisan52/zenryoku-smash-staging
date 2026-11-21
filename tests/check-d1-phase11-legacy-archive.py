#!/usr/bin/env python3
"""Phase11: pure fabricated archive drill; no source Sheets/D1/net I/O."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "d1-staging" / "phase11"))
from legacy_archive_guard import (
    SCOPE, UnsafeRecovery, normalize_revision_cells,
    inspect_archive, virtual_reconstruct, utf16_bytes,
)

P = "FICTION-PRACTICE"
REV_OLD = "RV-FICTION-PREVIOUS"
REV_NEW = "RV-FICTION-ACTIVE"


def match_row(rev, state, op):
    raw = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    sha = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return [rev, P, "ready", raw, sha, op, "FICTION-DATE"]


def utf16_split(text, at):
    b = utf16_bytes(text)
    return [
        b[:2 * at].decode("utf-16-le", errors="surrogatepass"),
        b[2 * at:].decode("utf-16-le", errors="surrogatepass"),
    ]


def fixture():
    old = match_row(REV_OLD, {"sessionVersion": 1, "settingsVersion": 1},
                    "FICTION-OP-OLD") + [None, None]
    new_state = {
        "sessionVersion": 2, "settingsVersion": 1,
        "memo": "🏸", "participants": ["FICTION-TARO", "FICTION-HANAKO"],
    }
    new_full = match_row(REV_NEW, new_state, "FICTION-OP-NEW")
    cut = len(utf16_bytes(new_full[3].split("🏸")[0])) // 2 + 1
    parts = utf16_split(new_full[3], cut)
    rev1 = new_full[:3] + [parts[0]] + new_full[4:] + [1, 2]
    rev2 = new_full[:3] + [parts[1]] + new_full[4:] + [2, 2]
    snapshot = {
        "schema": 1, "practiceId": P,
        "sessionVersion": 2, "settingsVersion": 1,
        "targets": {
            "試合セッション": [{
                "rowNumber": 12,
                "cells": [P, REV_NEW, 2, 1, "2026/11/21 10:00:00"],
            }],
            "試合版管理": [
                {"rowNumber": 3, "cells": old},
                {"rowNumber": 8, "cells": rev1},
                {"rowNumber": 9, "cells": rev2},
            ],
            "試合操作履歴": [
                {"rowNumber": 5, "cells": [
                    "FICTION-OP-OLD", P, "FICTION-ACTOR", "create", 1,
                    "2026/11/21 09:00:00", REV_OLD,
                ]},
                {"rowNumber": 7, "cells": [
                    "FICTION-OP-NEW", P, "FICTION-ACTOR", "advance", 2,
                    "2026/11/21 10:00:00", REV_NEW,
                ]},
            ],
        },
        # Optional guest links are read before the deletion changes revokedAt.
        "links": [{"rowNumber": 4, "cells": [
            "FICTITIOUS-TOKEN-" + "X" * 12200, P,
            "2026/12/31", None, "FICTION-ACTOR", "2026/11/21",
        ]}],
    }
    return snapshot


def chunked(snapshot):
    # Archive JSON.stringify escapes a surrogate in a nested match row. Use
    # ensure_ascii=True so fabricated raw snapshots also remain JSON portable.
    raw = json.dumps(snapshot, ensure_ascii=True, separators=(",", ":"))
    b = utf16_bytes(raw)
    pieces = [
        b[n:n + 12000 * 2].decode("utf-16-le", errors="surrogatepass")
        for n in range(0, len(b), 12000 * 2)
    ]
    assert len(pieces) >= 2, "expected multi-chunk legacy archive fixture"
    return [{
        "operationId": "FICTION-OP-DELETE",
        "practiceId": P,
        "archivedAt": "2026/11/21 11:00:00",
        "archivedBy": "FICTION-ACTOR",
        "chunkIndex": i + 1,
        "chunkCount": len(pieces),
        "snapshotChunk": part,
        "status": "completed" if i == 0 else "",
    } for i, part in enumerate(pieces)]


def assert_blocked(rows, code):
    result = inspect_archive(scope=SCOPE, rows=rows)
    assert result["status"] == "BLOCKED", result
    assert result["issue_counts"].get(code) == 1, result
    assert result["write_authorized"] is False
    assert result["cutover_authorized"] is False
    assert result["unverified_provenance"] is True


def assert_reject(fn, code):
    try:
        fn()
    except UnsafeRecovery as exc:
        assert exc.code == code, (exc.code, code)
    else:
        raise AssertionError("unsafe case accepted: " + code)


def main():
    original = fixture()
    rows = chunked(original)
    original_frozen = copy.deepcopy(original)
    rows_frozen = copy.deepcopy(rows)
    result = inspect_archive(scope=SCOPE, rows=rows)
    assert result["status"] == "CANDIDATE_ONLY", result
    assert result["counts"] == {
        "archive_rows": len(rows), "archive_chunks": len(rows),
        "match_session_rows": 1, "match_revision_rows": 3,
        "match_audit_rows": 2, "guest_link_rows": 1,
        "legacy_compatible_rows": 1,
    }
    assert result["source_backup_required"] is True
    assert result["unverified_provenance"] is True
    assert result["write_authorized"] is False and result["cutover_authorized"] is False
    assert not result["issue_counts"]
    assert "FICTION-" not in json.dumps(result)

    plan = virtual_reconstruct(scope=SCOPE, rows=rows)
    assert plan["actual_restore_performed"] is False
    assert plan["requires_manual_review"] is True
    assert plan["targets"] == original["targets"]
    assert plan["links"] == original["links"]
    assert plan["targets"]["試合版管理"][0]["cells"][-2:] == [None, None]
    plan["links"][0]["cells"][0] = "MODIFIED-IN-MEMORY"
    assert virtual_reconstruct(scope=SCOPE, rows=rows)["links"] == original["links"]
    assert original == original_frozen and rows == rows_frozen

    legacy = original["targets"]["試合版管理"][0]["cells"]
    direct = normalize_revision_cells(legacy[:7], scope=SCOPE)
    padded = normalize_revision_cells(legacy, scope=SCOPE)
    assert direct["legacy_equivalent"] and padded["legacy_equivalent"]
    assert len(direct["source_cells"]) == 7
    assert len(padded["source_cells"]) == 9
    assert padded["source_cells"][-2:] == [None, None]
    assert direct["candidate9"] == padded["candidate9"]
    assert direct["candidate9"][-2:] == [1, 1]
    for invalid, code in [
        (legacy[:6], "REVISION_SOURCE_WIDTH"),
        (legacy[:7] + [0, 1], "REVISION_AMBIGUOUS_CHUNK_FIELDS"),
        (legacy[:7] + [1, ""], "REVISION_AMBIGUOUS_CHUNK_FIELDS"),
        (legacy[:7] + [True, 1], "REVISION_AMBIGUOUS_CHUNK_FIELDS"),
        (legacy[:7] + [2, 1], "REVISION_CHUNK_BOUNDS"),
    ]:
        assert_reject(lambda v=invalid: normalize_revision_cells(v, scope=SCOPE), code)
    assert_reject(lambda: normalize_revision_cells(legacy, scope="real_data"),
                  "LIVE_SCOPE_FORBIDDEN")

    def modify_snapshot(fn):
        fake = copy.deepcopy(original)
        fn(fake)
        return chunked(fake)

    assert_blocked(
        [dict(rows[0], status="prepared")] + rows[1:], "ARCHIVE_NOT_COMPLETED"
    )
    assert_blocked(rows[:-1], "ARCHIVE_CHUNK_COUNT")
    assert_blocked(
        rows[:1] + [dict(rows[1], chunkIndex=1)] + rows[2:],
        "ARCHIVE_CHUNK_INDEX"
    )
    assert_blocked(
        rows[:1] + [dict(rows[1], practiceId="OTHER")] + rows[2:],
        "ARCHIVE_GROUP_MIXED"
    )
    assert_blocked(modify_snapshot(
        lambda s: s["targets"]["試合版管理"][1]["cells"].__setitem__(4, "0" * 64)),
        "ARCHIVE_REVISION_MIXED"
    )
    assert_blocked(modify_snapshot(
        lambda s: s["targets"]["試合版管理"][2]["cells"].__setitem__(2, "staging")),
        "ARCHIVE_REVISION_MIXED"
    )
    assert_blocked(modify_snapshot(
        lambda s: s["targets"]["試合セッション"][0]["cells"].__setitem__(1, "OTHER")),
        "ARCHIVE_ACTIVE_REVISION_UNVERIFIED"
    )
    assert_blocked(modify_snapshot(
        lambda s: s["targets"]["試合セッション"][0]["cells"].__setitem__(2, 5)),
        "ARCHIVE_VERSION_MISMATCH"
    )
    assert_blocked(modify_snapshot(
        lambda s: s["targets"]["試合操作履歴"][0]["cells"].__setitem__(1, "OTHER")),
        "ARCHIVE_CROSS_PRACTICE"
    )
    assert_blocked(modify_snapshot(
        lambda s: s["links"][0]["cells"].__setitem__(3, "2026/11/21")),
        "ARCHIVE_LINK_PRACTICE_OR_STATUS"
    )
    assert_blocked(modify_snapshot(
        lambda s: s["targets"]["試合版管理"][2].__setitem__("rowNumber", 8)),
        "ARCHIVE_TARGET_ROW"
    )
    assert_blocked(modify_snapshot(
        lambda s: s["targets"].pop("試合操作履歴")),
        "ARCHIVE_TARGETS"
    )

    # Valid-JSON tampering in a legacy deletion archive may remain undetectable:
    # the original archive has no independent SHA. We must never upgrade its
    # candidate status to data-copy approval merely because JSON parsed.
    innocuous_edit = modify_snapshot(
        lambda s: s["links"][0]["cells"].__setitem__(0, "OTHER-FAKE-TOKEN"))
    limited = inspect_archive(scope=SCOPE, rows=innocuous_edit)
    assert limited["status"] == "CANDIDATE_ONLY"
    assert limited["unverified_provenance"] and limited["source_backup_required"]
    assert not limited["write_authorized"] and not limited["cutover_authorized"]

    assert_reject(lambda: inspect_archive(scope="real_data", rows=rows),
                  "LIVE_SCOPE_FORBIDDEN")
    assert_reject(lambda: virtual_reconstruct(scope="real_data", rows=rows),
                  "LIVE_SCOPE_FORBIDDEN")
    print("PASS: fabricated old7/raw9 revisions, lossless archive row numbers, UTF16, SHA, prepared and no real restore")


if __name__ == "__main__":
    main()
