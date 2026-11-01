import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { linkContent } from "../scripts/link-content.mjs";

const publicDir = path.resolve(import.meta.dirname, "../public");

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map((match) => [match[1].toLowerCase(), match[2] ?? match[3]]));
}

function contentLinks(html) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ ...attributes(match[1]), text: match[2] }))
    .filter((link) => /\bcontent-link\b/.test(link.class ?? ""));
}

function linkPairs(html) {
  return contentLinks(html).map(({ text, href }) => [text, href]);
}

test("visible headings, paragraphs, and job captions link to relevant city and service pages", () => {
  const input = '<body><h1>Furniture removal in Ann Arbor</h1>'
    + '<p>Junkernauts Junk Removal helps Novi homeowners.</p>'
    + '<figcaption>After a house cleanout in South Lyon.</figcaption></body>';
  const result = linkContent(input);
  assert.deepEqual(linkPairs(result.html), [
    ["Furniture removal", "furniture-removal"],
    ["Ann Arbor", "junk-removal-ann-arbor-mi"],
    ["Novi", "junk-removal-novi-mi"],
    ["house cleanout", "estate-cleanouts"],
    ["South Lyon", "service-areas"],
  ]);
  assert.ok(result.html.includes("Junkernauts Junk Removal helps"), "keep the business name intact");
});

test("each existing city page is used and communities without one fall back to Service Areas", () => {
  const dedicated = [
    "Ann Arbor", "Brighton", "Canton", "Dearborn", "Detroit", "Farmington Hills",
    "Livonia", "Monroe", "Novi", "Pontiac", "Port Huron", "Rochester Hills",
    "Royal Oak", "Saline", "Southfield", "Sterling Heights", "Taylor", "Troy",
    "Warren", "Westland", "Ypsilanti",
  ];
  const fallback = [
    "South Lyon", "Plymouth", "Belleville", "Milan", "Dexter", "Chelsea",
    "Pittsfield Township", "Whitmore Lake", "Van Buren Township", "Bridgewater",
    "Clinton", "Manchester", "Tecumseh",
  ];
  const result = linkContent(`<body><p>${[...dedicated, ...fallback].join("; ")}</p></body>`);
  assert.deepEqual(linkPairs(result.html), [
    ...dedicated.map((city) => [city, `junk-removal-${city.toLowerCase().replaceAll(" ", "-")}-mi`]),
    ...fallback.map((city) => [city, "service-areas"]),
  ]);
});

test("specific service categories win over shorter generic phrases", () => {
  const cases = [
    ["Commercial Junk Removal", "commercial-junk-removal"],
    ["Furniture &amp; Mattress Pickup", "furniture-removal"],
    ["Sectional couch removal", "furniture-removal"],
    ["Furniture, Couch &amp; Mattress Removal", "furniture-removal"],
    ["Appliance Removal", "appliance-removal"],
    ["Garage &amp; Basement Cleanouts", "garage-cleanouts"],
    ["Basement Cleanouts", "basement-cleanouts"],
    ["Estate &amp; Property Cleanouts", "estate-cleanouts"],
    ["Apartment cleanouts", "estate-cleanouts"],
    ["Moving cleanouts", "estate-cleanouts"],
    ["Landlord cleanouts", "estate-cleanouts"],
    ["Construction debris removal", "construction-debris-removal"],
    ["Decking pickup", "construction-debris-removal"],
    ["Light Demolition", "light-demolition"],
    ["Shed removal", "light-demolition"],
    ["Junk removal", "services"],
  ];
  const result = linkContent(`<body>${cases.map(([text]) => `<p>${text}</p>`).join("")}</body>`);
  assert.deepEqual(linkPairs(result.html), cases);
});

test("shared service suffixes link each category to its own destination", () => {
  const input = '<body><p>garage, basement, and room cleanouts</p>'
    + '<p>Furniture, mattress, and appliance pickup</p></body>';
  assert.deepEqual(linkPairs(linkContent(input).html), [
    ["garage", "garage-cleanouts"],
    ["basement", "basement-cleanouts"],
    ["room cleanouts", "estate-cleanouts"],
    ["Furniture", "furniture-removal"],
    ["mattress", "furniture-removal"],
    ["appliance pickup", "appliance-removal"],
  ]);
});

