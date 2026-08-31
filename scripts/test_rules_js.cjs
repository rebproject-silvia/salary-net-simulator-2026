#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');

// Cross-realm normalization without JSON.stringify's NaN -> null / undefined omission.
function plainData(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), 'Ruleset numbers must be finite');
    return value;
  }
  if (Array.isArray(value)) return Array.from(value, plainData);
  assert.equal(typeof value, 'object', 'Ruleset must contain JSON data only');
  assert.equal(Object.prototype.toString.call(value), '[object Object]', 'Invalid ruleset object');
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, plainData(entry)]));
}

function assertRulesMatch(jsSource, jsonSource) {
  const context = { window: {} };
  vm.runInNewContext(
    jsSource ?? fs.readFileSync(path.join(ROOT, 'data/rules.js'), 'utf8'),
    context, { filename: 'data/rules.js', timeout: 5000 }
  );
  assert.ok(context.window.TAX_RULES, 'Missing window.TAX_RULES');
  const actual = plainData(context.window.TAX_RULES);
  const expected = JSON.parse(jsonSource ?? fs.readFileSync(path.join(ROOT, 'data/rules-2026.json'), 'utf8'));
  assert.deepEqual(actual, expected, 'JSON and JavaScript rulesets differ');
}
if (require.main === module) {
  assertRulesMatch();
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rules-2026.json'), 'utf8'));
  rules.irpef.brackets[1].rate = 0.35;
  assert.throws(() => assertRulesMatch('window.TAX_RULES = ' + JSON.stringify(rules)), /rulesets differ/);
  const source = fs.readFileSync(path.join(ROOT, 'data/rules.js'), 'utf8');
  const nonFinite = source.replace('"upTo": null', '"upTo": NaN');
  assert.notEqual(source, nonFinite);
  assert.throws(() => assertRulesMatch(nonFinite), /finite/);
  console.log('PASS — semantic JSON/JS equality; fiscal mutation rejected; no synchronization');
}
module.exports = { assertRulesMatch };
