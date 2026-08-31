#!/usr/bin/env python3
"""Regulatory Watcher — review-only proof of architecture.

Policy:
- never writes or replaces the approved fiscal ruleset;
- only official HTTPS sources from an allow-list are accepted;
- redirects must remain on the same allowed institutional host;
- numerical candidates are proposals, never automatic updates;
- ambiguity, different-year context, invalid values or source errors => review_required;
- the approvedAt timestamp is never changed by this script.
"""
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.parse import urlparse
from datetime import date
import json, re, hashlib, sys

ROOT = Path(__file__).resolve().parents[1]
RULES = ROOT / "data" / "rules-2026.json"
REPORT = ROOT / "reports" / "regulatory_status.json"

ALLOWED_HOST_SUFFIXES = (
    "comune.milano.it",
    "inps.it",
    "camera.it",
    "regione.lombardia.it",
    "agenziaentrate.gov.it",
)

def allowed(url):
    p = urlparse(url)
    return p.scheme == "https" and any(p.hostname == h or p.hostname.endswith("." + h) for h in ALLOWED_HOST_SUFFIXES)

class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not allowed(newurl):
            raise ValueError(f"Redirect non consentito: {newurl}")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def fetch(url):
    if not allowed(url):
        raise ValueError(f"Fonte non istituzionale/non HTTPS: {url}")
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 RegulatoryWatcher/0.9"})
    with build_opener(SafeRedirect()).open(req, timeout=30) as r:
        body = r.read().decode("utf-8", "ignore")
        final = r.geturl()
        if not allowed(final):
            raise ValueError(f"Destinazione finale non consentita: {final}")
        if len(re.sub(r"<[^>]+>", " ", body).strip()) < 200:
            raise ValueError("Risposta troppo breve per una verifica semantica affidabile")
        return body, final

def ita_number(s):
    return float(s.replace(".", "").replace(",", "."))

def milan_candidates(html, year):
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))
    # collect candidates, do not silently choose the first one
    exemptions = [ita_number(x) for x in re.findall(r"(?:esenzion\w*|non superiore)[^€0-9]{0,80}€?\s*([0-9\.]+(?:,[0-9]+)?)", text, re.I)]
    rates = [ita_number(x)/100 for x in re.findall(r"aliquota[^%0-9]{0,80}([0-9]+(?:,[0-9]+)?)\s*%", text, re.I)]
    return sorted(set(exemptions)), sorted(set(rates)), str(year) in text

def main():
    rules = json.loads(RULES.read_text(encoding="utf-8"))
    report = {
        "checkedAt": date.today().isoformat(),
        "approvedRuleset": rules["meta"]["rulesetId"],
        "approvedAt": rules["meta"]["approvedAt"],
        "status": "checked_no_auto_change",
        "proposals": [],
        "sources": [],
        "errors": [],
        "policy": "review-only"
    }

    for key, source in rules["sources"].items():
        try:
            html, final = fetch(source["url"])
            entry = {"key": key, "url": final, "reachable": True, "semanticStatus": "manual_review"}
            if key == "milan":
                exs, rates, year_present = milan_candidates(html, rules["meta"]["year"])
                entry.update({"candidateExemptions": exs, "candidateRates": rates, "yearPresent": year_present})
                current_ex = rules["milanMunicipal"]["exemption"]
                current_rate = rules["milanMunicipal"]["rate"]
                if not year_present or len(exs) != 1 or len(rates) != 1:
                    report["status"] = "review_required"
                    report["errors"].append("Milano: candidati non univoci o anno fiscale non riconosciuto")
                elif exs[0] != current_ex or abs(rates[0] - current_rate) > 1e-12:
                    report["status"] = "review_required"
                    report["proposals"].append({
                        "field": "milanMunicipal",
                        "current": {"exemption": current_ex, "rate": current_rate},
                        "candidate": {"exemption": exs[0], "rate": rates[0]},
                        "action": "manual_review_required"
                    })
                else:
                    entry["semanticStatus"] = "matches_approved_rules"
            report["sources"].append(entry)
        except Exception as e:
            report["status"] = "review_required"
            report["errors"].append(f"{key}: {e}")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 2 if report["status"] == "review_required" else 0

if __name__ == "__main__":
    raise SystemExit(main())
