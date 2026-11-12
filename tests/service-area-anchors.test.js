import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const publicDir = new URL("../public/", import.meta.url);
const source = await readFile(new URL("service-area-anchors.js", publicDir), "utf8");

function events() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
    emit(type, event = {}) { [...(listeners.get(type) ?? [])].forEach((handler) => handler(event)); },
  };
}

function setup({ hash = "#monroe-decking-removal", mobile = true, complete = true,
  waitingForFonts = false, top = -61 } = {}) {
  const timers = new Map();
  const alignments = [];
  const media = { matches: mobile };
  const window = { ...events(), location: { hash }, innerHeight: 844 };
  const nav = { ...events(), getBoundingClientRect: () => ({ bottom: 54 }) };
  const target = {
    getBoundingClientRect: () => ({ top }),
    scrollIntoView(options) { alignments.push(options); top = 130; window.emit("scroll"); },
  };
  let sequence = 0;
  window.matchMedia = () => media;
  window.setTimeout = (callback, delay) => {
    const id = ++sequence;
    timers.set(id, { callback, delay });
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  let resolveFonts;
  const document = {
    readyState: complete ? "complete" : "interactive",
    getElementById: (id) => ["monroe-decking-removal", "other-communities"].includes(id) ? target : null,
    querySelector: () => nav,
  };
  if (waitingForFonts) document.fonts = { ready: new Promise((resolve) => { resolveFonts = resolve; }) };
  vm.runInNewContext(source, { window, document, Promise });
  return {
    window, nav, media, timers, alignments, resolveFonts,
    setTop(value) { top = value; },
    flush() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach(({ callback }) => callback());
    },
  };
}

const flushPromises = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

test("a cold mobile fragment waits for load, fonts, scrolling, and header transition before one instant correction", async () => {
  const state = setup({ complete: false, waitingForFonts: true });
  assert.equal(state.timers.size, 0);
  state.window.emit("load");
  assert.equal(state.timers.size, 0);
  state.resolveFonts();
  await flushPromises();
  assert.equal(state.timers.size, 1);
  const firstTimer = [...state.timers.keys()][0];
  state.window.emit("scroll");
  assert.ok(!state.timers.has(firstTimer));
  const scrollTimer = [...state.timers.keys()][0];
  state.nav.emit("transitionend");
  assert.ok(!state.timers.has(scrollTimer));
  assert.equal([...state.timers.values()][0].delay, 260);
  state.flush();
  assert.equal(state.alignments.length, 1);
  assert.equal(state.alignments[0].behavior, "instant");
  assert.equal(state.alignments[0].block, "start");
  state.window.emit("scroll");
  state.nav.emit("transitionend");
  state.window.emit("load");
  state.flush();
  assert.equal(state.alignments.length, 1);
  assert.equal(state.timers.size, 0);
});

test("desktop, unrelated fragments, and already-visible mobile targets retain native navigation", () => {
  for (const options of [{ mobile: false }, { hash: "#unrelated" }, { hash: "" }, { top: 130 }]) {
    const state = setup(options);
    state.flush();
    assert.equal(state.alignments.length, 0);
    assert.equal(state.timers.size, 0);
  }
});

test("visitor input cancels alignment permanently despite late load and font completion", async () => {
  for (const type of ["pointerdown", "touchstart", "wheel", "keydown"]) {
    const state = setup({ complete: false, waitingForFonts: true });
    state.window.emit(type);
    state.window.emit("load");
    state.resolveFonts();
    await flushPromises();
    state.window.emit("scroll");
    state.nav.emit("transitionend");
    state.window.emit("pageshow", { persisted: false });
    state.flush();
    assert.equal(state.alignments.length, 0, type);
    assert.equal(state.timers.size, 0, type);
  }
});

test("hash changes start a new bounded correction, including after a previous cancellation", () => {
  const state = setup();
  state.window.emit("wheel");
  state.window.location.hash = "#other-communities";
  state.window.emit("hashchange");
  state.flush();
  assert.equal(state.alignments.length, 1);
  state.setTop(-61);
  state.window.location.hash = "#unrelated";
  state.window.emit("hashchange");
  state.flush();
  assert.equal(state.alignments.length, 1);
});

test("pagehide clears pending work and a back-forward-cache restore can settle the restored fragment", () => {
  const state = setup();
  state.window.emit("pagehide");
  assert.equal(state.timers.size, 0);
  state.flush();
  assert.equal(state.alignments.length, 0);
  state.window.emit("pageshow", { persisted: true });
  state.flush();
  assert.equal(state.alignments.length, 1);
  assert.equal(state.timers.size, 0);
});

test("back-forward-cache restores preserve reading positions after correction or visitor cancellation", () => {
  for (const cancel of [false, true]) {
    const state = setup();
    if (cancel) state.window.emit("wheel");
    else state.flush();
    const corrections = state.alignments.length;
    state.setTop(-400);
    state.window.emit("pagehide");
    state.window.emit("pageshow", { persisted: true });
    state.flush();
    assert.equal(state.alignments.length, corrections);
    assert.equal(state.timers.size, 0);
  }
});

test("resizing or changing to desktop before settlement prevents a stale scroll", () => {
  for (const resizeEvent of [true, false]) {
    const state = setup();
    state.media.matches = false;
    if (resizeEvent) state.window.emit("resize");
    state.flush();
    assert.equal(state.alignments.length, 0);
  }
});

test("the fragment helper loads only on Service Areas, once and after the shared navigation script", async () => {
  for (const file of (await readdir(publicDir)).filter((name) => name.endsWith(".html"))) {
    const html = await readFile(new URL(file, publicDir), "utf8");
    const scripts = [...html.matchAll(/<script\b[^>]*src="service-area-anchors\.js[^\"]*"[^>]*>/g)];
    assert.equal(scripts.length, file === "service-areas.html" ? 1 : 0, file);
    if (scripts.length) {
      assert.match(scripts[0][0], /\bdefer\b/);
      assert.ok(html.indexOf(scripts[0][0]) > html.indexOf('src="script-20260713b-nav.js'));
    }
  }
});
