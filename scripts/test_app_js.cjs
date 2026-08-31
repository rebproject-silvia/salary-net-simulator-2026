#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { loadApp, ROOT } = require('./app_harness.cjs');
const { assertRulesMatch } = require('./test_rules_js.cjs');

function eq(actual, expected, message) {
  assert.equal(typeof actual, 'number', message + ': actual must be numeric');
  assert.equal(typeof expected, 'number', message + ': expected must be numeric');
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected), message + ': non-finite value');
  assert.ok(Math.abs(actual - expected) <= 0.001, message + ': ' + actual + ' != ' + expected);
}
function currency(value) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);
}
function verifyFrontend(app) {
  assert.ok(app.element('salary-form').listeners.get('submit')?.length, 'Missing submit listener');
  app.submit(40000, 14);
  assert.equal(app.element('results').hidden, false);
  assert.equal(app.element('form-error').hidden, true);
  assert.equal(app.element('net-annual').textContent, currency(27960.18));
  assert.equal(app.element('net-monthly').textContent, currency(1997.16));
  assert.equal(app.element('months-caption').textContent, 'Ripartizione matematica su 14 mensilità.');
  app.submit(40000, 13);
  assert.equal(app.element('net-annual').textContent, currency(27960.18));
  assert.equal(app.element('net-monthly').textContent, currency(2150.78));
}
async function main() {
  assertRulesMatch();
  const app = loadApp();
  const E = app.engine;
  // Read-only bridge for the Decimal oracle; always executes the actual app.js.
  if (process.argv.includes('--cases')) {
    const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
    process.stdout.write(JSON.stringify(cases.map(c => E.calculateSalary(Number(c.gross), c.months))));
    return;
  }
  for (const bad of [undefined, null, NaN, Infinity, -Infinity, '1', true, {}, [], 1n]) {
    assert.throws(() => eq(bad, 1, 'invalid actual'));
    assert.throws(() => eq(1, bad, 'invalid expected'));
  }
  assert.equal(app.document.getElementById('not-in-the-html'), null);
  eq(E.employeeContributions(5450), 500.86, 'half-up contributions');
  eq(E.calculateSalary(5049, 13).wedgeBonus, 325.54, 'half-up wedge');
  eq(E.calculateSalary(5049, 13).netAnnual, 4910.54, '5049 annual net');
  eq(E.calculateSalary(30000, 13).workDeduction, 2044.26, 'truncated deduction');
  eq(E.calculateSalary(30000, 13).netAnnual, 23425.49, '30000 annual net');
  eq(E.calculateSalary(30000, 14).netMonthlyAverage, 1673.25, '30000/14 average');
  eq(E.calculateSalary(50000, 13).netAnnual, 32567.65, 'second IRPEF bracket');
  for (const gross of [NaN, Infinity, -1, 4999.99, 50000.01, 30000.001]) {
    assert.ok(E.validateGross(gross), 'Invalid gross must be rejected: ' + gross);
  }
  for (const gross of [5000, 50000]) assert.equal(E.validateGross(gross), '');
  for (let cents = 500000; cents <= 5000000; cents += 2500) {
    const a = E.calculateSalary(cents / 100, 13), b = E.calculateSalary(cents / 100, 14);
    for (const key of Object.keys(a)) {
      eq(a[key], a[key], 'finite field ' + key);
      eq(b[key], b[key], 'finite field ' + key);
      if (key !== 'months' && key !== 'netMonthlyAverage') eq(a[key], b[key], '13/14 ' + key);
    }
  }
  const threshold = E.firstGrossAboveTaxableThreshold(23000);
  eq(threshold, 25327.62, 'Milan threshold');
  const below = E.calculateSalary(25327.61, 13), above = E.calculateSalary(threshold, 13);
  eq(below.municipal, 0, 'Milan exemption');
  eq(above.municipal, 184, 'Milan tax on entire taxable income');
  eq(below.netAnnual, 20766.77, 'Milan below net');
  eq(above.netAnnual, 20582.78, 'Milan above net');
  eq(E.roundMoney(above.netAnnual - below.netAnnual), -183.99, 'Milan net jump');
  verifyFrontend(app);
  for (const gross of ['', '4999.99', '50000.01', '30000.001']) {
    app.submit(gross, 13);
    assert.equal(app.element('results').hidden, true);
    assert.equal(app.element('form-error').hidden, false);
    assert.ok(app.element('form-error').textContent);
  }

  // Explanations are checked through the actual submit handler.
  app.submit(5000, 13);
  assert.equal(app.element('audit-treatment').hidden, true);
  assert.equal(app.element('extra-deduction-row').hidden, true);
  assert.match(app.element('formula-deductions').textContent, /capienza IRPEF/i);
  assert.doesNotMatch(app.element('formula-deductions').textContent, /Supplemento|ulteriore detrazione/i);
  app.submit(10000, 13);
  assert.equal(app.element('audit-treatment').hidden, false);
  assert.match(app.element('formula-treatment').textContent, /75,00/);
  assert.match(app.element('formula-treatment').textContent, />/);
  eq(['flow-net', 'flow-contrib', 'flow-tax'].reduce(
    (sum, id) => sum + parseFloat(app.element(id).style.width), 0), 100, 'base RAL partition');
  app.submit(30000, 14);
  assert.match(app.element('formula-deductions').textContent, /Supplemento/);
  assert.match(app.element('formula-deductions').textContent, /25\.000,00/);
  assert.match(app.element('formula-deductions').textContent, /35\.000,00/);
  assert.equal(app.element('flow-benefits').hidden, true);
  assert.equal(app.element('audit-treatment').hidden, true);
  await app.click('copy-summary');
  assert.ok(app.clipboard.text.includes(app.context.window.TAX_RULES.meta.rulesetId));
  assert.ok(app.clipboard.text.includes('Mensilità selezionate: 14'));
  app.clipboard.reject = true;
  await app.click('copy-summary');
  assert.equal(app.clipboard.fallback, app.clipboard.text);

  // Permanent mutation checks: no on-disk edits.
  const source = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const disconnected = source.replace("addEventListener('submit'", "addEventListener('unused'");
  assert.notEqual(disconnected, source, 'Submit mutation must actually apply');
  assert.throws(() => verifyFrontend(loadApp({ appSource: disconnected })), /submit listener/i);
  const missingValue = source.replace(/    workDeduction,\r?\n    extraDeduction,/,
    '    workDeduction: undefined,\n    extraDeduction,');
  assert.notEqual(missingValue, source, 'Missing-value mutation must actually apply');
  assert.throws(() => eq(loadApp({ appSource: missingValue }).engine.calculateSalary(30000, 13).workDeduction,
    2044.26, 'missing return field'), /numeric/);
  assert.throws(() => loadApp({ appSource: 'throw new Error("BROKEN_APP");' }), /BROKEN_APP/);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.throws(() => loadApp({ html: html.replace('id="net-annual"', 'id="removed-net-annual"') }), /null/);
  console.log('PASS — actual JavaScript, HTML-derived DOM, submit 13/14, strict numbers and mutation tests');
  console.log('30000/13 annual net: ' + E.calculateSalary(30000, 13).netAnnual.toFixed(2));
  console.log('Milan: ' + below.netAnnual.toFixed(2) + ' -> ' + above.netAnnual.toFixed(2) + '; delta -183.99');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
