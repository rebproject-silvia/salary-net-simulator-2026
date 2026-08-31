# Changelog

## V0.9 — Submission Candidate
- F1: strict numeric assertions, HTML-derived DOM, actual submit/13/14/DOM-result tests and in-memory mutations;
- F2: mandatory read-only semantic JSON/JS equality check in CI;
- F3: Decimal throughout the Python oracle, with automatic comparison against actual JavaScript;
- F4: corrected double-escaped watcher regexes; positive and hostile offline fixtures; fiscal writes forbidden in tests;
- F6: removed contradictory fiscal update wording; approval, technical checks and manual review distinguished;
- F7: conditional explanations for treatment, the 65 € supplement, IRPEF capacity and applicable thresholds;
- F8: fixed comparison section quoting and added a negative HTML/ARIA regression test;
- F9: refreshed Milan fixture and test documentation from current executions; regulatory report clearly marked offline;
- fiscal JavaScript formulas and approved ruleset unchanged; F5 outside this targeted correction, F10/F11 unchanged;
- post-audit GitHub presentation pass: README rewritten, REB Project signature/logo added to the footer, no fiscal logic changes.

## V0.8 Release Candidate
- operational range aligned to 5,000–50,000 €;
- removed annualised 1% contribution approximation;
- added explicit half-up cent rounding;
- added four-decimal truncation in employee work deduction ratios;
- watcher changed to review-only: no automatic fiscal-rule writes;
- ruleset ID now contains a content hash;
- UI wording changed from “verified” to “approved” ruleset;
- actual app.js engine tested with Node;
- Python retained as independent oracle;
- RAL flow now separates fiscal benefits from the 100% RAL partition;
- formulas for deductions/benefits made inspectable;
- keyboard focus indicator added for 13/14 choice;
- accidental literal CSS \n sequences removed;
- documentation consolidated to V0.8.
