#!/usr/bin/env python3
"""Phase20 exact isolated Worker SQL against strictly in-memory SQLite."""
import hashlib, json, sqlite3, subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
url=(ROOT/"d1-staging/native-fixture/legacy-match20.mjs").as_uri()
out=subprocess.run(["node","--input-type=module","-e",
    "import {MATCH20_SQL} from "+json.dumps(url)+";console.log(JSON.stringify(MATCH20_SQL))"],
    cwd=ROOT,text=True,capture_output=True,check=True,timeout=12).stdout
S=json.loads(out)
assert len(S)==22,len(S)
for k,v in S.items():
    assert "z_native_fixture_match20_" in v,(k,v)
    assert not any(w in v.upper() for w in ("DROP TABLE","ATTACH DATABASE","REPLACE INTO"))
    if k.endswith("DDL"): assert v.startswith("CREATE TABLE IF NOT EXISTS ")
    if v.startswith(("INSERT","UPDATE","DELETE")):
        assert not any(w in v for w in ["ledger_rows","match_sessions","match_revision_chunks","operation_audit","members"])

db=sqlite3.connect(":memory:")
for name in ["sessionDDL","revisionDDL","auditDDL","linkDDL","archiveDDL"]:db.execute(S[name])
db.commit()
fid="phase20-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-match"
fid2="phase20-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-match"
r1="11111111-1111-4111-8111-111111111111"
r2="22222222-2222-4222-8222-222222222222"
op1="33333333-3333-4333-8333-333333333333"
op2="44444444-4444-4444-8444-444444444444"
deleteop="55555555-5555-4555-8555-555555555555"
sha=lambda x:hashlib.sha256(x.encode("utf8")).hexdigest()
def insert_fake(f):
    with db:
        db.execute(S["seedSession"],(f,r2))
        text1=json.dumps({"generatedOnly":True,"schema":1,"rounds":[]},ensure_ascii=False)
        text2=json.dumps({"generatedOnly":True,"schema":1,"rounds":["🏸"],"pad":"x"*30100},ensure_ascii=False)
        a,b=text2[:29999],text2[29999:]
        assert len(a)==29999 and a+b==text2
        for rev,parts,op,start in ((r1,[text1],op1,2),(r2,[a,b],op2,3)):
            t=text1 if rev==r1 else text2
            for i,ch in enumerate(parts,1):
                db.execute(S["seedRevision"],(rev,f,ch,sha(t),op,i,len(parts),start+i-1))
        db.execute(S["seedAudit"],(op1,f,1,r1,2))
        db.execute(S["seedAudit"],(op2,f,1,r2,3))
        for i in range(3):
            db.execute(S["seedLink"],(f"token-{f[-6:]}-{i}",f,"" if i<2 else "2026/11/20",i+2))
insert_fake(fid)
def rows(k,f):
    return db.execute(S[k],(f,)).fetchall()
def state(f):
    return db.execute(S["stats"],(f,)*6).fetchone()
assert state(fid)==(1,3,2,2,1,0)
sess=rows("session",fid)[0]
rev=rows("revisions",fid)
audit=rows("audits",fid)
links=rows("links",fid)
assert len(rev)==3 and len(audit)==2 and len(links)==3
def records(raw,positions):
    return [{"rowNumber":pos,"cells":list(x)} for x,pos in zip(raw,positions)]
# Matches JS transformation of SQL result and GAS archival layout (anonymous values).
srows=records([(sess[0],sess[1],sess[2],sess[3],"2026/11/21 12:00:00")],[sess[4]])
rrows=records([(x[0],x[1],x[2],x[3],x[4],x[5],"2026/11/21 12:00:00",x[6],x[7]) for x in rev],[x[8] for x in rev])
arows=records([x[:7] for x in audit],[x[7] for x in audit])
active_links=[x for x in links if x[3]==""]
lrows=records([x[:6] for x in active_links],[x[6] for x in active_links])
snapshot={"schema":1,"practiceId":fid,"sessionVersion":1,"settingsVersion":1,
    "targets":{"試合セッション":srows,"試合版管理":rrows,"試合操作履歴":arows},"links":lrows}
serialized=json.dumps(snapshot,ensure_ascii=False,separators=(",",":"))
chunks=[serialized[i:i+12000] for i in range(0,len(serialized),12000)]
assert len(chunks)>=3
assert sha(''.join(chunks))==sha(serialized)
digest=sha(serialized)
def transactional(fault=False,op=deleteop,target=fid):
    instructions=[(S["archiveSeed"],(op,target,1,len(chunks),chunks[0],digest,
        target,r2,target,3,target,2,target,2))]
    instructions += [(S["archiveNext"],(op,target,i+1,len(chunks),ch,digest))
                     for i,ch in enumerate(chunks) if i]
    instructions += [(S["revoke"],(target,)),(S["deleteRevisions"],(target,)),
        (S["deleteAudits"],(target,)),(S["deleteSession"],(target,))]
    if fault: instructions.append((S["fault"],(op,target,digest)))
    db.execute("BEGIN IMMEDIATE")
    try:
        changes=[db.execute(sql,args).rowcount for sql,args in instructions]
        db.commit()
        return changes
    except BaseException:
        db.rollback()
        raise
try:
    transactional(fault=True)
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("FAULT_DID_NOT_ROLL_BACK")
assert state(fid)==(1,3,2,2,1,0),"PARTIAL_DELETE_ESCAPED_AUDIT_FAILURE"
assert rows("archiveRows",deleteop)==[],"ARCHIVE_LINGERED_AFTER_FAILED_DELETE"
assert transactional()==[1]*len(chunks)+[2,3,2,1]
assert state(fid)==(0,0,0,0,3,len(chunks))
archive=rows("archiveRows",deleteop)
assert len(archive)==len(chunks)
assert archive[0][7]=="completed"
assert all(x[7]=="" for x in archive[1:])
assert sha("".join(x[5] for x in archive))==digest
got=json.loads("".join(x[5] for x in archive))
assert got==snapshot,"SNAPSHOT_LOST_LEGACY_TARGETS_LINKS"
assert [len(got["targets"][x]) for x in ("試合セッション","試合版管理","試合操作履歴")]==[1,3,2]
assert len(got["links"])==2
assert all(len(x["cells"])==9 for x in got["targets"]["試合版管理"])
assert all(len(x["cells"])==7 for x in got["targets"]["試合操作履歴"])
assert all(len(x["cells"])==5 for x in got["targets"]["試合セッション"])
assert all(len(x["cells"])==6 for x in got["links"])
assert all(int(x[0])>0 for x in db.execute("SELECT source_order FROM z_native_fixture_match20_link"))
# A second delete must fail the archive precondition, not rewrite old snapshot.
try:
    transactional(op="66666666-6666-4666-8666-666666666666")
except sqlite3.IntegrityError:pass
else:raise AssertionError("SECOND_DELETE_NOT_BLOCKED")
assert state(fid)==(0,0,0,0,3,len(chunks))
insert_fake(fid2)
# Cross-target operationId collision must not steal the first target's archive.
try:
    transactional(op=deleteop,target=fid2)
except sqlite3.IntegrityError:pass
else:raise AssertionError("REUSED_OPERATION_ID_DIFFERENT_TARGET")
assert state(fid2)==(1,3,2,2,1,0)
assert db.execute("PRAGMA integrity_check").fetchone()==("ok",)
print("PHASE20_LEGACY_PHYSICAL_SQL_PASS: exact Worker D1 SQL archive full row/cells, revoke 2 links, physically delete session/chunks/audit, final fault atomic rollback, replay/cross-target isolation, archive immutability")
