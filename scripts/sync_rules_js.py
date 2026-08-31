#!/usr/bin/env python3
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
rules=json.loads((ROOT/"data"/"rules-2026.json").read_text(encoding="utf-8"))
(ROOT/"data"/"rules.js").write_text("window.TAX_RULES = "+json.dumps(rules,indent=2,ensure_ascii=False)+";\n",encoding="utf-8")
print("PASS — rules.js sincronizzato")
