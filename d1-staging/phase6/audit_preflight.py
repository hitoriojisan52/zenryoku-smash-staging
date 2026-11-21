"""Offline preflight candidate for operation audit migration.

Run only on fabricated rows before an approved real export. Never expose
actor IDs, operation payloads, or original resultJSON in logs or GitHub.
"""
from __future__ import annotations

from dataclasses import dataclass
import json

from civil_codec import UnsafeCell, project_cell


@dataclass(frozen=True)
class OperationAuditProjection:
    operation_id: str
    operation: str
    actor_member_id: str
    timestamp_raw: str       # Existing GAS/JST yyyy-MM-dd HH:mm:ss
    timestamp_source: str    # Original Sheets API effectiveValue text
    timestamp_format: str | None
    target_id: str
    result_json: str         # Original JSON text; no re-serialization


def preflight_operation_audit(
    rows: list[dict[str, object]],
    spreadsheet_timezone: str,
) -> list[OperationAuditProjection]:
    """Return projections in original physical row order; no writes.

    Reject duplicate/missing operation IDs, invalid timestamp/JSON and
    ambiguous input cells. A withdrawn actor is valid historical evidence,
    not an orphan to delete: no FK to the current members table.
    """
    seen: set[str] = set()
    output: list[OperationAuditProjection] = []
    for row in rows:
        op_id = row.get("operation_id")
        operation = row.get("operation")
        actor = row.get("actor_member_id")
        target = row.get("target_id")
        result = row.get("result_json")
        if any(not isinstance(v, str) or not v for v in
               (op_id, operation, actor, result)):
            raise UnsafeCell("Required operation audit field absent")
        if op_id in seen:
            raise UnsafeCell("Duplicate operation ID")
        seen.add(op_id)
        if target is not None and not isinstance(target, str):
            raise UnsafeCell("Invalid target ID type")
        try:
            payload = json.loads(result)
        except (ValueError, TypeError) as exc:
            raise UnsafeCell("Invalid original operation result JSON") from exc
        if not isinstance(payload, dict):
            raise UnsafeCell("Operation result must be a JSON object")

        clock = project_cell(row.get("timestamp_value"), "datetime",
                             row.get("timestamp_format"), spreadsheet_timezone)
        output.append(OperationAuditProjection(
            operation_id=op_id,
            operation=operation,
            actor_member_id=actor,
            timestamp_raw=clock.canonical,
            timestamp_source=clock.source_text,
            timestamp_format=clock.number_format,
            target_id=target or "",
            result_json=result,
        ))
    return output


def attendance_audit_window(
    records: list[OperationAuditProjection],
) -> dict[str, tuple[str, str]]:
    """GAS attendanceAuditDates_ first and last: lexical JST timestamps."""
    result: dict[str, tuple[str, str]] = {}
    for rec in records:
        if rec.operation != "attendance.submit" or not rec.target_id:
            continue
        if rec.target_id in result:
            first, last = result[rec.target_id]
            result[rec.target_id] = (min(first, rec.timestamp_raw),
                                     max(last, rec.timestamp_raw))
        else:
            result[rec.target_id] = (rec.timestamp_raw, rec.timestamp_raw)
    return result
