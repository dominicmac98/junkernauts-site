import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const publicDir = path.resolve(import.meta.dirname, "../public");
const origin = "https://getjunkernauts.com";
const retainedCities = ["ann-arbor", "ypsilanti", "detroit", "canton", "livonia", "novi", "brighton", "dearborn"];
const retiredCities = ["farmington-hills", "monroe", "pontiac", "port-huron", "rochester-hills", "royal-oak", "saline", "southfield", "sterling-heights", "taylor", "troy", "warren", "westland"];
const route = city => `/junk-removal-${city}-mi`;
const retainedRoutes = retainedCities.map(route);
const retiredRoutes = new Set(retiredCities.map(route));
const normalize = pathname => pathname.replace(/\/$/, "").replace(/\.html$/, "");
const files = await readdir(publicDir);
const htmlPages = await Promise.all(files.filter(file => file.endsWith(".html"))
  .map(async file => ({ file, html: await readFile(path.join(publicDir, file), "utf8") })));
const sitemap = await readFile(path.join(publicDir, "sitemap.xml"), "utf8");
const sitemapRoutes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname);
const redirects = (await readFile(path.join(publicDir, "_redirects"), "utf8"))
  .split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#"))
  .map(line => line.split(/\s+/));

test("only the eight chosen city pages remain published and in the sitemap", () => {
  const cityFiles = files.filter(file => /^junk-removal-.+-mi\.html$/.test(file));
  assert.deepEqual(cityFiles.sort(), retainedRoutes.map(route => `${route.slice(1)}.html`).sort());
  assert.deepEqual(sitemapRoutes.filter(route => /^\/junk-removal-.+-mi$/.test(route)).sort(), [...retainedRoutes].sort());
});

test("retired city URLs redirect directly to the service-area hub in every supported form", () => {
  for (const cleanRoute of retiredRoutes) {
    for (const source of [cleanRoute, `${cleanRoute}.html`, `${cleanRoute}/`]) {
      const matches = redirects.filter(rule => rule[0] === source);
      assert.equal(matches.length, 1, `${source}: require one unambiguous rule`);
      assert.deepEqual(matches[0], [source, "/service-areas", "301"], `${source}: no intermediate city redirect or fragment`);
    }
  }
  assert.ok(!redirects.some(rule => rule[0] === "/service-areas"), "the redirect destination must not redirect again");
  for (const retainedRoute of retainedRoutes) {
    assert.ok(!redirects.some(rule => rule[0] === retainedRoute), `${retainedRoute}: retain the clean city URL`);
  }
});

test("published HTML links bypass retired city URLs", () => {
  for (const { file, html } of htmlPages) {
    for (const match of html.matchAll(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')/g)) {
      const href = (match[1] ?? match[2]).replaceAll("&amp;", "&");
      const url = new URL(href, `${origin}/${file === "index.html" ? "" : file.replace(/\.html$/, "")}`);
      if (!["getjunkernauts.com", "www.getjunkernauts.com"].includes(url.hostname)) continue;
      assert.ok(!retiredRoutes.has(normalize(decodeURIComponent(url.pathname))), `${file}: replace retired link ${href}`);
    }
  }
});

test("the service-area hub preserves coverage and the moved Monroe project anchors", () => {
  const hub = htmlPages.find(page => page.file === "service-areas.html");
  assert.ok(hub);
  const ids = [...hub.html.matchAll(/\bid\s*=\s*(?:"([^"]+)"|'([^']+)')/g)].map(match => match[1] ?? match[2]);
  for (const id of ["other-communities", "monroe-decking-removal"]) {
    assert.equal(ids.filter(value => value === id).length, 1, `hub: preserve exactly one #${id}`);
  }
  for (const file of ["index.html", "construction-debris-removal.html"]) {
    const page = htmlPages.find(page => page.file === file);
    assert.match(page.html, /href="\/?service-areas#monroe-decking-removal"/, `${file}: link straight to the moved project`);
  }
});
