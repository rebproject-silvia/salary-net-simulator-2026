#!/usr/bin/env python3
"""Minimal static checks of the real HTML, references and review-only wording."""
from pathlib import Path
from html.parser import HTMLParser
from collections import Counter
import re
import json

ROOT = Path(__file__).resolve().parents[1]


class Markup(HTMLParser):
    def __init__(self):
        super().__init__()
        self.elements = []

    def handle_starttag(self, tag, attrs):
        names = [name for name, _ in attrs]
        assert len(names) == len(set(names)), ("duplicate attribute", tag)
        assert all(not re.search(r"['\"=<>]", name) for name in names), ("malformed attribute", attrs)
        self.elements.append((tag, dict(attrs)))


def check_markup(text):
    parsed = Markup()
    parsed.feed(text)
    counts = Counter(attrs["id"] for _, attrs in parsed.elements if "id" in attrs)
    assert all(count == 1 for count in counts.values()), "duplicate id"
    ids = set(counts)
    for tag, attrs in parsed.elements:
        for reference in ("aria-labelledby", "aria-describedby"):
            if reference in attrs:
                assert attrs[reference] and set(attrs[reference].split()) <= ids, (tag, reference, attrs)
        if tag == "label" and "for" in attrs:
            assert attrs["for"] in ids, attrs
    comparison = [attrs for tag, attrs in parsed.elements
                  if tag == "section" and "comparison-panel" in (attrs.get("class") or "").split()]
    assert len(comparison) == 1, "comparison section missing"
    assert comparison[0].get("aria-labelledby") == "compare-title", "comparison ARIA attribute malformed"
    scripts = [attrs.get("src") for tag, attrs in parsed.elements if tag == "script"]
    assert scripts == ["data/rules.js", "app.js"], scripts
    return ids


def no_auto_update_claim(text):
    normalized = re.sub(r"\s+", " ", text).lower()
    assert not re.search(
        r"aggiornamenti sicuri possono essere applicati automaticamente|"
        r"aggiornamenti normativi automatici abilitati", normalized
    ), "affirmative fiscal auto-update claim"


def main():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    js = (ROOT / "app.js").read_text(encoding="utf-8")
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    rules = json.loads((ROOT / "data/rules-2026.json").read_text(encoding="utf-8"))
    ids = check_markup(html)
    used = set(re.findall(r"(?:getElementById|setText|toggleRow)\('([^']+)'", js))
    assert not used - ids, sorted(used - ids)
    assert 'CASO STANDARD DEL PROTOTIPO' in html
    assert 'Profilo fisso per questa demo' in html
    assert 'step="0.01"' in html
    assert 'min="5000"' in html and 'max="50000"' in html
    assert rules["input"]["minGross"] == 5000 and rules["input"]["maxGross"] == 50000
    assert r"\n" not in css
    assert '.segmented input:focus-visible + span' in css
    assert 'Regole verificate' not in html
    assert 'V0.9 Submission Candidate' in html
    assert 'Ultimo controllo tecnico' in html and 'revisione umana' in html
    for file in [*ROOT.glob("*.md"), ROOT / "index.html", ROOT / "app.js"]:
        no_auto_update_claim(file.read_text(encoding="utf-8"))

    broken = html.replace('class="comparison-panel" aria-labelledby=', 'class="comparison-panel aria-labelledby=')
    assert broken != html
    try:
        check_markup(broken)
    except AssertionError:
        pass
    else:
        raise AssertionError("Missing-quote mutation was not detected")
    try:
        no_auto_update_claim("gli aggiornamenti sicuri possono essere applicati automaticamente")
    except AssertionError:
        pass
    else:
        raise AssertionError("Auto-update claim mutation was not detected")
    print("PASS - HTML/ARIA, DOM references, input bounds, focus CSS and review-only wording; mutations rejected")


if __name__ == "__main__":
    main()