test("bare furniture and appliance categories link only in explicit service contexts", () => {
  const ordinaryObjects = '<p>Keep the furniture and appliances in this room.</p>';
  const result = linkContent(`<body><p>We remove furniture and appliances.</p>${ordinaryObjects}</body>`);
  assert.deepEqual(linkPairs(result.html), [
    ["furniture", "furniture-removal"],
    ["appliances", "appliance-removal"],
  ]);
  assert.ok(result.html.includes(ordinaryObjects));
});

test("existing links, metadata, attributes, scripts, forms, and current breadcrumbs stay untouched", () => {
  const head = '<head><title>Furniture removal in Novi</title>'
    + '<meta name="description" content="Junk removal in Ann Arbor">'
    + '<script type="application/ld+json">{"name":"Junkernauts Junk Removal","areaServed":"Novi"}</script></head>';
  const protectedBody = '<!-- Furniture removal in Novi -->'
    + '<a class="btn" href="furniture-removal#novi-sectional-removal">Furniture removal in Novi</a>'
    + '<img src="assets/novi-sectional-removal-before.webp" alt="Novi furniture removal" title="Ann Arbor > Novi">'
    + '<script>const sample = "<p>Furniture removal in Novi</p>";</script>'
    + '<style>.Novi::after { content: "Furniture removal"; }</style>'
    + '<form><label for="category">Furniture removal</label><select id="category"><option>Novi</option></select>'
    + '<textarea>Ann Arbor</textarea><button>Junk removal</button></form>'
    + '<nav><span aria-current="page">Junk Removal in Novi</span></nav>';
  const input = `<html>${head}<body>${protectedBody}</body></html>`;
  assert.equal(linkContent(input).html, input);
});

test("Monroe county coverage is distinct from the city and the brand is not a service link", () => {
  const counties = '<p>We serve Washtenaw, Monroe, Oakland, Wayne, Livingston, Lenawee, and Jackson counties.</p>';
  const cityAndCounty = '<p>Junkernauts Junk Removal serves Monroe County and customers in Monroe.</p>';
  const result = linkContent(`<body>${counties}${cityAndCounty}</body>`);
  assert.ok(result.html.includes(counties));
  assert.ok(result.html.includes("Junkernauts Junk Removal serves Monroe County"));
  assert.deepEqual(linkPairs(result.html), [["Monroe", "junk-removal-monroe-mi"]]);
});

test("adding links preserves text and entities exactly and can be rerun without nesting links", () => {
  const input = '<body><h2>Garage &amp; Basement Cleanouts</h2><p>Ann Arbor &amp; Novi: furniture removal.</p></body>';
  const first = linkContent(input);
  const restored = first.html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (whole, attrs, text) =>
    /\bcontent-link\b/.test(attributes(attrs).class ?? "") ? text : whole);
  assert.equal(restored, input);
  const second = linkContent(first.html);
  assert.equal(second.html, first.html);
  assert.equal(second.addedLinks.length, 0);
});

test("public pages have no remaining unlinked supported city or category mentions", async () => {
  for (const file of (await readdir(publicDir)).filter((name) => name.endsWith(".html"))) {
    const html = await readFile(path.join(publicDir, file), "utf8");
    const result = linkContent(html);
    assert.equal(result.addedLinks.length, 0, `${file}: run npm run links:write for new city/service mentions`);
    assert.equal(result.html, html, `${file}: link generation must be idempotent`);
  }
});

test("generated content links resolve locally, stay outside other anchors, and retain readable text", async () => {
  let generatedCount = 0;
  for (const file of (await readdir(publicDir)).filter((name) => name.endsWith(".html"))) {
    const html = await readFile(path.join(publicDir, file), "utf8");
    for (const link of contentLinks(html)) {
      generatedCount++;
      assert.ok(link.text.trim(), `${file}: empty content link`);
      assert.doesNotMatch(link.text, /<a\b/i, `${file}: nested anchor`);
      assert.match(link.href, /^[a-z0-9-]+(?:#[a-z0-9-]+)?$/, `${file}: expected a stable local route`);
      const [route, fragment] = link.href.split("#");
      const destination = path.join(publicDir, `${route}.html`);
      await access(destination);
      if (fragment) {
        const target = await readFile(destination, "utf8");
        assert.ok(target.includes(`id="${fragment}"`), `${file}: missing destination section ${link.href}`);
      }
    }
    for (const anchor of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
      assert.doesNotMatch(anchor[1], /<a\b/i, `${file}: nested anchor`);
    }
  }
  assert.ok(generatedCount > 0, "verify the published city and service mention links");
});
