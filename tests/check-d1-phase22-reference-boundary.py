#!/usr/bin/env python3
"""Phase22: entirely fictitious in-memory SQLite, no Google/Cloudflare access."""
from pathlib import Path
import sqlite3
ROOT=Path(__file__).resolve().parents[1]
sql=(ROOT/'d1-staging/analysis/phase22-reference-boundary-offline.sql').read_text()
assert 'PRAGMA foreign_keys=ON' in sql
assert 'ATTACH DATABASE' not in sql
assert 'CREATE VIEW synthetic_active_ledger_only' in sql
assert 'DELETE FROM' not in sql and 'DROP TABLE' not in sql

db=sqlite3.connect(':memory:')
db.executescript(sql)
def calc(rows):
    weights={'opening':0,'practice':1,'reimbursement':2,'other':3}
    data=sorted(rows,key=lambda r:(r[1],weights[r[2]],r[0]))
    assert sum(1 for r in data if r[2]=='opening')==1
    balance=None
    for r in data:
        if r[2]=='opening':
            assert balance is None
            balance=r[5]
        else:
            assert balance is not None
            balance+=r[3]-r[4]
            assert balance==r[5]
    return balance

# Invented dates/amounts, deliberately unrelated to either user's ledger.
canonical=[
 ('c-opening','2026-08-01','opening',0,0,2500,'confirmed','canonical-13-only'),
 ('c-practice','2026-08-09','practice',400,0,2900,'confirmed','canonical-13-only'),
 ('c-expense','2026-08-10','reimbursement',0,950,1950,'open','canonical-13-only')
]
reference=[
 ('old-opening','2026-07-01','older opening','legacy-3-reference-only'),
 ('old-expense','2026-07-11','older expense','legacy-3-reference-only'),
 ('old-practice','2026-07-11','older practice','legacy-3-reference-only')
]
with db:
    db.executemany('INSERT INTO synthetic_canonical_ledger VALUES (?,?,?,?,?,?,?,?)',canonical)
    db.executemany('INSERT INTO synthetic_legacy_reference_ledger VALUES (?,?,?,?)',reference)
read_active=lambda:db.execute('SELECT * FROM synthetic_active_ledger_only ORDER BY event_date,fixture_row_id').fetchall()
read_all=lambda:db.execute('SELECT * FROM synthetic_canonical_ledger ORDER BY fixture_row_id').fetchall()
read_ref=lambda:db.execute('SELECT * FROM synthetic_legacy_reference_ledger ORDER BY fixture_ref_id').fetchall()
baseline=read_all();old=read_ref()
assert len(read_active())==3 and len(old)==3
balance=calc(baseline)
assert balance==1950
assert sum(1 for r in baseline if r[6]=='confirmed')==2
assert all(r[1]<canonical[0][1] for r in old)

# The CHECK and a separate view prohibit old records from becoming live.
try:
    with db:
        db.execute('INSERT INTO synthetic_canonical_ledger VALUES (?,?,?,?,?,?,?,?)',
                   ('old-leak','2026-07-11','other',100,0,100,'open','legacy-3-reference-only'))
except sqlite3.IntegrityError:pass
else:raise AssertionError('REFERENCE_SILENTLY_BECAME_ACTIVE')

# Old record retention is immutable until a separate user archive decision.
try:
    with db:
        db.execute('DELETE FROM synthetic_legacy_reference_ledger WHERE fixture_ref_id=?',('old-expense',))
except sqlite3.IntegrityError:pass
else:raise AssertionError('UNAPPROVED_LEGACY_REFERENCE_DELETE')
try:
    with db:
        db.execute("UPDATE synthetic_legacy_reference_ledger SET marker='changed' WHERE fixture_ref_id=?",('old-practice',))
except sqlite3.IntegrityError:pass
else:raise AssertionError('UNAPPROVED_LEGACY_REFERENCE_MUTATION')

# Canonical original confirmed rows retain their exact recorded balances.
assert read_all()==baseline
assert read_ref()==old
assert calc(read_all())==balance
assert db.execute("PRAGMA integrity_check").fetchone()==('ok',)
assert db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()==(2,)
db.close()
print("PHASE22_CANONICAL_LEDGER_OFFLINE_PASS: invented 13-tab active ledger only, 3-tab reference immutable, no double count, opening and confirmed balances unchanged, legacy dates disjoint")
