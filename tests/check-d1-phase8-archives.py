#!/usr/bin/env python3
"""Offline, fabricated-only D1 phase8 archive preflight. Never inspect live rows."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GAS = (ROOT / "gas-staging/コード.gs").read_text(encoding="utf-8")

class UnsafeArchive(ValueError):
    pass

def fail(reason):
    raise UnsafeArchive(reason)

def validate_group(rows, *, revision=False):
    """Return raw reconstructed JSON iff every chunk/status/hash is consistent."""
    if not rows:
        fail("missing")
    keys = {"revision", "practice", "index", "total", "chunk"}
    if any(not keys.issubset(row) for row in rows):
        fail("missing columns")
    ids = {row["revision"] for row in rows}
    practices = {row["practice"] for row in rows}
    totals = {row["total"] for row in rows}
    if len(ids) != 1 or len(practices) != 1 or len(totals) != 1:
        fail("mixed groups")
    total = next(iter(totals))
    limit = 30 if revision else 3000
    if type(total) is not int or not 1 <= total <= limit or len(rows) != total:
        fail("count inconsistent")
    found = {}
    for row in rows:
        n = row["index"]
        if type(n) is not int or not 1 <= n <= total or n in found:
            fail("duplicate/out-of-range index")
        if not isinstance(row["chunk"], str):
            fail("non-text payload")
        found[n] = row
    if len(found) != total:
        fail("missing index")
    chunks = [found[i] for i in range(1, total + 1)]
    if revision:
        hashes = {row.get("sha256") for row in rows}
        if len(hashes) != 1 or any(row.get("stage") != "ready" for row in rows):
            fail("revision not ready or hash mismatch")
        digest = next(iter(hashes))
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            fail("invalid digest")
    else:
        if chunks[0].get("status") != "completed":
            fail("pending recovery blocks migration")
        if any(row.get("status", "") not in ("", None) for row in chunks[1:]):
            fail("unexpected non-first status")
    raw = "".join(row["chunk"] for row in chunks)
    if revision and hashlib.sha256(raw.encode("utf-8")).hexdigest() != digest:
        fail("payload sha256")
    try:
        obj = json.loads(raw)
    except (UnicodeError, ValueError):
        fail("non-JSON payload")
    if not isinstance(obj, dict):
        fail("payload must be JSON object")
    if not revision and obj.get("schema") != 1:
        fail("unknown archive schema")
    return raw

def js_utf16_chunks(text, units):
    """Mirror JS String.slice offsets in UTF-16 code units, not Python codepoints."""
    b = text.encode("utf-16-le", errors="surrogatepass")
    return [b[pos:pos + units * 2] for pos in range(0, len(b), units * 2)]

def fixtures():
    fixture = {"schema": 1, "practiceId": "FICTION-P", "targets": {"example": "a" * 25000}}
    raw = json.dumps(fixture, ensure_ascii=False, separators=(",", ":"))
    chunks = [raw[i:i + 12000] for i in range(0, len(raw), 12000)]
    rows = [
        {"revision": "OP-FICTION", "practice": "FICTION-P",
         "index": i + 1, "total": len(chunks), "chunk": chunk,
         "status": "completed" if i == 0 else ""}
        for i, chunk in enumerate(chunks)
    ]
    assert validate_group(rows) == raw
    failures = [
        rows[:-1],
        rows + [dict(rows[-1])],
        [dict(rows[0], index=2)] + rows[1:],
        [dict(rows[0], total=99)] + rows[1:],
        [dict(rows[0], status="prepared")] + rows[1:],
        [dict(rows[0], practice="DIFFERENT")] + rows[1:],
        [dict(rows[0], chunk=rows[0]["chunk"] + "x")] + rows[1:],
    ]
    for bad in failures:
        try:
            validate_group(bad)
        except UnsafeArchive:
            continue
        raise AssertionError("unsafe archive was accepted")

    state = {"emoji": "🏸", "sessionVersion": 1, "list": [1, 2, 3]}
    original = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    code_units = js_utf16_chunks(original, 16)
    # Joining the byte chunks before UTF-16 decoding preserves surrogate pairs.
    assert b"".join(code_units).decode("utf-16-le") == original
    match_chunks = js_utf16_chunks(original, 30000)
    match_text = b"".join(match_chunks).decode("utf-16-le")
    sha = hashlib.sha256(match_text.encode("utf-8")).hexdigest()
    revision_rows = [
        {"revision": "RV-FICTION", "practice": "FICTION-P",
         "index": 1, "total": 1, "chunk": match_text,
         "stage": "ready", "sha256": sha}
    ]
    assert validate_group(revision_rows, revision=True) == original
    for bad in [
        [dict(revision_rows[0], stage="staging")],
        [dict(revision_rows[0], sha256="0" * 64)],
        [dict(revision_rows[0], total=2)],
    ]:
        try:
            validate_group(bad, revision=True)
        except UnsafeArchive:
            continue
        raise AssertionError("unsafe match revision accepted")

def check_gas_contract():
    # A source edit requires a fresh archive contract review, not silent drift.
    assert re.search(r"MATCH_CHUNK_CHARS\s*=\s*30000\s*;", GAS)
    assert re.search(r"MATCH_MAX_CHUNKS\s*=\s*30\s*;", GAS)
    assert GAS.count("size=12000") >= 2
    assert "snapshot.length>38000" in GAS
    assert "before.length>38000" in GAS
    assert "i===0?'prepared':''" in GAS
    assert "matchHash_(readback)!==sha" in GAS
    assert "matchHash_(json)!==str_(versions[0][4])" in GAS
    assert "archive.getRange(first,8).setValue('completed')" in GAS
    assert "archive.getRange(archiveRow,8).setValue('completed')" in GAS

if __name__ == "__main__":
    check_gas_contract()
    fixtures()
    print("PASS: fabricated archive/revision chunks, hash, prepared gate, UTF-16 and corruption rejection; no external I/O")
