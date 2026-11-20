#!/usr/bin/env python3
"""Synthetic-only test for a real schema blocker discovered by READ-ONLY audit.
No Google Sheets or Cloudflare API calls. Does not migrate/alter any records.
"""
from pathlib import Path
import sqlite3

root=Path(__file__).resolve().parents[1]
db=sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
for p in sorted((root/"d1-staging/migrations").glob("*.sql")):
    db.executescript(p.read_text("utf-8"))
schema=db.execute("PRAGMA table_info(team_memberships)").fetchall()
pk={row[1]:row[5] for row in schema if row[5]>0}
assert pk=={"team_id":1,"member_id":2}, "D1 source schema changed; re-evaluate migration safety"

# This is fabricated, not copied from the real workbook: three sheet rows with
# the SAME team/member key, two inactive and one active.
fictional=[("T-FICTION","M-FICTION",0),
           ("T-FICTION","M-FICTION",0),
           ("T-FICTION","M-FICTION",1)]
def legacy_duty(memberships,member_id,enabled_teams):
    return any(row[1]==member_id and row[2] and row[0] in enabled_teams
               for row in memberships)
assert legacy_duty(fictional,"M-FICTION",{"T-FICTION"}) is True
assert legacy_duty(fictional,"M-FICTION",set()) is False
assert legacy_duty(fictional[:2],"M-FICTION",{"T-FICTION"}) is False

# Existing D1 composite primary key CANNOT represent all 3 rows. Its rejection
# is an expected fail-closed barrier, not a migration test failure.
db.execute("""INSERT INTO members
(member_id,display_name,line_user_id,active,is_admin)
VALUES('M-FICTION','Synthetic','U-FICTION',1,0)""")
db.execute("""INSERT INTO duty_teams(team_id,team_name,active)
VALUES('T-FICTION','Synthetic',1)""")
db.execute("""INSERT INTO team_memberships(team_id,member_id,active)
VALUES('T-FICTION','M-FICTION',0)""")
try:
    db.execute("""INSERT INTO team_memberships(team_id,member_id,active)
        VALUES('T-FICTION','M-FICTION',1)""")
    raise AssertionError("D1 unexpectedly accepted duplicate sheet membership key")
except sqlite3.IntegrityError:
    pass
assert db.execute("SELECT COUNT(*) FROM team_memberships").fetchone()[0]==1

gas=(root/"gas-staging"/"コード.gs").read_text("utf-8")
assert "memberships.some(function(r)" in gas
assert "enabledTeams.indexOf(str_(r[0]))!==-1" in gas
# Do not silently approve changing D1 table from historical-row preserving
# append-only semantics to lossy current-role-only aggregation.
route_catalog=(root/"d1-staging/phase5/route-catalog.json").read_text("utf-8")
assert '"defaultRoute": "GAS_ONLY"' in route_catalog
print("PASS: legacy any-active role retained in synthetic fixture; duplicate team/member PK blocks lossless D1 import; no data changed")
