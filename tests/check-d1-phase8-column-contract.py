#!/usr/bin/env python3
"""Phase 8: only static header mapping and offline SQLite schema; never read live data."""
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "d1-staging/phase8/source-column-contract.json"
MIGRATIONS = ROOT / "d1-staging/migrations"
GAS = ROOT / "gas-staging/コード.gs"

def check():
    manifest = json.loads(CONTRACT.read_text(encoding="utf-8"))
    assert manifest["version"] == 1
    assert manifest["auto_import_allowed"] is False
    assert manifest["source_is_system_of_record"] is True
    assert manifest["timezone"] == "Asia/Tokyo"
    entries = manifest["sheets"]
    assert len(entries) == 20
    assert len({e["source"] for e in entries}) == 20
    assert len({e["target"] for e in entries}) == 20
    with sqlite3.connect(":memory:") as db:
        for p in sorted(MIGRATIONS.glob("*.sql")):
            db.executescript(p.read_text(encoding="utf-8"))
        tables = {
            r[0] for r in db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' AND name NOT IN "
                "('d1_migrations','stage_d1_bootstrap')"
            )
        }
        assert tables == {e["target"] for e in entries}, "missing or newly unmapped D1 table"
        count = 0
        for e in entries:
            columns = e["d1_columns"]
            headers = e["headers"]
            key = e["logical_key"]
            assert len(headers) == len(columns) and len(headers) > 0
            assert len(set(headers)) == len(headers)
            assert len(set(columns)) == len(columns)
            assert set(key).issubset(headers)
            sql_columns = [r[1] for r in db.execute(
                'PRAGMA table_info("' + e["target"] + '")'
            )]
            assert set(sql_columns) == set(columns), f"{e['source']}: source/D1 coverage drift"
            count += len(columns)
        assert count == 154, "20-sheet column count drift"

    source = GAS.read_text(encoding="utf-8")
    # Compare the *actual* GAS header list with this documented header order.
    start = source.index("  headers: {")
    end = source.index("  fees: {", start)
    region = source[start:end]
    non_sm_tabs = {"試合セッション", "試合版管理", "試合操作履歴", "閲覧リンク", "退会履歴"}
    for e in entries:
        name = e["source"]
        expected = e["headers"]
        # The GAS uses single-quoted sheet names / column labels.
        match = re.search(re.escape("'" + name + "'") + r"\s*:\s*\[([^\]]*)\]", region)
        if match:
            found = re.findall(r"'([^']*)'", match.group(1))
            assert found == expected, f"GAS header drift: {name}"
        else:
            assert name in non_sm_tabs, f"Unexpected GAS header absent: {name}"
        # Other five tabs are defined in separate legacy/match sections;
        # their physical header order was read from the staging sheet.
    memberships = next(e for e in entries if e["source"] == "チーム所属")
    assert memberships["kind"] == "state_with_duplicate_source_rows"
    assert memberships["logical_key"] == ["teamId", "memberId"]
    audit = next(e for e in entries if e["source"] == "操作履歴")
    assert audit["d1_columns"][-1] == "result_json"
    assert "rollup" not in str(manifest.get("auto_import_allowed", "")).lower()
    print("PASS: 20 source tabs, 154 mapped columns, D1 candidate schema coverage; no data read/import")

if __name__ == "__main__":
    check()
