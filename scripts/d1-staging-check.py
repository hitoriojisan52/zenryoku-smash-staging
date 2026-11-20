#!/usr/bin/env python3
"""Offline-only SQLite/schema guard for the isolated D1 bootstrap."""
from pathlib import Path
import re
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "d1-staging" / "migrations"
FILES = sorted(MIGRATIONS.glob("*.sql"))
assert FILES, "Missing D1 migrations"
assert FILES[0].name == "0001_bootstrap_probe.sql"
assert len(FILES) == len({f.name.split("_")[0] for f in FILES}), "Duplicate migration number"
assert all(re.fullmatch(r"\d{4}_[a-z0-9_]+\.sql", f.name) for f in FILES)
conn = sqlite3.connect(":memory:")
for item in FILES:
    sql = item.read_text(encoding="utf-8")
    assert re.search(r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS", sql, re.I), f"Non-additive migration: {item}"
    # Conservative initial policy. Later schema changes require a documented review.
    without_comments = re.sub(r"--[^\n]*", "", sql)
    assert not re.search(r"\b(?:DROP|DELETE|UPDATE|REPLACE|ATTACH|DETACH|VACUUM|ALTER|TRUNCATE)\b", without_comments, re.I), item
    conn.executescript(sql)
    # Exercise an idempotent re-application in an isolated local DB.
    conn.executescript(sql)
columns = [row[1] for row in conn.execute("PRAGMA table_info(stage_d1_bootstrap)")]
assert columns == ["probe_key", "created_at"], columns
assert conn.execute("SELECT COUNT(*) FROM stage_d1_bootstrap").fetchone()[0] == 0
assert "d1_databases" not in (ROOT / "cloudflare-worker" / "wrangler.toml").read_text(), "Existing Worker binding changed outside migration review"
assert "zenryoku-smash-staging-api" in (ROOT / "cloudflare-worker" / "wrangler.toml").read_text()
workflow = (ROOT / ".github" / "workflows" / "d1-staging-migrate.yml").read_text()
assert "refs/heads/main" in workflow and "--remote" in workflow
assert "environment: d1-staging" in workflow
assert "D1_STAGE_DATABASE_ID" in workflow
print("D1 offline schema, additive migrations and existing Worker isolation PASS")
