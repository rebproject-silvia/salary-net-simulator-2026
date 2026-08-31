'use strict';
// Small DOM fixture derived from index.html; not a browser or an HTML validator.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');

function loadApp(options = {}) {
  const html = options.html ?? fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const nodes = [];
  const ids = new Map();
  const timers = [];
  const clipboard = { text: '', reject: false, fallback: null };
  const document = {
    activeElement: null,
    getElementById(id) { return ids.get(id) ?? null; },
    querySelector(selector) {
      if (selector === 'input[name="months"]:checked') {
        return nodes.find(n => n.tagName === 'input' && n.name === 'months' && n.checked) ?? null;
      }
      if (selector === '.calculator-card') {
        return nodes.find(n => n.classList.contains('calculator-card')) ?? null;
      }
      throw new Error('Unsupported fixture selector: ' + selector);
    }
  };
  for (const match of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<([a-z][\w-]*)\b([^<>]*?)>/gi)) {
    const attributes = {};
    for (const attr of match[2].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      assert.ok(!Object.hasOwn(attributes, attr[1]), 'Duplicate attribute: ' + attr[1]);
      attributes[attr[1]] = attr[2] ?? attr[3] ?? attr[4] ?? '';
    }
    const classes = new Set((attributes.class ?? '').split(/\s+/));
    const listeners = new Map();
    const node = {
      tagName: match[1].toLowerCase(), attributes, listeners,
      id: attributes.id ?? '', name: attributes.name ?? '',
      value: attributes.value ?? '', min: attributes.min ?? '', max: attributes.max ?? '',
      checked: Object.hasOwn(attributes, 'checked'), hidden: Object.hasOwn(attributes, 'hidden'),
      textContent: '', style: {},
      classList: {
        add(value) { classes.add(value); },
        remove(value) { classes.delete(value); },
        contains(value) { return classes.has(value); }
      },
      addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
      },
      dispatchEvent(event) {
        event.target = this;
        event.defaultPrevented = false;
        event.preventDefault = () => { event.defaultPrevented = true; };
        for (const handler of listeners.get(event.type) ?? []) handler(event);
        return !event.defaultPrevented;
      },
      focus() { document.activeElement = this; },
      scrollIntoView() {}
    };
    nodes.push(node);
    if (node.id) {
      assert.ok(!ids.has(node.id), 'Duplicate DOM id: ' + node.id);
      ids.set(node.id, node);
    }
  }
  const context = {
    console, Intl, Number, Math, Date, window: {}, document,
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {},
    navigator: { clipboard: { async writeText(text) {
      if (clipboard.reject) throw new Error('Clipboard denied by test');
      clipboard.text = text;
    } } }
  };
  context.window.window = context.window;
  context.window.prompt = (_message, text) => { clipboard.fallback = text; };
  vm.createContext(context);
  const scripts = nodes.filter(n => n.tagName === 'script').map(n => n.attributes.src);
  assert.deepEqual(scripts, ['data/rules.js', 'app.js'], 'Actual HTML script order');
  for (const source of scripts) {
    const override = source === 'app.js' ? options.appSource : options.rulesSource;
    const code = override ?? fs.readFileSync(path.join(ROOT, source), 'utf8');
    vm.runInContext(code, context, { filename: source, timeout: 5000 });
  }
  const engine = context.window.__SALARY_ENGINE__;
  assert.ok(engine, 'Actual app.js must expose the engine');
  function element(id) {
    const node = document.getElementById(id);
    assert.ok(node, 'Missing element in index.html: ' + id);
    return node;
  }
  function selectMonths(value) {
    const radios = nodes.filter(n => n.tagName === 'input' && n.name === 'months');
    assert.ok(radios.some(n => n.value === String(value)), 'Missing radio option');
    for (const radio of radios) radio.checked = radio.value === String(value);
  }
  function submit(gross, months) {
    element('ral').value = String(gross);
    selectMonths(months);
    const event = { type: 'submit' };
    element('salary-form').dispatchEvent(event);
    assert.ok(event.defaultPrevented, 'Actual submit listener is not connected');
  }
  async function click(id) {
    const node = element(id);
    const handlers = node.listeners.get('click') ?? [];
    assert.ok(handlers.length, 'Missing click listener: ' + id);
    for (const handler of handlers) await handler({ type: 'click', target: node });
  }
  return { engine, context, document, element, selectMonths, submit, click, clipboard, timers };
}
module.exports = { loadApp, ROOT };
