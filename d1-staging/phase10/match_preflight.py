"""Phase10: deterministic, fabricated-only match revision integrity preflight.

No Google/Cloudflare access, persistence, repair, import, data copy, or cutover.
Never echo source identifiers, hashes, archived JSON, or operation IDs in results.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import hashlib
import json

REQUIRED_REVISION_KEYS = (
    "revisionId", "practiceId", "stage", "stateJSON", "sha256",
    "operationId", "createdAt", "chunkIndex", "chunkTotal",
)
MAX_CHUNKS = 30
MAX_UTF16_UNITS = 30000


class PreflightInputError(ValueError):
    pass


def _utf16_units(text: str) -> int:
    return len(text.encode("utf-16-le", errors="surrogatepass")) // 2


def _normalize_js_utf16(text: str) -> str:
    # GAS slices JavaScript strings in UTF-16 *code units*. A surrogate pair
    # may straddle two chunks. Reassemble before decoding/UTF-8 hashing.
    return text.encode("utf-16-le", errors="surrogatepass").decode("utf-16-le")


def _int(value) -> bool:
    return type(value) is int and value >= 0


def inspect_fabricated_match_snapshot(*, scope: str, revisions: list,
                                      sessions: list, audits: list) -> dict:
    """Offline synthetic safety decision. Outputs counts, never input values."""
    if scope != "fabricated_offline_only":
        raise PreflightInputError("live data unsupported")
    if not all(isinstance(rows, list) for rows in (revisions, sessions, audits)):
        raise PreflightInputError("invalid row collection")
    issues, warnings = Counter(), Counter()
    if len(revisions) > 10000 or len(sessions) > 10000 or len(audits) > 10000:
        raise PreflightInputError("unsupported offline fixture size")

    groups = defaultdict(list)
    for row in revisions:
        if not isinstance(row, dict) or any(k not in row for k in REQUIRED_REVISION_KEYS):
            issues["REVISION_COLUMNS_MISSING"] += 1
            continue
        revision_id = row["revisionId"]
        if not isinstance(revision_id, str) or not revision_id:
            issues["REVISION_ID_MISSING"] += 1
            continue
        groups[revision_id].append(row)

    verified = {}
    for rev_id, rows in groups.items():
        first = rows[0]
        total = first["chunkTotal"]
        practice = first["practiceId"]
        operation = first["operationId"]
        sha = first["sha256"]
        if not isinstance(practice, str) or not practice or not isinstance(operation, str) or not operation:
            issues["REVISION_METADATA_MISSING"] += 1
            continue
        if type(total) is not int or not (1 <= total <= MAX_CHUNKS) or len(rows) != total:
            issues["REVISION_CHUNK_COUNT"] += 1
            continue
        if any(row["practiceId"] != practice or row["operationId"] != operation
               or row["sha256"] != sha or row["chunkTotal"] != total
               for row in rows):
            issues["REVISION_GROUP_MISMATCH"] += 1
            continue
        indexes = [row["chunkIndex"] for row in rows]
        if any(type(n) is not int or n < 1 or n > total for n in indexes) or sorted(indexes) != list(range(1, total + 1)):
            issues["REVISION_CHUNK_INDEX"] += 1
            continue
        if any(row["stage"] != "ready" for row in rows):
            issues["REVISION_NOT_READY"] += 1
            continue
        if not isinstance(sha, str) or len(sha) != 64 or any(c not in "0123456789abcdef" for c in sha):
            issues["REVISION_DIGEST_FORMAT"] += 1
            continue
        if any(not isinstance(row["stateJSON"], str) or
               _utf16_units(row["stateJSON"]) > MAX_UTF16_UNITS for row in rows):
            issues["REVISION_CHUNK_TEXT"] += 1
            continue
        raw = "".join(row["stateJSON"] for row in sorted(rows, key=lambda row: row["chunkIndex"]))
        try:
            raw = _normalize_js_utf16(raw)
            actual = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        except UnicodeError:
            issues["REVISION_UTF16_INVALID"] += 1
            continue
        if sha != actual:
            issues["REVISION_SHA256_MISMATCH"] += 1
            continue
        try:
            obj = json.loads(raw)
        except (ValueError, UnicodeError):
            issues["REVISION_JSON_INVALID"] += 1
            continue
        if not isinstance(obj, dict):
            issues["REVISION_JSON_NOT_OBJECT"] += 1
            continue
        verified[rev_id] = (practice, obj, operation)

    active_by_practice = {}
    for row in sessions:
        if not isinstance(row, dict):
            issues["SESSION_INVALID"] += 1
            continue
        practice = row.get("practiceId")
        rev_id = row.get("activeRevisionId")
        if not isinstance(practice, str) or not practice or not isinstance(rev_id, str) or not rev_id:
            issues["SESSION_INVALID"] += 1
            continue
        if practice in active_by_practice:
            issues["SESSION_DUPLICATED"] += 1
            continue
        active_by_practice[practice] = rev_id
        data = verified.get(rev_id)
        if not data:
            issues["SESSION_ACTIVE_REVISION_UNVERIFIED"] += 1
            continue
        version = row.get("sessionVersion")
        settings = row.get("settingsVersion")
        if data[0] != practice:
            issues["SESSION_CROSS_PRACTICE_REVISION"] += 1
        elif not _int(version) or not _int(settings) or (
            type(data[1].get("sessionVersion")) is not int or
            type(data[1].get("settingsVersion")) is not int or
            data[1].get("sessionVersion") != version or
            data[1].get("settingsVersion") != settings
        ):
            issues["SESSION_VERSION_MISMATCH"] += 1

    # Historical revisions do not have to be active. GAS appends audit AFTER
    # switching the active pointer and catches append errors. Missing audit is
    # a *warning* requiring review; it does not authorize invented records.
    audited_ids = set()
    for row in audits:
        if not isinstance(row, dict):
            issues["AUDIT_INVALID"] += 1
            continue
        op = row.get("operationId")
        if not isinstance(op, str) or not op:
            issues["AUDIT_INVALID"] += 1
            continue
        if op in audited_ids:
            issues["AUDIT_DUPLICATED_OPERATION"] += 1
        audited_ids.add(op)
    for practice, _, operation in verified.values():
        if operation not in audited_ids:
            warnings["REVISION_AUDIT_NOT_FOUND"] += 1

    # If a loaded session references a bad revision, do not skip it by
    # comparing only old archived/candidate revisions.
    counts = {
        "revision_rows": len(revisions),
        "revision_groups": len(groups),
        "verified_revisions": len(verified),
        "sessions": len(sessions),
        "audit_rows": len(audits),
    }
    return {
        "status": "BLOCKED" if issues else "CANDIDATE_ONLY",
        "counts": counts,
        "issue_counts": dict(sorted(issues.items())),
        "warning_counts": dict(sorted(warnings.items())),
        "write_authorized": False,
        "cutover_authorized": False,
    }
