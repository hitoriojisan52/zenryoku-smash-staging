#!/usr/bin/env python3
"""Phase9: artificial 21-tab source workbook, no live files/data/networks."""
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "d1-staging/phase9"))
from snapshot_guard import UnsafeSnapshot, digest, make_package, virtual_restore

CONTRACT = json.loads((ROOT / "d1-staging/phase8/source-column-contract.json")
                      .read_text(encoding="utf-8"))["sheets"]
ARCHIVES = {"日程削除アーカイブ", "参加者操作アーカイブ",
            "試合削除アーカイブ", "ビジター審査アーカイブ"}


def entry(col, key, value, fmt=None, effective=None):
    cell = {"column": col, "userEnteredValue": {key: value}}
    if fmt is not None:
        cell["userEnteredFormat"] = {"numberFormat": fmt}
    if effective is not None:
        cell["effectiveValue"] = effective
    return cell


def fictional_workbook():
    tabs = [{"title": "検証ガイド", "sheetId": 1001, "hidden": False,
             "grid": {"rowCount": 20, "columnCount": 26},
             "rows": [{"index": 1, "cells": [entry(1, "stringValue", "GUIDE")]}]}]
    for idx, src in enumerate(CONTRACT, start=2):
        head = [entry(i + 1, "stringValue", h)
                for i, h in enumerate(src["headers"])]
        tab = {"title": src["source"], "sheetId": 1000 + idx,
               "hidden": src["source"] in ARCHIVES,
               "grid": {"rowCount": 30, "columnCount": max(26, len(head))},
               "rows": [{"index": 1, "cells": head}]}
        if src["source"] == "練習日程":
            tab["rows"].append({"index": 3, "cells": [
                entry(1, "stringValue", "FICTION-P"),
                entry(2, "numberValue", 46348.0, {"type": "DATE",
                       "pattern": "yyyy-mm-dd"}),
                entry(4, "numberValue", 0.375, {"type": "TIME",
                       "pattern": "h:mm"}),
                entry(6, "formulaValue", "=3*2", effective={"numberValue": 6}),
                entry(7, "boolValue", False)]})
        if src["source"] == "チーム所属":
            tab["rows"].append({"index": 2, "cells": [
                entry(1, "stringValue", "FICTION-T"),
                entry(2, "stringValue", "FICTION-M"),
                entry(3, "boolValue", True)]})
            tab["rows"].append({"index": 5, "cells": [
                entry(1, "stringValue", "FICTION-T"),
                entry(2, "stringValue", "FICTION-M"),
                entry(3, "boolValue", False)]})
        if src["source"] == "操作履歴":
            tab["rows"].append({"index": 2, "cells": [
                entry(1, "stringValue", "FICTION-OP"),
                entry(4, "numberValue", 46348.5,
                      {"type": "DATE_TIME", "pattern": "yyyy-mm-dd hh:mm:ss"}),
                entry(6, "stringValue", '{"ok":true}') ]})
        if src["source"] == "試合版管理":
            tab["rows"].append({"index": 2, "cells": [
                entry(1, "stringValue", "FICTION-RV"),
                entry(4, "stringValue", '{"a":"🏸"}'),
                entry(8, "numberValue", 1), entry(9, "numberValue", 1)]})
        tabs.append(tab)
    return {"schema_version": 1, "scope": "fabricated_offline_only",
            "timezone": "Asia/Tokyo", "sheets": tabs}


def reject(pkg, token):
    try:
        virtual_restore(pkg, CONTRACT)
    except UnsafeSnapshot:
        return
    raise AssertionError("unsafe snapshot accepted: " + token)


def main():
    workbook = fictional_workbook()
    pack = make_package(workbook, CONTRACT)
    recovered = virtual_restore(pack, CONTRACT)
    assert recovered == workbook
    assert digest(recovered) == pack["digest"]
    assert recovered is not workbook
    assert recovered["sheets"] is not workbook["sheets"]

    # Mutating a returned reconstruction must never rewrite the stored package.
    recovered["sheets"][0]["hidden"] = True
    assert virtual_restore(pack, CONTRACT) == workbook

    tampered = copy.deepcopy(pack)
    practice = next(s for s in tampered["workbook"]["sheets"]
                    if s["title"] == "練習日程")
    practice["rows"][1]["cells"][1]["userEnteredValue"] = {
        "stringValue": "2026-11-22"}
    reject(tampered, "date numeric turned into text")

    tampered = copy.deepcopy(pack)
    practice = next(s for s in tampered["workbook"]["sheets"]
                    if s["title"] == "練習日程")
    practice["rows"][1]["cells"][3]["userEnteredValue"] = {
        "numberValue": 6}
    reject(tampered, "formula flattened into number")

    tampered = copy.deepcopy(pack)
    tampered["workbook"]["sheets"][0]["hidden"] = True
    reject(tampered, "hidden altered")

    tampered = copy.deepcopy(pack)
    tampered["workbook"]["timezone"] = "UTC"
    tampered["digest"] = digest(tampered["workbook"])
    reject(tampered, "timezone changed even with digest recalculation")

    tampered = copy.deepcopy(pack)
    tab = next(s for s in tampered["workbook"]["sheets"]
               if s["title"] == "チーム所属")
    tab["rows"][2]["index"] = 2
    tampered["digest"] = digest(tampered["workbook"])
    reject(tampered, "duplicate source row numbers")

    tampered = copy.deepcopy(pack)
    tab = next(s for s in tampered["workbook"]["sheets"]
               if s["title"] == "練習日程")
    tab["rows"][1]["cells"][4]["userEnteredValue"] = {"numberValue": True}
    tampered["digest"] = digest(tampered["workbook"])
    reject(tampered, "bool as numeric")

    tampered = copy.deepcopy(pack)
    tab = next(s for s in tampered["workbook"]["sheets"]
               if s["title"] == "練習日程")
    tab["rows"][0]["cells"][0]["userEnteredValue"]["stringValue"] = "wrong"
    tampered["digest"] = digest(tampered["workbook"])
    reject(tampered, "header drift")

    tampered = copy.deepcopy(pack)
    tampered["workbook"]["sheets"].pop()
    tampered["digest"] = digest(tampered["workbook"])
    reject(tampered, "missing business tab")

    tampered = copy.deepcopy(pack)
    tampered["digest"] = "a" * 64
    reject(tampered, "bad digest")

    tampered = copy.deepcopy(pack)
    tampered["workbook"]["scope"] = "real_data"
    tampered["digest"] = digest(tampered["workbook"])
    reject(tampered, "no real-data source support")

    assert len(CONTRACT) == 20
    assert sum(len(t["headers"]) for t in CONTRACT) == 154
    assert len(workbook["sheets"]) == 21
    print("PASS: fabricated 21-tab typed/format/formula/order/hidden virtual restore, checksum and fail-closed boundaries")


if __name__ == "__main__":
    main()
