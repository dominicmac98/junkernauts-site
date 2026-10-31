import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../public/homepage-gallery-20261031.js', import.meta.url), 'utf8');

function element(extra = {}) {
  const listeners = new Map();
  return {
    hidden: false,
    textContent: '',
    attributes: new Map(),
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) || [];
      callbacks.push(listener);
      listeners.set(type, callbacks);
    },
    dispatch(type, event = {}) {
      for (const callback of listeners.get(type) || []) callback(event);
    },
    setAttribute(name, value) { this.attributes.set(name, value); },
    ...extra,
  };
}

function comparison() {
  const controls = element({ hidden: true });
  const before = element({ alt: 'Before the cleanup' });
  const after = element({ alt: 'After the cleanup' });
  const beforeButton = element();
  const afterButton = element();
  const pauseButton = element();
  const label = element();
  const status = element();
  const selectors = new Map([
    ['[data-home-photo="before"]', before],
    ['[data-home-photo="after"]', after],
    ['[data-home-controls]', controls],
    ['[data-home-show="before"]', beforeButton],
    ['[data-home-show="after"]', afterButton],
    ['[data-home-pause]', pauseButton],
    ['[data-home-state]', label],
    ['[data-home-autoplay]', status],
  ]);
  const classes = new Set();
  const card = element({
    dataset: {},
    isConnected: true,
    querySelector: selector => selectors.get(selector) || null,
    classList: { add: name => classes.add(name) },
  });
  return { card, selectors, classes, controls, before, after, beforeButton, afterButton, pauseButton, label, status };
}

function setup({ count = 3, reduced = false, hidden = false, loading = false, incomplete = false } = {}) {
  const cards = Array.from({ length: count }, comparison);
  if (incomplete && cards.length) cards[0].selectors.delete('[data-home-photo="after"]');
  const timers = new Map();
  let nextId = 0;
  let now = 0;
  const document = element({
    hidden,
    readyState: loading ? 'loading' : 'interactive',
    querySelectorAll: selector => selector === '[data-home-comparison]' ? cards.map(item => item.card) : [],
  });
  const motion = element({ matches: reduced });
  const window = element({
    matchMedia: () => motion,
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, due: now + delay, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  });
  const context = vm.createContext({ document, window });
  vm.runInContext(source, context);

  function advance(milliseconds) {
    const end = now + milliseconds;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      const [id, timer] = next;
      timers.delete(id);
      now = timer.due;
      timer.callback();
    }
    now = end;
  }
  return { cards, timers, document, window, motion, context, advance };
}

test('all three comparisons rotate Before → After → Before every five seconds without changing image descriptions', () => {
  const page = setup();
  for (const item of page.cards) {
    assert.equal(item.card.dataset.homeCurrent, 'before');
    assert.equal(item.before.hidden, false);
    assert.equal(item.after.hidden, true);
    assert.equal(item.controls.hidden, false);
    assert.ok(item.classes.has('is-enhanced'));
  }
  assert.equal(page.timers.size, 3);
  page.advance(4999);
  assert.ok(page.cards.every(item => item.card.dataset.homeCurrent === 'before'));
  page.advance(1);
  assert.ok(page.cards.every(item => item.card.dataset.homeCurrent === 'after'));
  page.advance(5000);
  for (const item of page.cards) {
    assert.equal(item.card.dataset.homeCurrent, 'before');
    assert.equal(item.before.alt, 'Before the cleanup');
    assert.equal(item.after.alt, 'After the cleanup');
    assert.equal(item.beforeButton.attributes.get('aria-pressed'), 'true');
    assert.equal(item.afterButton.attributes.get('aria-pressed'), 'false');
  }
  assert.equal(page.timers.size, 3);
});

test('manual selection restarts a full five-second interval for only that comparison', () => {
  const page = setup();
  page.advance(4000);
  page.cards[0].afterButton.dispatch('click');
  assert.equal(page.cards[0].card.dataset.homeCurrent, 'after');
  page.advance(1000);
  assert.ok(page.cards.every(item => item.card.dataset.homeCurrent === 'after'));
  page.advance(3999);
  assert.equal(page.cards[0].card.dataset.homeCurrent, 'after');
  page.advance(1);
  assert.equal(page.cards[0].card.dataset.homeCurrent, 'before');
  assert.equal(page.cards[1].card.dataset.homeCurrent, 'after');
  assert.equal(page.timers.size, 3);
});

