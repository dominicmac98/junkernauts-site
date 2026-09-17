import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const publicDir = new URL("../public/", import.meta.url);
const source = await readFile(new URL("phone-conversion-20260717b.js", publicDir), "utf8");
const phone = "tel:+17344808190";
const destination = "AW-18197209529/D7xnCIHd_tEcELnDjeVD";

function setup(mode = "queued") {
  const events = [];
  const navigations = [];
  const timers = new Map();
  let timerId = 0;
  const context = {
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  context.window = context;
  Object.defineProperty(context, "location", { set(url) { navigations.push(url); } });
  if (mode !== "missing") {
    context.gtag = (...args) => {
      if (mode === "throwing") throw new Error("Tracking unavailable");
      events.push(args);
      if (mode === "synchronous") args[2].event_callback();
    };
  }
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, events, navigations, timers, report: context.gtag_report_conversion };
}

test("phone conversion does not fire on page load and sends the supplied Ads action once per click", () => {
  const page = setup();
  assert.equal(page.events.length, 0);
  assert.equal(page.timers.size, 0);
  assert.equal(page.report(phone), false);
  assert.equal(page.events.length, 1);
  const [command, event, parameters] = page.events[0];
  assert.equal(command, "event");
  assert.equal(event, "conversion");
  assert.equal(parameters.send_to, destination);
  assert.equal(parameters.value, 1.0);
  assert.equal(parameters.currency, "USD");
  assert.equal(parameters.event_timeout, 1500);
  assert.equal(typeof parameters.event_callback, "function");
  assert.deepEqual(page.navigations, []);
});

test("the Ads callback opens the dialer once and cancels the fallback timer", () => {
  const page = setup();
  page.report(phone);
  const fallback = [...page.timers.values()][0];
  assert.equal(fallback.delay, 1600);
  const callback = page.events[0][2].event_callback;
  callback();
  assert.deepEqual(page.navigations, [phone]);
  assert.equal(page.timers.size, 0);
  fallback.callback();
  callback();
  assert.deepEqual(page.navigations, [phone]);
  assert.equal(page.events.length, 1);
});

test("blocked or delayed tracking cannot leave a phone click waiting indefinitely", () => {
  const page = setup();
  page.report(phone);
  [...page.timers.values()][0].callback();
  assert.deepEqual(page.navigations, [phone]);
  page.events[0][2].event_callback();
  assert.deepEqual(page.navigations, [phone]);
  assert.equal(page.events.length, 1);
});

for (const mode of ["missing", "throwing"]) {
  test(`a ${mode} Google tag still opens the phone link immediately`, () => {
    const page = setup(mode);
    assert.equal(page.report(phone), false);
    assert.deepEqual(page.navigations, [phone]);
    assert.equal(page.timers.size, 0);
  });
}

test("a synchronous conversion callback leaves no pending dialer retry", () => {
  const page = setup("synchronous");
  assert.equal(page.report(phone), false);
  assert.equal(page.events.length, 1);
  assert.deepEqual(page.navigations, [phone]);
  assert.equal(page.timers.size, 0);
});

test("the optional URL argument never navigates to undefined", () => {
  const page = setup();
  assert.equal(page.report(), false);
  page.events[0][2].event_callback();
  assert.deepEqual(page.navigations, []);
  assert.equal(page.timers.size, 0);
});

test("a subsequent phone click still has its own conversion and navigation", () => {
  const page = setup("synchronous");
  page.report(phone);
  page.report(phone);
  assert.equal(page.events.length, 2);
  assert.deepEqual(page.navigations, [phone, phone]);
});

test("every HTML phone link loads one current helper and reports exactly one conversion", async () => {
  const pages = (await readdir(publicDir)).filter(file => file.endsWith(".html"));
  let checkedLinks = 0;
  for (const file of pages) {
    const html = await readFile(new URL(file, publicDir), "utf8");
    const phoneLinks = [...html.matchAll(/<a\b[^>]*href="tel:[^"]+"[^>]*>/g)];
    assert.ok(phoneLinks.length, `${file}: expected customer phone links`);
    const helperTags = [...html.matchAll(/<script\b[^>]*src="([^"]*phone-conversion[^"]*)"[^>]*>/g)];
    assert.equal(helperTags.length, 1, file);
    assert.equal(helperTags[0][1], `${file === "404.html" ? "/" : ""}phone-conversion-20260717b.js?v=20260916-calls`, file);
    assert.ok(html.indexOf(helperTags[0][0]) < html.indexOf("</head>"), file);
    assert.equal([...html.matchAll(/<script\b[^>]*src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=AW-18197209529"/g)].length, 1, file);
    assert.equal([...html.matchAll(/gtag\('config', 'AW-18197209529'\)/g)].length, 1, file);

    const page = setup("synchronous");
    for (const [link] of phoneLinks) {
      assert.match(link, /onclick="return gtag_report_conversion\(this\.href\);"/, file);
      const href = link.match(/href="([^"]+)"/)[1];
      const handler = link.match(/onclick="([^"]+)"/)[1];
      const priorEvents = page.events.length;
      page.context.linkUnderTest = { href };
      const result = vm.runInContext(`(function () { ${handler} }).call(linkUnderTest)`, page.context);
      assert.equal(result, false, file);
      assert.equal(page.events.length, priorEvents + 1, file);
      assert.equal(page.navigations.at(-1), href, file);
      checkedLinks++;
    }
    for (const [tag] of html.matchAll(/<[^>]+onclick="[^"]*gtag_report_conversion[^>]*>/g)) {
      assert.match(tag, /<a\b[^>]*href="tel:/, `${file}: only phone links should report this conversion`);
    }
    assert.doesNotMatch(html, /function\s+gtag_report_conversion/, `${file}: do not duplicate the shared helper inline`);
  }
  assert.ok(checkedLinks > 100, "check the entire site's phone links");
});
