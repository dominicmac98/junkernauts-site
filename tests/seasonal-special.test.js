import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const publicDir = new URL("../public/", import.meta.url);
const files = (await readdir(publicDir)).filter((file) => file.endsWith(".html"));
const pages = await Promise.all(files.map(async (file) => ({
  file, html: await readFile(new URL(file, publicDir), "utf8"),
})));
const discount = pages.find((page) => page.file === "discount.html").html;
const title = "End of the Year Special | Junkernauts Junk Removal";
const description = "Save with the End of the Year Special from Junkernauts Junk Removal for qualifying Southeast Michigan junk removal jobs. Ask about current cleanup discounts.";

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map((match) => [match[1].toLowerCase(), match[2] ?? match[3]]));
}

test("all promotional banners use the year-end name without changing their destination or offer copy", () => {
  let count = 0;
  for (const { file, html } of pages) {
    const banners = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
      .filter((match) => attributes(match[1]).class?.split(/\s+/).includes("promo-banner"));
    assert.equal(banners.length, file === "404.html" ? 0 : 1, file);
    for (const [, tag, body] of banners) {
      const attrs = attributes(tag);
      assert.equal(attrs.href, "discount", `${file}: preserve the existing promotion URL`);
      assert.equal(attrs["aria-label"], "End of the Year Special details", file);
      assert.match(body, /<span>End of the Year Special<\/span>/, file);
      assert.match(body, /<strong>Call or text to ask about current cleanup discounts\.<\/strong>/, file);
      count++;
    }
  }
  assert.equal(count, pages.filter((page) => page.file !== "404.html").length);
});

test("public HTML no longer advertises the superseded summer promotion", () => {
  for (const { file, html } of pages) {
    assert.ok(!/summer\s+cleanup\s+(?:special|discount)|summer\s+savings|save\s+this\s+summer/i.test(html), `${file}: stale summer promotion`);
  }
  assert.match(discount, /<div class="eyebrow">End of the Year Special<\/div>/);
});

test("discount search, social, and structured metadata use the same year-end promotion", () => {
  assert.equal(discount.match(/<title>([^<]*)<\/title>/)?.[1], title);
  const meta = [...discount.matchAll(/<meta\b[^>]*>/g)].map((match) => attributes(match[0]));
  for (const [name, value] of [
    ["description", description], ["og:title", title], ["og:description", description],
    ["twitter:title", title], ["twitter:description", description],
    ["og:url", "https://getjunkernauts.com/discount"],
  ]) {
    const matches = meta.filter((tag) => (tag.name ?? tag.property) === name);
    assert.equal(matches.length, 1, name);
    assert.equal(matches[0].content, value, name);
  }
  const schemas = [...discount.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1])).flatMap((schema) => schema["@graph"] ?? [schema]);
  const webPages = schemas.filter((schema) => schema["@type"] === "WebPage");
  assert.equal(webPages.length, 1);
  assert.equal(webPages[0].name, title);
  assert.equal(webPages[0].description, description);
  assert.equal(webPages[0].url, "https://getjunkernauts.com/discount");
  assert.equal(webPages[0]["@id"], "https://getjunkernauts.com/discount#webpage");
});

test("renaming the special preserves its qualification terms and estimate links", () => {
  for (const copy of [
    "We will confirm any discount and your final price before work begins.",
    "The cleanup discount is available for a limited time on select jobs.",
    "Eligibility can depend on load size, access, route timing, and appointment availability.",
    "No appointment is required to receive an estimate.",
    "We review the job size, location, access, and schedule to see what savings may apply.",
    "If the job qualifies, we confirm the discounted price before any lifting or hauling starts.",
  ]) {
    assert.ok(discount.includes(copy), `retain offer term: ${copy}`);
  }
  assert.match(discount, /<link rel="canonical" href="https:\/\/getjunkernauts\.com\/discount"/);
  assert.equal([...discount.matchAll(/<a class="btn [^"]*" href="quote">Get a Fast Estimate<\/a>/g)].length, 2);
  assert.match(discount, /href="tel:\+17344808190" onclick="return gtag_report_conversion\(this\.href\);"/);
});
