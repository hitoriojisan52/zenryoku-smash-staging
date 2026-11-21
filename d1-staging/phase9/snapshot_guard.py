#!/usr/bin/env python3
"""D1 phase9: fabricated-only workbook snapshot/digest/virtual-restore contract.

NO Google, Cloudflare, filesystem backup, secrets, or external network I/O.
The artifact produced here is NOT a substitute for a protected native Sheets copy.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math

class UnsafeSnapshot(ValueError):
    pass


def require(condition, label):
    if not condition:
        raise UnsafeSnapshot(label)


def canonical(value):
    # Deliberately preserve input type, empty-vs-absent fields, cell positions,
    # user-entered formulas, number formats and source sheet order.
    try:
        return json.dumps(value, ensure_ascii=False, allow_nan=False,
                          sort_keys=True, separators=(",", ":")).encode("utf-8")
    except (TypeError, ValueError, UnicodeError) as exc:
        raise UnsafeSnapshot("nonportable JSON snapshot") from exc


def digest(workbook):
    return hashlib.sha256(canonical(workbook)).hexdigest()


def check_snapshot(workbook, source_columns):
    """Validate 21-tab synthetic source workbook without projecting data to D1."""
    require(isinstance(workbook, dict), "not object")
    require(workbook.get("schema_version") == 1, "snapshot version")
    require(workbook.get("scope") == "fabricated_offline_only", "approval boundary")
    require(workbook.get("timezone") == "Asia/Tokyo", "JST")
    require(isinstance(source_columns, list) and len(source_columns) == 20,
            "business contract")
    required = {x["source"]: x["headers"] for x in source_columns}
    require(len(required) == 20, "duplicate contract")
    sheets = workbook.get("sheets")
    require(isinstance(sheets, list) and len(sheets) == 21, "expected guide + 20")
    names = [s.get("title") for s in sheets if isinstance(s, dict)]
    require(len(names) == 21 and len(set(names)) == 21, "duplicate sheet title")
    require(names[0] == "検証ガイド" and set(names[1:]) == set(required), "tab inventory")
    sheet_ids = [s.get("sheetId") for s in sheets]
    require(all(type(x) is int for x in sheet_ids) and len(set(sheet_ids)) == 21,
            "unstable sheet IDs")
    for sheet in sheets:
        require(type(sheet.get("hidden")) is bool, "hidden flag lost")
        grid = sheet.get("grid")
        require(isinstance(grid, dict), "grid missing")
        nrows, ncols = grid.get("rowCount"), grid.get("columnCount")
        require(type(nrows) is int and nrows >= 1 and
                type(ncols) is int and ncols >= 1, "grid bounds")
        rows = sheet.get("rows")
        require(isinstance(rows, list), "missing rows")
        prior = 0
        for row in rows:
            require(isinstance(row, dict), "row shape")
            index = row.get("index")
            require(type(index) is int and prior < index <= nrows, "source row order")
            prior = index
            cells = row.get("cells")
            require(isinstance(cells, list), "cell list")
            previous_col = 0
            for cell in cells:
                require(isinstance(cell, dict), "cell shape")
                col = cell.get("column")
                require(type(col) is int and previous_col < col <= ncols,
                        "source column order")
                previous_col = col
                entered = cell.get("userEnteredValue")
                if entered is not None:
                    require(isinstance(entered, dict) and len(entered) == 1,
                            "raw typed value")
                    kind, value = next(iter(entered.items()))
                    if kind in ("stringValue", "formulaValue"):
                        require(isinstance(value, str), "raw text/formula")
                    elif kind == "boolValue":
                        require(type(value) is bool, "boolean not numeric")
                    elif kind == "numberValue":
                        require(type(value) in (int, float) and math.isfinite(value),
                                "numeric source")
                    else:
                        raise UnsafeSnapshot("unknown raw input type")
                if "userEnteredFormat" in cell:
                    require(isinstance(cell["userEnteredFormat"], dict),
                            "source format")
                if "effectiveValue" in cell:
                    require(isinstance(cell["effectiveValue"], dict),
                            "effective value")
        if sheet["title"] in required:
            cols = required[sheet["title"]]
            require(ncols >= len(cols), "missing source columns")
            require(rows and rows[0]["index"] == 1, "missing header row")
            head = {x["column"]: x.get("userEnteredValue")
                    for x in rows[0]["cells"]}
            require(all(head.get(i + 1) == {"stringValue": col}
                        for i, col in enumerate(cols)), "header drift")
    canonical(workbook)
    return True


def make_package(workbook, source_columns):
    check_snapshot(workbook, source_columns)
    frozen = copy.deepcopy(workbook)
    return {"format": "fictional-d1-phase9-v1", "digest": digest(frozen),
            "workbook": frozen}


def virtual_restore(package, source_columns):
    require(isinstance(package, dict) and
            package.get("format") == "fictional-d1-phase9-v1",
            "unapproved package")
    require(isinstance(package.get("digest"), str) and
            len(package["digest"]) == 64, "digest missing")
    workbook = package.get("workbook")
    require(package["digest"] == digest(workbook), "snapshot checksum mismatch")
    check_snapshot(workbook, source_columns)
    # This is an in-memory reconstruction, NEVER a Google Sheet or D1 write.
    return copy.deepcopy(workbook)
