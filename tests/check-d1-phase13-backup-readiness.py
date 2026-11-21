#!/usr/bin/env python3
"""Phase13 fabricated-only regression; NO real spreadsheet/DB read or write."""
from pathlib import Path
import copy
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "d1-staging" / "phase13"))
from backup_readiness_gate import evaluate, UnsafeInput, SCOPE


def evidence():
    # Anonymous counts copied from the human-reviewed Phase13 finding.
    # NO source IDs, revision IDs, member names, old SHA, or source JSON.
    return dict(
        copy_native=True,
        copy_separate_id=True,
        source_owner_only=True,
        folder_owner_only=True,
        copy_owner_only=True,
        copy_parent_verified=True,
        source_modification_unchanged=True,
        sheet_properties_match=True,
        source_and_copy_cells_equal=True,
        source_and_copy_formats_equal=True,
        sheet_count_source=21,
        sheet_count_copy=21,
        hidden_sheets=4,
        populated_cells_source=2641,
        populated_cells_copy=2641,
        field_mismatch_count=0,
        match_archives_total=5,
        match_archives_parsed=5,
        schedule_archives_total=3,
        schedule_archives_parsed=3,
        virtual_match_rows=81,
        virtual_guest_links=9,
        current_ready_revisions=8,
        current_sha_mismatches=8,
        archived_ready_revisions=38,
        archived_sha_mismatches=38,
    )


def run(e):
    return evaluate(scope=SCOPE, evidence=e)


def blocked(exception_code, *args, **kwargs):
    try:
        evaluate(*args, **kwargs)
    except UnsafeInput as exc:
        assert exc.code == exception_code, (exc.code, exception_code)
    else:
        raise AssertionError("unsafe input accepted")


def main():
    initial = evidence()
    original = copy.deepcopy(initial)
    res = run(initial)
    assert initial == original
    assert res["backup_verification"] == "COPY_VERIFIED"
    assert res["archive_reconstruction"] == "STRUCTURAL_ONLY"
    assert res["match_import"] == "BLOCKED"
    assert res["issue_codes"] == ["STORED_MATCH_SHA_MISMATCH"]
    assert res["counts"] == {
        "sheets": 21, "hidden_sheets": 4, "populated_cells": 2641,
        "match_archives_parsed": 5, "schedule_archives_parsed": 3,
        "virtually_reconstructed_match_rows": 81,
        "virtually_reconstructed_guest_links": 9,
        "current_ready_revisions": 8, "archived_ready_revisions": 38,
        "invalid_match_hashes": 46,
    }
    for key, value in res.items():
        if key.endswith("_authorized"):
            assert value is False, key

    cleaned = {**initial, "current_sha_mismatches": 0,
               "archived_sha_mismatches": 0}
    green = run(cleaned)
    assert green["backup_verification"] == "COPY_VERIFIED"
    assert green["match_import"] == "ADDITIONAL_PROVENANCE_AND_APPROVAL_REQUIRED"
    assert green["d1_business_import_authorized"] is False
    assert green["production_authorized"] is False

    for flag in (
        "folder_owner_only", "copy_owner_only", "copy_parent_verified",
        "source_owner_only", "copy_separate_id", "source_modification_unchanged",
        "source_and_copy_cells_equal", "source_and_copy_formats_equal",
    ):
        bad = {**initial, flag: False}
        check = run(bad)
        assert check["backup_verification"] == "BLOCKED", flag
        assert check["d1_business_import_authorized"] is False
        assert "STORED_MATCH_SHA_MISMATCH" in check["issue_codes"]

    for key, new_value in (
        ("sheet_count_copy", 20),
        ("populated_cells_copy", 2640),
        ("field_mismatch_count", 1),
        ("match_archives_parsed", 4),
        ("schedule_archives_parsed", 2),
        ("hidden_sheets", 22),
        ("current_sha_mismatches", 9),
        ("archived_sha_mismatches", 39),
    ):
        check = run({**initial, key: new_value})
        assert check["backup_verification"] == "BLOCKED", key
        assert not check["d1_business_import_authorized"]

    blocked("LIVE_INPUT_FORBIDDEN", scope="real_source", evidence=initial)
    blocked("UNEXPECTED_EVIDENCE_SHAPE", scope=SCOPE,
            evidence={**initial, "spreadsheetId": "NEVER-IN-ACTIONS"})
    blocked("BOOLEAN_REQUIRED", scope=SCOPE,
            evidence={**initial, "folder_owner_only": "yes"})
    blocked("NONNEGATIVE_INTEGER_REQUIRED", scope=SCOPE,
            evidence={**initial, "field_mismatch_count": -1})
    blocked("NONNEGATIVE_INTEGER_REQUIRED", scope=SCOPE,
            evidence={**initial, "sheet_count_source": True})
    print("PASS: fictional backup parity, 46-invalid-SHA fail closed, permissions and independent D1 authorization")


if __name__ == "__main__":
    main()
