import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const publicDir = new URL("../public/", import.meta.url);
const photoPrefix = "assets/south-lyon-shed-demolition-";
const photoStages = [
  ["before", "Before"],
  ["after", "After"],
  ["front-before", "Before"],
  ["roof-removal", "During"],
  ["walls-removal", "During"],
  ["cleared-site", "After"],
];

const readPublic = (file) => readFile(new URL(file, publicDir), "utf8");

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map((match) => [match[1].toLowerCase(), match[2] ?? match[3]]));
}

function projectFigures(html) {
  return [...html.matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi)]
    .map((match) => ({
      image: attributes(match[1].match(/<img\b[^>]*>/i)?.[0] ?? ""),
      caption: match[1].match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1]
        .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
    }))
    .filter(({ image }) => image.src?.startsWith(photoPrefix));
}

async function assertPhoto(figure, stage, label) {
  const { image, caption } = figure;
  const full = `${photoPrefix}${stage}.webp`;
  const small = `${photoPrefix}${stage}-800.webp`;
  assert.equal(image.src, full);
  assert.equal(image.width, "1600", full);
  assert.equal(image.height, "1200", full);
  assert.equal(image.loading, "lazy", full);
  assert.equal(image.decoding, "async", full);
  assert.ok(image.alt?.length > 20, `${full}: describe the actual project photo`);
  assert.match(image.alt, /shed|site|backyard/i, full);
  assert.ok(image.sizes?.trim(), `${full}: responsive image sizes`);
  assert.deepEqual(new Set(image.srcset?.split(",").map((value) => value.trim())),
    new Set([`${small} 800w`, `${full} 1600w`]), full);
  assert.match(caption ?? "", new RegExp(`^${label}\\b`, "i"), `${full}: correct project stage`);
  for (const file of [small, full]) {
    const data = await readFile(new URL(file, publicDir));
    assert.equal(data.toString("ascii", 0, 4), "RIFF", file);
    assert.equal(data.toString("ascii", 8, 12), "WEBP", file);
    assert.ok(data.length > 1000, `${file}: image contains encoded photo data`);
  }
}

test("light demolition presents all six South Lyon photos with accurate project stages", async () => {
  const html = await readPublic("light-demolition.html");
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? "";
  const copy = main.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  assert.match(html, /<h1>Light Demolition &amp; Shed Removal<\/h1>/);
  assert.match(copy, /South Lyon, Michigan/);
  assert.match(copy, /removed[^.]*inside the shed|emptied the shed|cleared[^.]*contents/i);
  assert.match(copy, /demolished the structure|dismantled the structure/i);
  assert.match(copy, /hauled away[^.]*material for disposal/i);
  const figures = projectFigures(main);
  assert.equal(figures.length, photoStages.length);
  for (const [index, [stage, label]] of photoStages.entries()) {
    await assertPhoto(figures[index], stage, label);
  }
  assert.match(main, /href="quote"/);
  assert.match(main, /href="construction-debris-removal"/);
});

test("the Services hub shows the shed before and after and links to the full project", async () => {
  const html = await readPublic("services.html");
  assert.match(html, /<h3>Light Demolition<\/h3>/);
  const section = [...html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)]
    .find((match) => attributes(match[1]).id === "light-demolition")?.[2] ?? "";
  assert.match(section, /South Lyon/);
  assert.match(section, /href="light-demolition"/);
  assert.match(section, /href="quote"/);
  const figures = projectFigures(section);
  assert.equal(figures.length, 2);
  await assertPhoto(figures[0], "before", "Before");
  await assertPhoto(figures[1], "after", "After");
});

test("every regular page exposes Light Demolition exactly once in its main navigation", async () => {
  const files = (await readdir(publicDir)).filter((file) => file.endsWith(".html") && file !== "404.html");
  assert.ok(files.includes("light-demolition.html"));
  for (const file of files) {
    const html = await readPublic(file);
    const nav = [...html.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/gi)]
      .find((match) => attributes(match[1]).class?.split(/\s+/).includes("site-nav"))?.[2] ?? "";
    const links = [...nav.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
      .filter((match) => attributes(match[1]).href === "light-demolition");
    assert.equal(links.length, 1, file);
    assert.equal(links[0][2].trim(), "Light Demolition", file);
  }
});

test("light demolition is indexed at its clean URL and linked from debris removal", async () => {
  const [sitemap, redirects, debris] = await Promise.all([
    readPublic("sitemap.xml"), readPublic("_redirects"), readPublic("construction-debris-removal.html"),
  ]);
  assert.equal([...sitemap.matchAll(/<loc>https:\/\/getjunkernauts\.com\/light-demolition<\/loc>/g)].length, 1);
  assert.equal(redirects.split(/\r?\n/)
    .filter((line) => /^\/light-demolition\.html\s+\/light-demolition\s+301\s*$/.test(line)).length, 1);
  const main = debris.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? "";
  assert.match(main, /href="light-demolition"/);
});
