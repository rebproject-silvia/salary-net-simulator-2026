#!/usr/bin/env python3
from pathlib import Path
import json, hashlib

ROOT = Path(__file__).resolve().parents[1]
P = ROOT / "data" / "rules-2026.json"
r = json.loads(P.read_text(encoding="utf-8"))

assert r["meta"]["year"] == 2026
assert r["meta"]["status"] == "approved"
assert r["input"]["minGross"] == 5000
assert r["input"]["maxGross"] == 50000
assert 0 < r["employeeContributions"]["standardRate"] < .2
assert "extraRate" not in r["employeeContributions"]
assert "extraThreshold" not in r["employeeContributions"]
assert r["milanMunicipal"]["exemptionIsFranchise"] is False
assert all(v["mode"] == "review-only" for v in r["sources"].values())

tmp = json.loads(json.dumps(r))
tmp["meta"]["rulesetId"] = ""
payload = json.dumps(tmp, sort_keys=True, separators=(",",":"), ensure_ascii=False).encode()
expected = hashlib.sha256(payload).hexdigest()[:8]
assert r["meta"]["rulesetId"].endswith("-" + expected), (r["meta"]["rulesetId"], expected)

print("PASS — ruleset valido e identificatore coerente")
