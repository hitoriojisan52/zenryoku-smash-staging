#!/usr/bin/env python3
"""Pure offline no-go rules. This does NOT grant live copy/cutover approval."""

REQUIRED = (
    "native_source_backup_verified",
    "isolated_restore_drill_verified",
    "consistent_source_write_barrier_verified",
    "all_20_tabs_raw_type_and_formula_verified",
    "match_revision_hashes_verified",
    "archive_restore_and_audit_verified",
    "roles_ledger_cas_idempotence_verified",
    "shadow_comparison_verified",
    "user_approved_data_copy_and_cutover",
)


def evaluate(gates, *, match_hash_mismatches, prepared_archives):
    """Conservative result; no network, database, write, or permission changes."""
    if not isinstance(gates, dict):
        raise ValueError("invalid readiness record")
    if type(match_hash_mismatches) is not int or match_hash_mismatches < 0:
        raise ValueError("invalid match failure count")
    if type(prepared_archives) is not int or prepared_archives < 0:
        raise ValueError("invalid prepared count")
    outstanding = [x for x in REQUIRED if gates.get(x) is not True]
    if match_hash_mismatches:
        outstanding.append("BLOCK_MATCH_HASH")
    if prepared_archives:
        outstanding.append("BLOCK_PREPARED_ARCHIVE")
    # An all-green synthetic input is still only a review candidate, never
    # an executable flag for existing Worker/GAS/LIFF or a D1 write.
    return {"status": "BLOCKED" if outstanding else "CANDIDATE_ONLY",
            "unmet_gates": outstanding, "write_authorized": False,
            "cutover_authorized": False}
