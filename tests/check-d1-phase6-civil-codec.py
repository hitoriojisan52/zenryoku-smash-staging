#!/usr/bin/env python3
"""Offline, fabricated-cell-only regression of GAS-equivalent JST civil times.
No external network, secrets, Google Sheets access, or D1 writes.
"""
from datetime import date, timedelta
from decimal import Decimal
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
spec=spec_from_file_location("phase6_civil_codec",ROOT/"d1-staging/phase6/civil_codec.py")
assert spec and spec.loader
codec=module_from_spec(spec)
sys.modules[spec.name]=codec
spec.loader.exec_module(codec)
SHEETS_EPOCH=date(1899,12,30)
def day_serial(y,m,d):
    return Decimal((date(y,m,d)-SHEETS_EPOCH).days)
def project(raw,typ,fmt=None,zone="Asia/Tokyo"):
    return codec.project_cell(raw,typ,fmt,zone)
n=0
def check(test,message):
    global n
    assert test,message
    n+=1
def reject(raw,typ,fmt=None,zone="Asia/Tokyo"):
    global n
    try:
        project(raw,typ,fmt,zone)
    except codec.UnsafeCell:
        n+=1
        return
    raise AssertionError(f"Unsafe source unexpectedly accepted: {typ}/{fmt} (raw hidden)")
def reject_unique(rows):
    global n
    try:
        codec.assert_unique_canonical_dates(rows)
    except codec.UnsafeCell:
        n+=1
        return
    raise AssertionError("Duplicate source dates were not rejected")

d=day_serial(2026,11,21)
base=project(int(d),"date","DATE")
check(base.canonical=="2026-11-21","local date shifts to adjacent day")
check(base.source_type=="number" and base.source_text==str(d),"raw serial lost")
check(base.number_format=="DATE" and base.utc_instant is None,"raw metadata lost")
check(project("2026-11-21","date","TEXT").canonical==base.canonical,"mixed text and numeric")
check(project(" 2026-11-21 ","date","TEXT").source_text==" 2026-11-21 ","raw string was overwritten")
check(project(day_serial(2024,2,29),"date","DATE").canonical=="2024-02-29","leap day")
check(project(day_serial(2026,12,31),"date","DATE").canonical=="2026-12-31","year boundary")

for seconds,human in ((9*3600,"09:00"),(18*3600+30*60,"18:30"),(0,"00:00"),(23*3600+59*60,"23:59")):
    value=Decimal(seconds)/Decimal(86400)
    check(project(value,"time","TIME").canonical==human,"numeric time")
check(project("9:05","time","TEXT").canonical=="09:05","GAS H:mm normalization")
check(project("09:05","time","TEXT").canonical=="09:05","GAS HH:mm preservation")

def timestamp(day,seconds):
    return Decimal(day)+Decimal(seconds)/Decimal(86400)
stamp=project(timestamp(d,15*60+12),"datetime","DATE_TIME")
check(stamp.canonical=="2026-11-21 00:15:12","JST day boundary or seconds")
check(stamp.utc_instant=="2026-11-20T15:15:12Z","UTC day boundary")
stamp2=project(timestamp(d,23*3600+59*60+59),"datetime","DATE_TIME")
check(stamp2.canonical=="2026-11-21 23:59:59","end-of-day second")
check(stamp2.utc_instant=="2026-11-21T14:59:59Z","JST offset")
stamp3=project("2026-11-21 00:15:12","datetime","TEXT")
check(stamp3.canonical==stamp.canonical and stamp3.utc_instant==stamp.utc_instant,
      "typed-string audit timestamp differs from numeric")
check(project("2026-11-21 09:00:00","datetime",None).utc_instant=="2026-11-21T00:00:00Z",
      "9h JST offset not applied exactly once")

reject(d,"date","TEXT")          # numeric not declared DATE
reject(d,"date",None)
reject(d+Decimal("0.5"),"date","DATE")
reject(Decimal("0.375"),"datetime","TIME")
reject(Decimal("1.25"),"time","TIME")
reject(Decimal("0.3753472222222"),"time","TIME")  # meaningful seconds
reject(timestamp(d,15*60)+Decimal("0.3")/Decimal(86400),"datetime","DATE_TIME")
reject("2026/11/21","date","TEXT")    # GAS schedule validation rejects
reject("2026-02-29","date","TEXT")
reject("2026-11-21T00:00:00Z","datetime","TEXT")  # GAS audit regexp excludes
reject("2026-11-21 24:00:00","datetime","TEXT")
reject("25:30","time","TEXT")
reject(True,"date","DATE")
reject(None,"datetime","DATE_TIME")
reject(float("nan"),"date","DATE")
reject(float("inf"),"date","DATE")
reject(-1,"date","DATE")
reject(0,"date","DATE")
reject(int(d),"date","DATE","UTC")  # sheet timezone cannot be assumed
reject(Decimal("0.99999999999999"),"time","TIME") # no wrap to next day
reject(Decimal(999999999),"date","DATE")

codec.assert_unique_canonical_dates([("FICTION-1",base),
    ("FICTION-2",project("2026-11-22","date","TEXT"))])
check(True,"distinct schedule dates should pass")
reject_unique([("FICTION-1",base),
    ("FICTION-2",project("2026-11-21","date","TEXT"))])
reject_unique([("FICTION-1",base),("FICTION-1",base)])

# This is a candidate, not an implementation change to GAS: lock its real
# date functions and formats so their business semantics cannot be 'fixed'
# silently while we plan D1 conversion.
gas=(ROOT/"gas-staging/コード.gs").read_text("utf-8")
for contract in [
    "function today_(){return Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd');}",
    "function now_(){return Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd HH:mm:ss');}",
    "function ledgerDate_(s)",
    "Utilities.formatDate(s,'Asia/Tokyo','yyyy-MM-dd')",
    "function attendanceAuditTime_(raw)",
    "Utilities.formatDate(raw,'Asia/Tokyo','yyyy-MM-dd HH:mm:ss')",
    "function scheduleTime_(value)",
    "Utilities.formatDate(value,'Asia/Tokyo','HH:mm')",
    "var date=ledgerDate_(r[1]),version=",
    "seenDate[date]"
]:
    check(contract in gas,"GAS source contract changed; D1 projection requires review")
catalog=(ROOT/"d1-staging/phase5/route-catalog.json").read_text("utf-8")
check('"defaultRoute": "GAS_ONLY"' in catalog,
      "live API routing cut over before completion")

print(f"PASS {n} phase6 Google Sheets numeric/text civil-date/clock/audit JST cases; raw shape, duplicate and malformed values guarded; no live operations")
