import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../public/jobber-booking.js", import.meta.url), "utf8");
const origin = "https://clienthub.getjobber.com";

function setup({ booking = true, form = "booking", connection = {}, lastWarm, storageBlocked = false } = {}) {
  const frames = [];
  const events = {};
  const timers = new Map();
  const storage = new Map(lastWarm ? [["junkernauts-jobber-warmed-5115979", String(lastWarm)]] : []);
  let timerId = 0;
  const status = { hidden: false, textContent: "Connecting to booking..." };
  const link = {};
  const mount = { getAttribute: () => form, appendChild: f => frames.push(f), setAttribute: (k, v) => { mount[k] = v; }, scrollIntoView: () => { mount.scrolled = true; } };
  function listen(type, callback) { (events[type] ||= new Set()).add(callback); }
  const document = {
    querySelector: s => ({ "[data-jobber-form]": booking ? mount : null, "[data-jobber-status]": status, "[data-jobber-direct]": link })[s],
    createElement: () => ({ style: {}, contentWindow: {}, setAttribute(k, v) { this[k] = v; } }),
    body: { appendChild: f => frames.push(f) },
    referrer: "https://getjunkernauts.com/services",
    title: "Schedule a free quote",
    cookie: "_ga=GA1.1.123.456; other=1",
    readyState: "loading",
    visibilityState: "visible",
    addEventListener: listen,
  };
  const window = {
    location: new URL("https://getjunkernauts.com/booking?utm_source=google&utm_campaign=cleanup"),
    addEventListener: listen,
    removeEventListener: (type, cb) => events[type]?.delete(cb),
    setTimeout: (cb, delay) => { timers.set(++timerId, { cb, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    requestIdleCallback: cb => { timers.set(++timerId, { cb, delay: "idle" }); },
  };
  const context = {
    window, document, navigator: { connection }, URL, URLSearchParams,
    sessionStorage: {
      getItem(k) { if (storageBlocked) throw Error("blocked"); return storage.get(k); },
      setItem(k, v) { if (storageBlocked) throw Error("blocked"); storage.set(k, v); },
    },
  };
  vm.runInNewContext(source, context);
  function emit(type, data = {}) { for (const cb of [...(events[type] || [])]) cb(data); }
  function run(delay) {
    for (const [id, timer] of [...timers]) {
      if (timer.delay !== delay) continue;
      timers.delete(id);
      timer.cb();
    }
  }
  const message = data => emit("message", { origin, source: frames[0].contentWindow, data });
  return { frames, mount, status, link, document, storage, emit, run, message };
}

test("booking starts immediately without analytics, retaining attribution and a direct fallback", () => {
  const t = setup();
  assert.equal(t.frames.length, 1);
  const url = new URL(t.frames[0].src);
  assert.equal(url.origin, origin);
  assert.equal(url.searchParams.get("utm_campaign"), "cleanup");
  assert.equal(url.searchParams.get("ga_client_id"), '"123.456"');
  assert.equal(t.link.href, url.href);
  t.run(12000);
  assert.match(t.status.textContent, /Taking longer/);
});

test("only this Jobber frame can resize the form; later steps can shrink it", () => {
  const t = setup();
  t.emit("message", { origin: "https://untrusted.example", source: t.frames[0].contentWindow, data: "1000px" });
  t.emit("message", { origin, source: {}, data: "1000px" });
  for (const data of ["0px", "-1", "20001px", { height: 1000 }, "100%;color:red"]) t.message(data);
  assert.equal(t.frames[0].style.height, undefined);
  t.message("1200px");
  assert.equal(t.frames[0].style.height, "1200px");
  assert.equal(t.status.hidden, true);
  assert.equal(t.mount["aria-busy"], "false");
  t.message(650);
  assert.equal(t.frames[0].style.height, "650px");
  t.message("scrolltop");
  assert.equal(t.mount.scrolled, undefined);
  t.document.activeElement = t.frames[0];
  t.message("scrolltop");
  assert.equal(t.mount.scrolled, true);
});

test("background warmup waits for page load and idle, and never duplicates the frame", () => {
  const t = setup({ booking: false });
  assert.equal(t.frames.length, 0);
  t.emit("load");
  t.run(1500);
  assert.equal(t.frames.length, 0);
  t.run("idle");
  assert.equal(t.frames.length, 1);
  assert.equal(t.frames[0]["aria-hidden"], "true");
  assert.equal(t.frames[0].tabIndex, -1);
  assert.equal(new URL(t.frames[0].src).searchParams.get("ga_send_page_view"), "false");
  t.message("887px");
  assert.ok(t.storage.has("junkernauts-jobber-warmed-5115979"));
  t.emit("pointerover", { target: { closest: () => ({ href: "https://getjunkernauts.com/booking" }) } });
  assert.equal(t.frames.length, 1);
});

test("intent can warm early, while data-saving, slow connections and recent warmups skip it", () => {
  for (const options of [{ connection: { saveData: true } }, { connection: { effectiveType: "2g" } }, { lastWarm: Date.now() }]) {
    const t = setup({ booking: false, ...options });
    t.emit("load"); t.run(1500); t.run("idle");
    assert.equal(t.frames.length, 0);
  }
  const t = setup({ booking: false, storageBlocked: true });
  t.emit("focusin", { target: { closest: () => ({ href: "https://other.example/booking" }) } });
  assert.equal(t.frames.length, 0);
  t.emit("focusin", { target: { closest: () => ({ href: "https://getjunkernauts.com/booking" }) } });
  assert.equal(t.frames.length, 1);
  t.message("887px");
});

test("booking has one current form with no retired booking UI or vendor startup delay", async () => {
  const html = await readFile(new URL("../public/booking.html", import.meta.url), "utf8");
  assert.equal((html.match(/data-jobber-form/g) || []).length, 1);
  assert.doesNotMatch(html, /legacy-booking-fields|data-booking-step|work_request_embed_snippet|script-20260728-calendar-fix/);
  assert.match(html, /rel="preconnect" href="https:\/\/clienthub.getjobber.com"/);
});

test("Fast Estimate opens its own request form, not the assessment form", () => {
  const t = setup({ form: "quote" });
  assert.equal(t.frames.length, 1);
  assert.match(new URL(t.frames[0].src).pathname, /\/5115980\/embedded_new$/);
  assert.match(t.frames[0].title, /fast free estimate/);
  assert.equal(t.link.href, t.frames[0].src);
  t.message("1100px");
  assert.ok(t.storage.has("junkernauts-jobber-warmed-5115980"));
  assert.equal(t.storage.has("junkernauts-jobber-warmed-5115979"), false);
});

test("both forms warm independently and quote-link intent does not duplicate them", () => {
  const t = setup({ booking: false });
  t.emit("load"); t.run(1500); t.run("idle");
  assert.match(t.frames[0].src, /\/5115979\//);
  t.emit("focusin", { target: { closest: () => ({ href: "https://getjunkernauts.com/quote" }) } });
  assert.equal(t.frames.length, 2);
  assert.match(t.frames[1].src, /\/5115980\//);
  t.run(3500); t.run("idle");
  assert.equal(t.frames.length, 2);
  const recentBooking = setup({ booking: false, lastWarm: Date.now() });
  recentBooking.emit("load"); recentBooking.run(1500); recentBooking.run("idle");
  recentBooking.run(3500); recentBooking.run("idle");
  assert.equal(recentBooking.frames.length, 1);
  assert.match(recentBooking.frames[0].src, /\/5115980\//);
});

test("quote page contains only the new request form and no retired submit handler", async () => {
  const html = await readFile(new URL("../public/quote.html", import.meta.url), "utf8");
  assert.equal((html.match(/data-jobber-form="quote"/g) || []).length, 1);
  assert.match(html, /5115980/);
  assert.doesNotMatch(html, /data-quote-form|script-20260716-quote-confirmation|<form\b/);
});
