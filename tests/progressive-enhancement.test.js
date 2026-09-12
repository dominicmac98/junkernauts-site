import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const navSource = await readFile(new URL("../public/script-20260713b-nav.js", import.meta.url), "utf8");
const reviewSource = await readFile(new URL("../public/reviews-carousel-20260723.js", import.meta.url), "utf8");

function element(initialClasses = "") {
  const classes = new Set(initialClasses.split(/\s+/).filter(Boolean));
  const listeners = new Map();
  const attributes = new Map();
  const item = {
    children: [], dataset: {}, textContent: "", style: {},
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle(name, force = !classes.has(name)) {
        if (force) classes.add(name);
        else classes.delete(name);
        return force;
      },
    },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: name => attributes.get(name),
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    emit(name, event = {}) { for (const callback of listeners.get(name) || []) callback(event); },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; },
    contains: () => false,
  };
  Object.defineProperty(item, "className", {
    get: () => [...classes].join(" "),
    set(value) { classes.clear(); value.split(/\s+/).filter(Boolean).forEach(name => classes.add(name)); },
  });
  return item;
}

function setupNavigation({ storageBlocked = false, reducedMotion = false, observerAvailable = true } = {}) {
  const body = element();
  const head = element();
  const nav = element("site-nav");
  const toggle = element();
  const reveals = [-100, 20, 1300].map(top => Object.assign(element("reveal"), {
    getBoundingClientRect: () => ({ top }),
  }));
  const document = Object.assign(element(), {
    body, head, documentElement: { scrollTop: 0 },
    querySelector: selector => ({ ".site-nav": nav, "[data-theme-toggle]": toggle })[selector] || null,
    querySelectorAll: selector => selector === ".reveal" ? reveals : [],
    createElement: () => element(),
  });
  const window = Object.assign(element(), {
    scrollY: 0, innerHeight: 800,
    matchMedia: query => ({ matches: query.includes("reduced-motion") ? reducedMotion : false }),
    requestAnimationFrame: () => 1,
    setTimeout: () => 1,
    clearTimeout: () => {},
  });
  const observers = [];
  class IntersectionObserver {
    constructor(callback) { this.callback = callback; this.observed = new Set(); observers.push(this); }
    observe(item) { this.observed.add(item); }
    unobserve(item) { this.observed.delete(item); }
  }
  if (observerAvailable) window.IntersectionObserver = IntersectionObserver;
  const storage = new Map();
  const context = {
    window, document, IntersectionObserver,
    localStorage: {
      getItem(key) { if (storageBlocked) throw Error("storage blocked"); return storage.get(key); },
      setItem(key, value) { if (storageBlocked) throw Error("storage blocked"); storage.set(key, value); },
    },
  };
  vm.runInNewContext(navSource, context);
  return { body, head, nav, toggle, reveals, window, observers, storage };
}

test("blocked theme storage does not stop navigation, theme controls, or booking preloading", () => {
  const page = setupNavigation({ storageBlocked: true });
  assert.equal(page.head.children[0].src, "jobber-booking.js?v=20260907-quote");
  assert.equal(page.head.children[0].async, true);
  page.window.scrollY = 250;
  page.window.emit("scrollend");
  assert.equal(page.nav.classList.contains("nav-compact"), true);
  assert.doesNotThrow(() => page.toggle.emit("click"));
  assert.equal(page.body.classList.contains("night-mode"), true);
  assert.equal(page.toggle.getAttribute("aria-pressed"), "true");
  assert.match(page.toggle.innerHTML, /Night Mode/);
});

test("optional motion skips initially visible content and stops observing after entry", () => {
  const page = setupNavigation();
  assert.equal(page.observers.length, 1);
  const observer = page.observers[0];
  assert.deepEqual([...observer.observed], [page.reveals[2]]);
  observer.callback([{ target: page.reveals[2], isIntersecting: true }]);
  assert.equal(page.reveals[2].classList.contains("reveal-motion"), true);
  assert.equal(observer.observed.size, 0);
  assert.equal(page.reveals[1].classList.contains("reveal-motion"), false);
  assert.deepEqual(page.reveals.map(item => item.style), [{}, {}, {}]);
});

test("content and navigation need no animation observer or reduced-motion override", () => {
  for (const options of [{ observerAvailable: false }, { reducedMotion: true }]) {
    const page = setupNavigation(options);
    assert.equal(page.observers.length, 0);
    assert.equal(page.reveals.some(item => item.classList.contains("reveal-motion")), false);
    page.toggle.emit("click");
    assert.equal(page.storage.get("junkernautsTheme"), "night");
  }
});

function setupReviews({ missingControls = false, failInitialization = false } = {}) {
  const root = element("review-carousel");
  const stage = element();
  const previous = element();
  const next = element();
  const dots = element();
  const status = element();
  const slides = Array.from({ length: 4 }, (_, index) => Object.assign(element("review-card"), {
    dataset: { reviewId: `review-${index}` }, textContent: `Customer review ${index}`,
  }));
  stage.children = slides;
  stage.querySelectorAll = () => stage.children;
  root.querySelector = selector => ({
    "[data-review-stage]": stage,
    "[data-review-previous]": missingControls ? null : previous,
    "[data-review-next]": next,
    "[data-review-dots]": dots,
    "[data-review-status]": status,
  })[selector];
  root.querySelectorAll = () => dots.children;
  const document = Object.assign(element(), {
    querySelector: selector => selector === "[data-review-carousel]" ? root : null,
    createElement() {
      if (failInitialization) throw Error("initialization failed");
      return element();
    },
  });
  let fetchCalls = 0;
  const context = {
    document,
    window: { matchMedia: () => ({ matches: false }), clearInterval: () => {}, setInterval: () => 1 },
    fetch: async () => { fetchCalls++; return { ok: false }; },
  };
  let error;
  try { vm.runInNewContext(reviewSource, context); } catch (caught) { error = caught; }
  return { root, previous, next, slides, dots, status, error, fetchCalls };
}

test("review carousel starts with static cards even when the live feed is unavailable", () => {
  const reviews = setupReviews();
  assert.equal(reviews.error, undefined);
  assert.equal(reviews.root.classList.contains("is-ready"), true);
  assert.equal(reviews.slides[0].classList.contains("is-active"), true);
  assert.equal(reviews.slides[0].getAttribute("aria-hidden"), "false");
  assert.equal(reviews.fetchCalls, 1);
  reviews.next.emit("click");
  assert.equal(reviews.slides[1].classList.contains("is-active"), true);
  assert.equal(reviews.slides[1].tabIndex, 0);
  assert.match(reviews.status.textContent, /Showing review 2 of 4/);
  reviews.previous.emit("click");
  assert.equal(reviews.slides[0].classList.contains("is-active"), true);
});

test("incomplete or failed review initialization keeps the static presentation", () => {
  for (const options of [{ missingControls: true }, { failInitialization: true }]) {
    const reviews = setupReviews(options);
    assert.equal(reviews.root.classList.contains("is-ready"), false);
    assert.equal(reviews.fetchCalls, 0);
    assert.equal(reviews.slides.every(slide => slide.getAttribute("aria-hidden") !== "true"), true);
  }
});