test('Pause holds an image, allows manual selection, and Play resumes with a fresh interval', () => {
  const page = setup();
  const item = page.cards[0];
  page.advance(2000);
  item.pauseButton.dispatch('click');
  assert.equal(item.pauseButton.textContent, 'Play');
  assert.equal(item.status.textContent, 'Auto paused');
  assert.equal(page.timers.size, 2);
  page.advance(20000);
  assert.equal(item.card.dataset.homeCurrent, 'before');
  item.afterButton.dispatch('click');
  page.advance(10000);
  assert.equal(item.card.dataset.homeCurrent, 'after');
  assert.equal(page.timers.size, 2);
  item.pauseButton.dispatch('click');
  assert.equal(item.pauseButton.textContent, 'Pause');
  page.advance(4999);
  assert.equal(item.card.dataset.homeCurrent, 'after');
  page.advance(1);
  assert.equal(item.card.dataset.homeCurrent, 'before');
});

test('reduced motion prevents automatic changes until explicitly played and pauses when the preference changes', () => {
  const page = setup({ reduced: true });
  assert.equal(page.timers.size, 0);
  assert.ok(page.cards.every(item => item.pauseButton.textContent === 'Play'));
  page.cards[0].pauseButton.dispatch('click');
  page.advance(5000);
  assert.equal(page.cards[0].card.dataset.homeCurrent, 'after');
  assert.equal(page.cards[1].card.dataset.homeCurrent, 'before');
  page.motion.dispatch('change', { matches: true });
  assert.equal(page.timers.size, 0);
  page.motion.dispatch('change', { matches: false });
  assert.equal(page.timers.size, 0, 'preference changes must not override a paused state');
});

test('hidden tabs suspend timers and resume from the current image without advancing in the background', () => {
  const page = setup();
  page.advance(4000);
  page.document.hidden = true;
  page.document.dispatch('visibilitychange');
  assert.equal(page.timers.size, 0);
  page.advance(20000);
  assert.ok(page.cards.every(item => item.card.dataset.homeCurrent === 'before'));
  page.document.hidden = false;
  page.document.dispatch('visibilitychange');
  page.advance(4999);
  assert.ok(page.cards.every(item => item.card.dataset.homeCurrent === 'before'));
  page.advance(1);
  assert.ok(page.cards.every(item => item.card.dataset.homeCurrent === 'after'));
});

test('pagehide cancels work and a restored page resumes without creating duplicate timers', () => {
  const page = setup();
  page.cards[0].pauseButton.dispatch('click');
  page.window.dispatch('pagehide');
  assert.equal(page.timers.size, 0);
  page.document.dispatch('visibilitychange');
  assert.equal(page.timers.size, 0, 'visibility notifications cannot restart a suspended page');
  page.window.dispatch('pageshow');
  page.window.dispatch('pageshow');
  assert.equal(page.timers.size, 2);
  page.advance(5000);
  assert.equal(page.cards[0].card.dataset.homeCurrent, 'before');
  assert.equal(page.cards[1].card.dataset.homeCurrent, 'after');
});

test('no cards, incomplete cards, and duplicate initialization retain safe fallback behavior', () => {
  assert.equal(setup({ count: 0 }).timers.size, 0);
  const incomplete = setup({ count: 1, incomplete: true });
  assert.equal(incomplete.timers.size, 0);
  assert.equal(incomplete.cards[0].before.hidden, false);
  assert.equal(incomplete.cards[0].controls.hidden, true);
  const loading = setup({ loading: true });
  assert.equal(loading.timers.size, 0);
  assert.ok(loading.cards.every(item => !item.before.hidden && !item.after.hidden && item.controls.hidden));
  loading.document.readyState = 'interactive';
  loading.document.dispatch('DOMContentLoaded');
  assert.equal(loading.timers.size, 3);
  vm.runInContext(source, loading.context);
  assert.equal(loading.timers.size, 3);
  loading.cards[0].pauseButton.dispatch('click');
  assert.equal(loading.timers.size, 2, 'duplicate script execution must not register duplicate click handlers');
});
