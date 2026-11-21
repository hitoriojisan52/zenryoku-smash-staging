#!/usr/bin/env python3
"""Invented flag states only; no real data, remote D1, or privileged settings."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "d1-staging/phase9"))
from readiness_gate import evaluate, REQUIRED

def main():
    unknown = {}
    blocked = evaluate(unknown, match_hash_mismatches=8, prepared_archives=0)
    assert blocked["status"] == "BLOCKED" and "BLOCK_MATCH_HASH" in blocked["unmet_gates"]
    assert len(blocked["unmet_gates"]) == len(REQUIRED) + 1
    assert not blocked["write_authorized"] and not blocked["cutover_authorized"]
    all_verified = {name: True for name in REQUIRED}
    for name in REQUIRED:
        gates = dict(all_verified)
        gates[name] = False
        result = evaluate(gates, match_hash_mismatches=0, prepared_archives=0)
        assert result["status"] == "BLOCKED" and name in result["unmet_gates"]
    for changes in [(1, 0), (0, 1), (1, 1)]:
        result = evaluate(all_verified, match_hash_mismatches=changes[0],
                          prepared_archives=changes[1])
        assert result["status"] == "BLOCKED"
    candidate = evaluate(all_verified, match_hash_mismatches=0, prepared_archives=0)
    assert candidate["status"] == "CANDIDATE_ONLY"
    assert not candidate["write_authorized"] and not candidate["cutover_authorized"]
    for invalid in [-1, True, 1.5]:
        try:
            evaluate(all_verified, match_hash_mismatches=invalid, prepared_archives=0)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid count was accepted")
    print("PASS: fabricated D1 no-go gates; even all-green cannot grant data writes or cutover")

if __name__ == "__main__":
    main()
