#!/usr/bin/env python3
"""V0.9 offline watcher fixtures; intercept all writes, never run live HTTP."""
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request
from unittest.mock import patch
from datetime import date
import builtins
import contextlib
import io
import json
import runpy
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
WATCHER = runpy.run_path(str(ROOT / "scripts/watch_rules.py"))
GLOBALS = WATCHER["main"].__globals__
RULES = ROOT / "data/rules-2026.json"
RULES_JS = ROOT / "data/rules.js"
POSITIVE = "Anno 2026 esenzione 23.000 euro aliquota 0,8%"
PADDING = " Informazioni istituzionali sul tributo comunale. " * 10


class Response:
    status = 200

    def __init__(self, url, body):
        self.url, self.body = url, body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def geturl(self):
        return self.url

    def read(self):
        return self.body.encode("utf-8")


class WatcherTests(unittest.TestCase):
    def run_case(self, body=POSITIVE, *, error=None, final_url=None,
                 expected="review_required", padding=True, redirect=False):
        protected = {path: path.read_bytes() for path in (RULES, RULES_JS)}
        approved_at = json.loads(protected[RULES])["meta"]["approvedAt"]
        reports, writes, forbidden = [], [], []
        report_path = GLOBALS["REPORT"].resolve()

        def fake_open(req, timeout):
            self.assertEqual(timeout, 30)
            if error is not None:
                raise error
            url = req.full_url
            is_milan = "comune.milano.it" in url
            if is_milan and redirect:
                WATCHER["SafeRedirect"]().redirect_request(
                    req, None, 302, "Redirect", {}, final_url)
            content = body if is_milan else POSITIVE
            if padding or not is_milan:
                content += PADDING
            return Response(final_url if is_milan and final_url else url, content)

        class Opener:
            open = staticmethod(fake_open)

        def fake_opener(*handlers):
            self.assertEqual(len(handlers), 1)
            self.assertIsInstance(handlers[0], WATCHER["SafeRedirect"])
            return Opener()

        def deny_write(path):
            forbidden.append(str(path))
            raise AssertionError("Forbidden watcher write: " + str(path))

        def write_text(path, text, *args, **kwargs):
            if path.resolve() != report_path:
                return deny_write(path)
            writes.append(str(path))
            reports.append(json.loads(text))
            return len(text)

        def mkdir(path, *args, **kwargs):
            if path.resolve() != report_path.parent:
                deny_write(path)

        original_open, original_io_open = builtins.open, io.open

        def guarded_open(original):
            def call(file, mode="r", *args, **kwargs):
                if any(flag in mode for flag in "wax+"):
                    return deny_write(file)
                return original(file, mode, *args, **kwargs)
            return call

        with patch.dict(GLOBALS, build_opener=fake_opener), \
                patch.object(Path, "write_text", write_text), \
                patch.object(Path, "write_bytes", lambda path, *a, **k: deny_write(path)), \
                patch.object(Path, "mkdir", mkdir), \
                patch("builtins.open", guarded_open(original_open)), \
                patch("io.open", guarded_open(original_io_open)), \
                contextlib.redirect_stdout(io.StringIO()):
            code = WATCHER["main"]()
        self.assertEqual(forbidden, [], "Any fiscal write attempt must fail this test")
        self.assertEqual(writes, [str(GLOBALS["REPORT"])])
        self.assertEqual(len(reports), 1)
        report = reports[0]
        self.assertEqual(report["status"], expected)
        self.assertEqual(code, 2 if expected == "review_required" else 0)
        self.assertEqual(report["policy"], "review-only")
        self.assertEqual(report["approvedAt"], approved_at)
        self.assertEqual(report["approvedRuleset"], json.loads(protected[RULES])["meta"]["rulesetId"])
        for path, content in protected.items():
            self.assertEqual(path.read_bytes(), content, "Approved fiscal file changed")
        return report

    def test_ordinary_positive(self):
        for text in (POSITIVE, "Anno 2026 esenzione € 23.000,00; aliquota 0,8 %"):
            self.assertEqual(WATCHER["milan_candidates"](text, 2026), ([23000.0], [0.008], True))
        report = self.run_case(expected="checked_no_auto_change")
        milan = next(source for source in report["sources"] if source["key"] == "milan")
        self.assertEqual(milan["semanticStatus"], "matches_approved_rules")
        self.assertEqual(report["proposals"], [])

    def test_history_and_current_disagree(self):
        self.run_case("Anno 2025 esenzione 20.000 euro aliquota 0,7%. " + POSITIVE)

    def test_wrong_year_only(self):
        self.run_case(POSITIVE.replace("2026", "2025"))

    def test_maintenance_http_200(self):
        self.run_case("Anno 2026: sito temporaneamente in manutenzione.")

    def test_short_response(self):
        self.run_case(POSITIVE, padding=False)

    def test_noninstitutional_redirect(self):
        self.run_case(final_url="https://evil.example/", redirect=True)

    def test_noninstitutional_final_url(self):
        self.run_case(final_url="https://evil.example/")

    def test_plausible_change(self):
        report = self.run_case(POSITIVE.replace("23.000", "24.000"))
        self.assertEqual(report["proposals"][0]["candidate"]["exemption"], 24000)

    def test_out_of_range(self):
        self.run_case("Anno 2026 esenzione 999.999 euro aliquota 99%")

    def test_discordant_values(self):
        self.run_case(POSITIVE + ". Anno 2026 esenzione 24.000 euro aliquota 0,9%")

    def test_network_unavailable(self):
        self.run_case(error=URLError("Rete indisponibile (fixture offline)"))

    def test_distributed_fixture_is_not_a_live_check(self):
        fixture = json.loads((ROOT / "reports/regulatory_status.json").read_text(encoding="utf-8"))
        rules = json.loads(RULES.read_text(encoding="utf-8"))
        self.assertIs(fixture["fixture"], True)
        self.assertEqual(fixture["fixtureVersion"], "V0.9")
        self.assertIsNone(fixture["checkedAt"])
        self.assertEqual(fixture["approvedRuleset"], rules["meta"]["rulesetId"])
        self.assertEqual(fixture["approvedAt"], rules["meta"]["approvedAt"])
        self.assertEqual(fixture["status"], "review_required")
        self.assertEqual(fixture["policy"], "review-only")
        self.assertEqual(fixture["proposals"], [])
        self.assertNotIn("ruleset", fixture)
        self.assertNotIn("changes", fixture)

    def test_redirect_allowlist_and_workflow(self):
        self.assertFalse(WATCHER["allowed"]("https://www.comune.milano.it.evil.example/"))
        self.assertFalse(WATCHER["allowed"]("http://www.comune.milano.it/"))
        with self.assertRaises(ValueError):
            WATCHER["SafeRedirect"]().redirect_request(
                Request("https://www.comune.milano.it/"), None, 302, "", {}, "https://evil.example/")
        workflow = (ROOT / ".github/workflows/regulatory-watch.yml").read_text(encoding="utf-8")
        self.assertIn("contents: read", workflow)
        self.assertNotIn("contents: write", workflow)
        self.assertNotIn("sync_rules_js", workflow)
        self.assertNotIn("git push", workflow)


if __name__ == "__main__":
    if "--fixture" in sys.argv:
        report = WatcherTests().run_case(error=URLError("Rete indisponibile (fixture offline)"))
        report.update(checkedAt=None, fixture=True, fixtureVersion="V0.9",
                      fixtureGeneratedAt=date.today().isoformat(),
                      fixtureScenario="network_unavailable; no live HTTP check")
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        unittest.main()
