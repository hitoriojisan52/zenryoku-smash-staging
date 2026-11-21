#!/usr/bin/env python3
"""D1 phase11: fabricated-only legacy match revision and deleted-match archive drill.

This module NEVER accesses files, Google, D1, HTTP, or production data. The
virtual reconstruction contains synthetic source data and MUST NOT be logged.
No restoring to a real Sheets/D1 database, no mutation or cutover.
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
from collections import Counter, defaultdict

SCOPE = "fabricated_offline_only"
MATCH_TARGET_WIDTH = {"試合セッション": 5, "試合版管理": 9, "試合操作履歴": 7}
MATCH_SOURCE_REVISION_WIDTH = 7
ARCHIVE_COLUMNS = (
    "operationId", "practiceId", "archivedAt", "archivedBy",
    "chunkIndex", "chunkCount", "snapshotChunk", "status",
)
MAX_ARCHIVE_CHUNKS = 3000
MAX_CHUNK_UTF16 = 12000
MAX_REVISION_CHUNKS = 30
MAX_REVISION_UTF16 = 30000


class UnsafeRecovery(ValueError):
    def __init__(self, code: str):
        # NEVER incorporate raw IDs, JSON, hashes, or PIIs into exception text.
        super().__init__(code)
        self.code = code


def require(test: bool, code: str) -> None:
    if not test:
        raise UnsafeRecovery(code)


def utf16_bytes(raw: str) -> bytes:
    require(isinstance(raw, str), "NOT_TEXT")
    return raw.encode("utf-16-le", errors="surrogatepass")


def rejoin_utf16(chunks: list[str]) -> str:
    """Rejoin JS UTF-16 code units before decoding an emoji split across rows."""
    try:
        return b"".join(utf16_bytes(s) for s in chunks).decode("utf-16-le")
    except UnicodeError:
        raise UnsafeRecovery("BROKEN_UTF16") from None


def _nonempty(value) -> bool:
    return isinstance(value, str) and bool(value)


def _positive_int(value) -> bool:
    return type(value) is int and value >= 1


def _numeric_version(value) -> bool:
    return type(value) is int and value >= 0


def _is_blank(value) -> bool:
    return value is None or value == ""


def normalize_revision_cells(cells: list, *, scope: str) -> dict:
    """Plan a 9-column projection but preserve exact original 7/9-cell input.

    GAS load accepts missing chunkIndex/chunkTotal on a pre-chunk 7-col row.
    Archive getRange(9) may pad that old row with 2 empty cells. Treat both as
    legacy-compatible *candidate*, never as evidence that source had 9 cols.
    """
    require(scope == SCOPE, "LIVE_SCOPE_FORBIDDEN")
    require(isinstance(cells, list) and len(cells) in (7, 9),
            "REVISION_SOURCE_WIDTH")
    original = copy.deepcopy(cells)
    require(_nonempty(cells[0]) and _nonempty(cells[1]) and
            cells[2] in ("ready", "staging") and isinstance(cells[3], str)
            and _nonempty(cells[5]), "REVISION_HEADER")
    require(isinstance(cells[4], str) and
            re.fullmatch(r"[a-f0-9]{64}", cells[4]) is not None,
            "REVISION_HASH_FORMAT")

    if len(cells) == 7 or (_is_blank(cells[7]) and _is_blank(cells[8])):
        idx, total, legacy = 1, 1, True
    else:
        # GAS Number(value)||1 also maps 0 to 1, but a D1 migration MUST
        # reject ambiguous zero/mixed missing fields instead of guessing.
        require(_positive_int(cells[7]) and _positive_int(cells[8]),
                "REVISION_AMBIGUOUS_CHUNK_FIELDS")
        idx, total, legacy = cells[7], cells[8], False
    require(total <= MAX_REVISION_CHUNKS and idx <= total,
            "REVISION_CHUNK_BOUNDS")
    require(len(utf16_bytes(cells[3])) // 2 <= MAX_REVISION_UTF16 or legacy,
            "REVISION_CHUNK_LIMIT")
    return {
        "source_cells": original,
        "candidate9": copy.deepcopy(cells[:7]) + [idx, total],
        "legacy_equivalent": legacy,
    }


def _validate_archive(rows: list[dict]) -> dict:
    require(isinstance(rows, list) and bool(rows) and
            len(rows) <= MAX_ARCHIVE_CHUNKS, "ARCHIVE_ROW_COUNT")
    require(all(isinstance(r, dict) and
                all(k in r for k in ARCHIVE_COLUMNS) for r in rows),
            "ARCHIVE_COLUMNS")
    first = rows[0]
    practice, op, actor, archived_at = (
        first["practiceId"], first["operationId"],
        first["archivedBy"], first["archivedAt"])
    require(_nonempty(practice) and _nonempty(op) and _nonempty(actor),
            "ARCHIVE_ID_MISSING")
    count = first["chunkCount"]
    require(_positive_int(count) and count <= MAX_ARCHIVE_CHUNKS and
            len(rows) == count, "ARCHIVE_CHUNK_COUNT")
    require(all(r["operationId"] == op and r["practiceId"] == practice
                and r["archivedBy"] == actor and r["archivedAt"] == archived_at
                and r["chunkCount"] == count for r in rows),
            "ARCHIVE_GROUP_MIXED")
    require(all(_positive_int(r["chunkIndex"]) for r in rows) and
            sorted(r["chunkIndex"] for r in rows) == list(range(1, count + 1)),
            "ARCHIVE_CHUNK_INDEX")
    ordered = sorted(rows, key=lambda r: r["chunkIndex"])
    require(ordered[0]["status"] == "completed",
            "ARCHIVE_NOT_COMPLETED")
    require(all(_is_blank(r["status"]) for r in ordered[1:]),
            "ARCHIVE_EXTRA_STATUS")
    require(all(isinstance(r["snapshotChunk"], str) and
                len(utf16_bytes(r["snapshotChunk"])) // 2 <= MAX_CHUNK_UTF16
                for r in ordered), "ARCHIVE_CHUNK_TEXT")
    raw = rejoin_utf16([r["snapshotChunk"] for r in ordered])
    try:
        snapshot = json.loads(raw)
    except (ValueError, UnicodeError):
        raise UnsafeRecovery("ARCHIVE_JSON_INVALID") from None
    require(isinstance(snapshot, dict) and snapshot.get("schema") == 1,
            "ARCHIVE_SCHEMA")
    require(snapshot.get("practiceId") == practice and
            _numeric_version(snapshot.get("sessionVersion")) and
            _numeric_version(snapshot.get("settingsVersion")),
            "ARCHIVE_PRACTICE_VERSION")
    targets, links = snapshot.get("targets"), snapshot.get("links")
    require(isinstance(targets, dict) and
            set(targets) == set(MATCH_TARGET_WIDTH) and
            isinstance(links, list), "ARCHIVE_TARGETS")
    for table, width in MATCH_TARGET_WIDTH.items():
        items = targets[table]
        require(isinstance(items, list), "ARCHIVE_TARGET_ROW_SET")
        previous = 1
        for item in items:
            require(isinstance(item, dict) and
                    set(item) == {"rowNumber", "cells"} and
                    _positive_int(item["rowNumber"]) and
                    item["rowNumber"] > previous and
                    isinstance(item["cells"], list) and
                    len(item["cells"]) == width,
                    "ARCHIVE_TARGET_ROW")
            previous = item["rowNumber"]
            ref = item["cells"][1 if table != "試合セッション" else 0]
            require(ref == practice, "ARCHIVE_CROSS_PRACTICE")
    previous = 1
    for item in links:
        require(isinstance(item, dict) and
                set(item) == {"rowNumber", "cells"} and
                _positive_int(item["rowNumber"]) and
                item["rowNumber"] > previous and
                isinstance(item["cells"], list) and
                len(item["cells"]) == 6, "ARCHIVE_LINK_ROW")
        previous = item["rowNumber"]
        require(item["cells"][1] == practice and
                _is_blank(item["cells"][3]), "ARCHIVE_LINK_PRACTICE_OR_STATUS")
    require(len(targets["試合セッション"]) == 1,
            "ARCHIVE_SESSION_COUNT")
    session = targets["試合セッション"][0]["cells"]
    require(_nonempty(session[1]), "ARCHIVE_ACTIVE_REVISION_MISSING")
    require(session[2] == snapshot["sessionVersion"] and
            session[3] == snapshot["settingsVersion"],
            "ARCHIVE_VERSION_MISMATCH")

    normalized = []
    for item in targets["試合版管理"]:
        norm = normalize_revision_cells(item["cells"], scope=SCOPE)
        normalized.append(norm["candidate9"])
    grouped = defaultdict(list)
    for row in normalized:
        grouped[row[0]].append(row)

    active_ok = False
    legacy_candidates = 0
    for revision_id, group in grouped.items():
        n = group[0][8]
        require(len(group) == n and
                sorted(r[7] for r in group) == list(range(1, n + 1)),
                "ARCHIVE_REVISION_CHUNKS")
        require(all(r[1] == practice and r[4] == group[0][4]
                    and r[5] == group[0][5] and r[8] == n
                    and r[2] == group[0][2] for r in group),
                "ARCHIVE_REVISION_MIXED")
        if any(r[2] != "ready" for r in group):
            # A staged row could have been present at the instant of deletion.
            # Never invent a ready commit while reconstructing it.
            require(revision_id != session[1], "ARCHIVE_ACTIVE_NOT_READY")
            continue
        joined = rejoin_utf16([r[3] for r in sorted(group, key=lambda r: r[7])])
        try:
            digest = hashlib.sha256(joined.encode("utf-8")).hexdigest()
        except UnicodeError:
            raise UnsafeRecovery("ARCHIVE_REVISION_UTF16") from None
        require(digest == group[0][4], "ARCHIVE_REVISION_SHA")
        try:
            obj = json.loads(joined)
        except (UnicodeError, ValueError):
            raise UnsafeRecovery("ARCHIVE_REVISION_JSON") from None
        require(isinstance(obj, dict), "ARCHIVE_REVISION_JSON_OBJECT")
        if revision_id == session[1]:
            require(obj.get("sessionVersion") == snapshot["sessionVersion"] and
                    obj.get("settingsVersion") == snapshot["settingsVersion"],
                    "ARCHIVE_ACTIVE_VERSION")
            active_ok = True
    require(active_ok, "ARCHIVE_ACTIVE_REVISION_UNVERIFIED")

    for item in targets["試合操作履歴"]:
        cells = item["cells"]
        require(cells[1] == practice, "ARCHIVE_AUDIT_PRACTICE")
    return {
        "source": copy.deepcopy(snapshot),
        "source_raw": raw,
        "counts": {
            "archive_chunks": count,
            "match_session_rows": len(targets["試合セッション"]),
            "match_revision_rows": len(targets["試合版管理"]),
            "match_audit_rows": len(targets["試合操作履歴"]),
            "guest_link_rows": len(links),
        },
        "legacy_compatible_rows": sum(1 for x in targets["試合版管理"]
                                      if len(x["cells"]) == 9 and
                                      _is_blank(x["cells"][7]) and
                                      _is_blank(x["cells"][8])),
    }


def inspect_archive(*, scope: str, rows: list) -> dict:
    """Safe to log: ONLY codes and counts. No source values or hashes."""
    require(scope == SCOPE, "LIVE_SCOPE_FORBIDDEN")
    counts = {"archive_rows": len(rows) if isinstance(rows, list) else 0}
    issues = Counter()
    try:
        result = _validate_archive(rows)
        counts.update(result["counts"])
        counts["legacy_compatible_rows"] = result["legacy_compatible_rows"]
    except UnsafeRecovery as exc:
        issues[exc.code] += 1
    return {
        "status": "BLOCKED" if issues else "CANDIDATE_ONLY",
        "counts": counts,
        "issue_counts": dict(issues),
        # Legacy deletion archives have NO independent original SHA.
        "unverified_provenance": True,
        "source_backup_required": True,
        "write_authorized": False,
        "cutover_authorized": False,
    }


def virtual_reconstruct(*, scope: str, rows: list) -> dict:
    """Return a synthetic in-memory *plan*, never alter a spreadsheet.

    Caller must never log this rich reconstruction (contains JSON and IDs).
    Each source row retains original rowNumber and original 9-cell contents.
    """
    require(scope == SCOPE, "LIVE_SCOPE_FORBIDDEN")
    data = _validate_archive(rows)["source"]
    return {
        "targets": copy.deepcopy(data["targets"]),
        "links": copy.deepcopy(data["links"]),
        "practiceId": data["practiceId"],
        "requires_manual_review": True,
        "actual_restore_performed": False,
    }
