import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../public/mobile-navigation-20261112.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/mobile-navigation-20261112.css', import.meta.url), 'utf8');

function element(className = '') {
  const listeners = new Map();
  const attributes = new Map();
  const classes = new Set(className.split(/\s+/).filter(Boolean));
  return {
    dataset: {}, id: '', children: [], focusCount: 0,
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
    },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: name => attributes.get(name),
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    emit(type, event = {}) { for (const listener of listeners.get(type) || []) listener(event); },
    focus() { this.focusCount++; },
  };
}

function setup({ mobile = true, missingNav = false, missingLinks = false, loading = false,
  existingId = '', idCollision = false, mediaAvailable = true } = {}) {
  const nav = element('site-nav');
  const links = element('nav-links');
  links.id = existingId;
  const actions = element('nav-actions');
  const shell = element('nav-shell');
  shell.children = [links, actions];
  shell.insertBefore = (child, sibling) => shell.children.splice(shell.children.indexOf(sibling), 0, child);
  links.parentNode = shell;
  const dropdowns = [element('nav-dropdown'), element('nav-dropdown')];
  const toggles = dropdowns.map(() => element('nav-dropdown-toggle'));
  dropdowns.forEach((dropdown, index) => { dropdown.querySelector = () => toggles[index]; });
  nav.querySelector = selector => selector === '.nav-actions' ? actions : selector === '.nav-links' && !missingLinks ? links : null;
  nav.querySelectorAll = selector => selector === '.nav-dropdown' ? dropdowns : [];
  nav.contains = target => target === nav || target === links || target === actions || shell.children.includes(target);
  const created = [];
  const document = Object.assign(element(), {
    readyState: loading ? 'loading' : 'interactive',
    querySelector: selector => selector === '.site-nav' && !missingNav ? nav : null,
    getElementById: id => idCollision && id === 'site-navigation-links' ? {} : null,
    createElement(tag) { assert.equal(tag, 'button'); const button = element(); created.push(button); return button; },
  });
  const media = { matches: mobile };
  const window = element();
  if (mediaAvailable) window.matchMedia = query => {
    assert.equal(query, '(max-width: 680px)');
    return media;
  };
  const context = vm.createContext({ document, window });
  vm.runInContext(source, context);
  return { nav, links, actions, shell, dropdowns, toggles, created, document, window, media, context };
}

test('enhancement adds one labelled disclosure before the original links without replacing actions', () => {
  const page = setup();
  const button = page.created[0];
  assert.equal(button.textContent, 'Menu');
  assert.equal(button.type, 'button');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.getAttribute('aria-controls'), `${page.links.id} ${page.actions.id}`);
  assert.deepEqual(page.shell.children, [button, page.links, page.actions]);
  assert.ok(page.nav.classList.contains('mobile-navigation-enhanced'));
  assert.ok(!page.nav.classList.contains('mobile-menu-open'));
  vm.runInContext(source, page.context);
  assert.equal(page.created.length, 1);
  button.emit('click');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.ok(page.nav.classList.contains('mobile-menu-open'));
  button.emit('click');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

test('Escape closes mobile navigation and nested accordions, restoring focus to Menu', () => {
  const page = setup();
  const button = page.created[0];
  button.emit('click');
  page.dropdowns.forEach((dropdown, index) => {
    dropdown.classList.add('is-open', 'is-hover-open');
    page.toggles[index].setAttribute('aria-expanded', 'true');
  });
  let prevented = false;
  page.document.emit('keydown', { key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(button.focusCount, 1);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.ok(page.dropdowns.every(dropdown => !dropdown.classList.contains('is-open') && !dropdown.classList.contains('is-hover-open')));
  assert.ok(page.toggles.every(toggle => toggle.getAttribute('aria-expanded') === 'false'));
  page.document.emit('keydown', { key: 'Tab', preventDefault() { assert.fail('Tab must not be trapped'); } });
});

test('inside clicks keep the menu open; outside clicks close without stealing focus', () => {
  const page = setup();
  const button = page.created[0];
  button.emit('click');
  page.document.emit('click', { target: page.links });
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  page.document.emit('click', { target: element() });
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.focusCount, 0);
});

test('shared accordion toggles stay open while ordinary destination links close the panel without cancelling navigation', () => {
  const page = setup();
  const button = page.created[0];
  button.emit('click');
  page.links.emit('click', { target: { closest: () => page.toggles[0] } });
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  const destination = element();
  page.links.emit('click', { target: { closest: () => destination }, preventDefault() { assert.fail('destination navigation must remain native'); } });
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

test('desktop resizing resets open state, and desktop clicks cannot open the mobile panel', () => {
  const page = setup();
  const button = page.created[0];
  button.emit('click');
  page.media.matches = false;
  page.window.emit('resize');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  button.emit('click');
  assert.ok(!page.nav.classList.contains('mobile-menu-open'));
  page.media.matches = true;
  page.window.emit('resize');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  button.emit('click');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
});

test('initialization preserves existing IDs, avoids collisions, and leaves unsupported or missing navigation untouched', () => {
  assert.equal(setup({ existingId: 'primary-links' }).created[0].getAttribute('aria-controls'), 'primary-links site-navigation-actions');
  assert.equal(setup({ idCollision: true }).links.id, 'site-navigation-links-2');
  for (const options of [{ missingNav: true }, { missingLinks: true }, { mediaAvailable: false }]) {
    const page = setup(options);
    assert.equal(page.created.length, 0);
    assert.ok(!page.nav.classList.contains('mobile-navigation-enhanced'));
  }
  const loading = setup({ loading: true });
  assert.equal(loading.created.length, 0);
  loading.document.emit('DOMContentLoaded');
  assert.equal(loading.created.length, 1);
});

test('mobile styling retains the fallback, reserves touch targets, and explicitly controls nested accordion visibility', () => {
  assert.match(css, /^\.mobile-menu-toggle \{ display: none; \}/m);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.doesNotMatch(css, /@media \(min-width:/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /max-height: calc\(100dvh - 170px\)/);
  assert.match(css, /\.mobile-navigation-enhanced\.nav-compact \.nav-links[\s\S]*?display: none;/);
  assert.match(css, /\.mobile-navigation-enhanced\.mobile-menu-open\.nav-compact \.nav-links[\s\S]*?display: grid;/);
  assert.match(css, /\.mobile-navigation-enhanced \.nav-dropdown \.services-menu \{\s*display: none !important;/);
  assert.match(css, /\.mobile-navigation-enhanced \.nav-dropdown\.is-open \.services-menu \{ display: block !important; \}/);
  assert.match(css, /\.site-footer \.footer-links a \{ min-height: 44px; \}/);
  assert.match(css, /\.review-carousel-button \{ width: 44px; height: 44px;/);
  assert.match(css, /\.review-carousel\.is-ready \.review-dots \{[^}]*flex-wrap: wrap;[^}]*overflow: visible;/);
  assert.match(css, /\.review-dot\.is-active \{[^}]*height: 24px;[^}]*flex: 0 0 24px;/);
});
