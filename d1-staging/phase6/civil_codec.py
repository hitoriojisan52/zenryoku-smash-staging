"""D1 stage phase 6: strictly typed, read-only Google Sheet civil date conversion.

This is an OFFLINE candidate for migrating *fictional* Sheets values; it must
never run on production records or write D1 without a separate approved import.
Sheet numeric serials are local civil date/time values (epoch 1899-12-30), NOT
Unix timestamps and NOT UTC instants. The spreadsheet's timezone is required
to be Asia/Tokyo; another timezone must fail closed.

Retain the original source workbook and its raw CellData separately: a
canonical date/time projection alone is NOT a lossless workbook backup.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re

SHEETS_EPOCH = date(1899, 12, 30)
JST = timezone(timedelta(hours=9))
FORMATS = {"date": "DATE", "time": "TIME", "datetime": "DATE_TIME"}
DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}\Z")
TIME_PATTERN = re.compile(r"(?:[01]?\d|2[0-3]):[0-5]\d\Z")
DATETIME_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\Z")
TOLERANCE_SECONDS = Decimal("0.05")  # reject meaningful sub-second value
SECONDS_PER_DAY = Decimal(86400)


class UnsafeCell(ValueError):
    """Source cell is ambiguous or would be silently changed by projection."""


@dataclass(frozen=True)
class CivilProjection:
    semantic: str
    canonical: str
    source_type: str
    source_text: str
    number_format: str | None
    utc_instant: str | None = None


def _decimal_number(value: int | float | Decimal) -> Decimal:
    if isinstance(value, bool):
        raise UnsafeCell("Boolean is not a date serial")
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise UnsafeCell("Invalid numeric serial") from exc
    if not number.is_finite() or number < 0:
        raise UnsafeCell("Nonfinite or negative serial")
    return number


def _serial_day(integer_part: int) -> date:
    try:
        day = SHEETS_EPOCH + timedelta(days=integer_part)
    except (OverflowError, ValueError) as exc:
        raise UnsafeCell("Date serial out of range") from exc
    if day.year < 1900:
        raise UnsafeCell("Pre-1900 date must be investigated, not guessed")
    return day


def _nearest_unit(value: Decimal, unit_seconds: int) -> int:
    # Sheets may store a nominal whole second/minute with binary floating
    # noise. Round only when the original serial is within 50ms of that unit.
    seconds = value * SECONDS_PER_DAY
    units = int((seconds / unit_seconds).to_integral_value(rounding=ROUND_HALF_UP))
    if abs(seconds - Decimal(units * unit_seconds)) > TOLERANCE_SECONDS:
        raise UnsafeCell("Subsecond or off-minute time loses information")
    return units


def _canonical_numeric(number: Decimal, semantic: str) -> tuple[str, str | None]:
    if semantic == "time":
        if number >= 1:
            raise UnsafeCell("Time-only serial must be within one day")
        minute = _nearest_unit(number, 60)
        if not 0 <= minute < 1440:
            raise UnsafeCell("Time rounded across midnight")
        return f"{minute // 60:02d}:{minute % 60:02d}", None

    days = int(number)
    fraction = number - Decimal(days)
    day = _serial_day(days)
    if semantic == "date":
        if fraction * SECONDS_PER_DAY > TOLERANCE_SECONDS:
            raise UnsafeCell("DATE column has a non-midnight time")
        return day.isoformat(), None

    if semantic == "datetime":
        second = _nearest_unit(fraction, 1)
        if not 0 <= second < 86400:
            raise UnsafeCell("Datetime rounded into another day")
        civil = datetime.combine(day, time(0, 0), tzinfo=JST) + timedelta(seconds=second)
        stamp = civil.strftime("%Y-%m-%d %H:%M:%S")
        instant = civil.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        return stamp, instant
    raise UnsafeCell("Unknown semantic type")


def _canonical_string(value: str, semantic: str) -> tuple[str, str | None]:
    s = value.strip()  # mirrors GAS str_() without inferring formats
    try:
        if semantic == "date":
            if not DATE_PATTERN.fullmatch(s):
                raise UnsafeCell("Unrecognized text date")
            return date.fromisoformat(s).isoformat(), None
        if semantic == "time":
            if not TIME_PATTERN.fullmatch(s):
                raise UnsafeCell("Unrecognized text time")
            hh, mm = map(int, s.split(":"))
            return f"{hh:02d}:{mm:02d}", None
        if semantic == "datetime":
            if not DATETIME_PATTERN.fullmatch(s):
                raise UnsafeCell("Unrecognized text datetime")
            parsed = datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
            aware = parsed.replace(tzinfo=JST)
            utc = aware.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            return aware.strftime("%Y-%m-%d %H:%M:%S"), utc
    except ValueError as exc:
        raise UnsafeCell("Impossible date or time in source text") from exc
    raise UnsafeCell("Unknown semantic type")


def project_cell(value: object, semantic: str, number_format: str | None,
                 spreadsheet_timezone: str) -> CivilProjection:
    """Convert one Sheets API effectiveValue with a declared business type.

    Callers MUST provide effectiveValue.numberValue or .stringValue plus
    effectiveFormat.numberFormat.type; all original sheet cells are immutable.
    """
    if spreadsheet_timezone != "Asia/Tokyo":
        raise UnsafeCell("Unexpected spreadsheet timezone")
    if semantic not in FORMATS:
        raise UnsafeCell("Unexpected semantic")
    if value is None or isinstance(value, bool):
        raise UnsafeCell("Empty/Boolean is not an unambiguous date-time")
    if isinstance(value, (int, float, Decimal)):
        if number_format != FORMATS[semantic]:
            raise UnsafeCell("Numeric cell is not formatted for its semantic")
        number = _decimal_number(value)
        canonical, utc_instant = _canonical_numeric(number, semantic)
        return CivilProjection(semantic, canonical, "number", str(value),
                               number_format, utc_instant)
    if isinstance(value, str):
        canonical, utc_instant = _canonical_string(value, semantic)
        return CivilProjection(semantic, canonical, "string", value,
                               number_format, utc_instant)
    raise UnsafeCell("Unsupported source cell type")


def assert_unique_canonical_dates(rows: list[tuple[str, CivilProjection]]) -> None:
    """Fail closed across the *entire* practice sheet, not only future dates."""
    seen: set[str] = set()
    for label, projected in rows:
        if projected.semantic != "date":
            raise UnsafeCell("Non-date practice row")
        if projected.canonical in seen:
            raise UnsafeCell("Duplicate normalized schedule date")
        seen.add(projected.canonical)
