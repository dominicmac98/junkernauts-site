import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const publicDir = new URL("../public/", import.meta.url);
const readPublic = (file) => readFile(new URL(file, publicDir), "utf8");

// Copy checks ignore only the new inline mention links, retaining other markup.
const withoutContentLinks = (html) => html.replace(
  /<a\b(?=[^>]*\bclass="content-link")[^>]*>([\s\S]*?)<\/a>/gi, "$1",
);

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map((match) => [match[1].toLowerCase(), match[2] ?? match[3]]));
}

for (const file of ["junk-removal-detroit-mi.html", "construction-debris-removal.html"]) {
  test(`${file} shows the matching Detroit debris and yard waste photos`, async () => {
    const html = await readPublic(file);
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? "";
    const pair = main.match(/<div\b[^>]*class="[^"]*\bdetroit-cleanup-comparison\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    assert.ok(pair, "the two Detroit photos stay together");
    assert.match(withoutContentLinks(main), /Construction Debris &amp; Yard Waste/);
    assert.match(main, /Detroit/);
    assert.match(pair, /Before:[\s\S]*After:/);
    const images = [...pair.matchAll(/<img\b[^>]*>/g)].map((match) => attributes(match[0]));
    assert.equal(images.length, 2);
    for (const [index, stage] of ["before", "after"].entries()) {
      const full = `assets/detroit-construction-yard-cleanup-${stage}.webp`;
      const small = `assets/detroit-construction-yard-cleanup-${stage}-800.webp`;
      const image = images[index];
      assert.equal(image.src, full, "before must precede after");
      assert.equal(image.width, "1600");
      assert.equal(image.height, "1200");
      assert.equal(image.decoding, "async");
      assert.equal(image.loading, file.startsWith("junk-removal-detroit") ? "eager" : "lazy");
      assert.match(image.alt, /Detroit/);
      assert.match(image.alt, /blocks|branches/);
      assert.ok(image.sizes?.trim());
      assert.deepEqual(new Set(image.srcset.split(",").map((entry) => entry.trim())),
        new Set([`${small} 800w`, `${full} 1600w`]));
      for (const asset of [full, small]) {
        const bytes = await readFile(new URL(asset, publicDir));
        assert.equal(bytes.toString("ascii", 0, 4), "RIFF", asset);
        assert.equal(bytes.toString("ascii", 8, 12), "WEBP", asset);
      }
    }
    if (file.startsWith("junk-removal-detroit")) {
      assert.doesNotMatch(main, /service-photo-placeholder/);
      assert.ok(main.indexOf("detroit-cleanup-comparison") < main.indexOf("<h2"));
      assert.equal(images[0].fetchpriority, "high");
      assert.match(main, /href="construction-debris-removal#detroit-debris-cleanup"/);
    } else {
      assert.match(main, /href="junk-removal-detroit-mi#detroit-debris-cleanup"/);
    }
  });
}

test("homepage preserves the existing Novi and South Lyon pairs while keeping Detroit photos off the homepage", async () => {
  const html = await readPublic("index.html");
  const projectsStart = html.indexOf('id="more-local-jobs"');
  assert.ok(projectsStart >= 0, "preserve the original local-job gallery");
  const projects = html.slice(projectsStart, html.indexOf("</section>", projectsStart));
  const cards = [...projects.matchAll(/<article\b[^>]*class="home-project-card"[^>]*>([\s\S]*?)<\/article>/g)]
    .map((match) => match[1]);
  assert.equal(cards.length, 2);
  for (const [index, [prefix, city, href]] of [
    ["novi-sectional-removal", "Novi", "furniture-removal#novi-sectional-removal"],
    ["south-lyon-shed-demolition", "South Lyon", "light-demolition#south-lyon-shed-demolition"],
  ].entries()) {
    const card = cards[index];
    assert.ok(card.includes(city));
    assert.ok(card.includes(`href="${href}"`));
    const images = [...card.matchAll(/<img\b[^>]*>/g)].map((match) => attributes(match[0]));
    assert.deepEqual(images.map((image) => image.src), [
      `assets/${prefix}-before.webp`, `assets/${prefix}-after.webp`,
    ]);
    assert.match(card, /<figcaption>Before<\/figcaption>[\s\S]*<figcaption>After<\/figcaption>/);
    for (const image of images) {
      assert.equal(image.loading, "lazy");
      assert.equal(image.decoding, "async");
      assert.ok(image.alt.includes(city));
      assert.equal(image.width, "1600");
      assert.equal(image.height, "1200");
    }
  }
  assert.doesNotMatch(html, /detroit-construction-yard-cleanup|IMG_2327/i);
  for (const asset of [
    "monroe-decking-removal-before.webp", "monroe-decking-removal-after.webp",
    "ann-arbor-basement-cleanout-before.webp", "ann-arbor-basement-cleanout-after.webp",
    "ann-arbor-basement-cleanout-loaded.webp",
  ]) assert.ok(html.includes(`src="assets/${asset}"`), `preserve ${asset}`);
});

test("all service and location detail layouts load responsive overrides after older layout styles", async () => {
  const files = (await readdir(publicDir)).filter((file) => file.endsWith(".html"));
  let count = 0;
  for (const file of files) {
    const html = await readPublic(file);
    if (!/class="[^"]*\bseo-layout\b/.test(html) && file !== "light-demolition.html") continue;
    count++;
    const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? "";
    const styles = [...head.matchAll(/<link\b[^>]*>/g)].map((match) => attributes(match[0]))
      .filter((link) => link.rel === "stylesheet").map((link) => link.href.split("?")[0]);
    assert.equal(styles.filter((href) => href === "detail-layout-20261031.css").length, 1, file);
    // Header- and footer-only styles may follow without changing the content layout cascade.
    assert.equal(styles.filter((href) => !["headers-compact-20261101.css", "footer-compact-20261101.css"].includes(href)).at(-1),
      "detail-layout-20261031.css", `${file}: layout overrides load after older styles`);
  }
  assert.ok(count >= 29, "cover the shared detail-page family");
});
