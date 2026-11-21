"""D1 Phase13 -- offline-only boundary between an intact copy and safe import.

All arguments must be fabricated control metadata (counts, booleans), never
real cell values, user IDs, spreadsheet IDs, SHA strings or archive JSON.
There is no network, filesystem, database, or Cloudflare integration here.
"""
from __future__ import annotations

SCOPE = "fabricated_offline_only"
CHECKS = (
    "copy_native", "copy_separate_id", "source_owner_only",
    "folder_owner_only", "copy_owner_only", "copy_parent_verified",
    "source_modification_unchanged", "sheet_properties_match",
    "source_and_copy_cells_equal", "source_and_copy_formats_equal",
)
COUNTS = ("sheet_count_source", "sheet_count_copy", "hidden_sheets",
          "populated_cells_source", "populated_cells_copy",
          "field_mismatch_count", "match_archives_total",
          "match_archives_parsed", "schedule_archives_total",
          "schedule_archives_parsed", "virtual_match_rows",
          "virtual_guest_links", "current_ready_revisions",
          "current_sha_mismatches", "archived_ready_revisions",
          "archived_sha_mismatches")


class UnsafeInput(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def evaluate(*, scope: str, evidence: dict) -> dict:
    if scope != SCOPE:
        raise UnsafeInput("LIVE_INPUT_FORBIDDEN")
    if not isinstance(evidence, dict) or set(evidence) != set(CHECKS) | set(COUNTS):
        raise UnsafeInput("UNEXPECTED_EVIDENCE_SHAPE")
    for name in CHECKS:
        if type(evidence[name]) is not bool:
            raise UnsafeInput("BOOLEAN_REQUIRED")
    for name in COUNTS:
        if type(evidence[name]) is not int or evidence[name] < 0:
            raise UnsafeInput("NONNEGATIVE_INTEGER_REQUIRED")
    issues = []
    for name in CHECKS:
        if not evidence[name]:
            issues.append("EVIDENCE_" + name.upper() + "_FAILED")
    if evidence["sheet_count_source"] != evidence["sheet_count_copy"] or not evidence["sheet_count_source"]:
        issues.append("SHEET_COUNTS_DIFFER")
    if not 0 <= evidence["hidden_sheets"] <= evidence["sheet_count_source"]:
        issues.append("HIDDEN_TAB_COUNT_INVALID")
    if evidence["populated_cells_source"] != evidence["populated_cells_copy"]:
        issues.append("POPULATED_COUNTS_DIFFER")
    if evidence["field_mismatch_count"] != 0:
        issues.append("CELL_MISMATCHES_REMAIN")
    if evidence["match_archives_total"] != evidence["match_archives_parsed"]:
        issues.append("MATCH_ARCHIVE_NOT_RECONSTRUCTED")
    if evidence["schedule_archives_total"] != evidence["schedule_archives_parsed"]:
        issues.append("SCHEDULE_ARCHIVE_NOT_RECONSTRUCTED")
    if evidence["current_sha_mismatches"] > evidence["current_ready_revisions"] or evidence["archived_sha_mismatches"] > evidence["archived_ready_revisions"]:
        issues.append("IMPOSSIBLE_SHA_COUNTS")
    if evidence["current_sha_mismatches"] + evidence["archived_sha_mismatches"] != 0:
        issues.append("STORED_MATCH_SHA_MISMATCH")

    copy_proof_issues = [x for x in issues if x != "STORED_MATCH_SHA_MISMATCH"]
    copy_verified = not copy_proof_issues
    return {
        "backup_verification": "COPY_VERIFIED" if copy_verified else "BLOCKED",
        "archive_reconstruction": (
            "STRUCTURAL_ONLY" if copy_verified else "UNVERIFIED"
        ),
        "match_import": (
            "BLOCKED" if issues else "ADDITIONAL_PROVENANCE_AND_APPROVAL_REQUIRED"
        ),
        "issue_codes": sorted(issues),
        "issue_count": len(issues),
        "counts": {
            "sheets": evidence["sheet_count_source"],
            "hidden_sheets": evidence["hidden_sheets"],
            "populated_cells": evidence["populated_cells_source"],
            "match_archives_parsed": evidence["match_archives_parsed"],
            "schedule_archives_parsed": evidence["schedule_archives_parsed"],
            "virtually_reconstructed_match_rows": evidence["virtual_match_rows"],
            "virtually_reconstructed_guest_links": evidence["virtual_guest_links"],
            "current_ready_revisions": evidence["current_ready_revisions"],
            "archived_ready_revisions": evidence["archived_ready_revisions"],
            "invalid_match_hashes": (
                evidence["current_sha_mismatches"] +
                evidence["archived_sha_mismatches"]
            ),
        },
        # A backup is NOT provenance validation; no API/Data/Secret mutation.
        "source_repair_authorized": False,
        "source_write_authorized": False,
        "d1_business_import_authorized": False,
        "remote_synthetic_test_authorized": False,
        "read_shadow_authorized": False,
        "cutover_authorized": False,
        "production_authorized": False,
    }
