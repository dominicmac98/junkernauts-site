import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const publicDir = path.join(root, "public");
const thisFile = fileURLToPath(import.meta.url);
const textExtensions = new Set([
  ".html", ".js", ".css", ".xml", ".txt", ".md", ".json", ".jsonc",
]);

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(filePath));
    else files.push(filePath);
  }
  return files;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

test("the Junkernauts repo contains no Pure Mitten branding", async () => {
  const files = await collect(root);
  const oldBrand = /pure(?:[\s_-]?mitten)|puremitten|pure%20mitten/i;
  const matches = [];

  for (const filePath of files) {
    if (filePath === thisFile) continue;
    const relative = path.relative(root, filePath);
    if (oldBrand.test(relative)) matches.push(relative);
    if (!textExtensions.has(path.extname(filePath).toLowerCase())) continue;
    if (oldBrand.test(await readFile(filePath, "utf8"))) matches.push(relative);
  }

  assert.deepEqual(matches, []);
});

test("generic service-area pages use branded placeholders instead of unrelated job photos", async () => {
  const pages = [
    "appliance-removal.html",
    "estate-cleanouts.html",
    "garage-cleanouts.html",
    "junk-removal-canton-mi.html",
    "junk-removal-dearborn-mi.html",
    "junk-removal-detroit-mi.html",
    "junk-removal-farmington-hills-mi.html",
    "junk-removal-livonia-mi.html",
    "junk-removal-monroe-mi.html",
    "junk-removal-novi-mi.html",
    "junk-removal-pontiac-mi.html",
    "junk-removal-port-huron-mi.html",
    "junk-removal-rochester-hills-mi.html",
    "junk-removal-royal-oak-mi.html",
    "junk-removal-saline-mi.html",
    "junk-removal-southfield-mi.html",
    "junk-removal-sterling-heights-mi.html",
    "junk-removal-taylor-mi.html",
    "junk-removal-troy-mi.html",
    "junk-removal-warren-mi.html",
    "junk-removal-westland-mi.html",
    "junk-removal-ypsilanti-mi.html",
  ];

  for (const page of pages) {
    const html = await readFile(path.join(publicDir, page), "utf8");
    assert.match(html, /service-photo-placeholder/, page);
    assert.doesNotMatch(html, /<div class="photo-grid">/, page);
  }
});

test("every local HTML asset and page reference resolves", async () => {
  const htmlFiles = (await collect(publicDir)).filter(
    (filePath) => path.extname(filePath).toLowerCase() === ".html",
  );
  const missing = [];

  for (const htmlPath of htmlFiles) {
    const html = await readFile(htmlPath, "utf8");
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const reference = match[1];
      if (/^(?:https?:|mailto:|tel:|#|javascript:|data:)/i.test(reference)) continue;

      const cleanReference = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
      if (!cleanReference) continue;

      let candidate = cleanReference.startsWith("/")
        ? path.join(publicDir, cleanReference.slice(1))
        : path.resolve(path.dirname(htmlPath), cleanReference);

      if (candidate === publicDir) candidate = path.join(publicDir, "index.html");
      if (await exists(candidate)) {
        const candidateStat = await stat(candidate);
        if (!candidateStat.isDirectory() || await exists(path.join(candidate, "index.html"))) continue;
      }
      if (await exists(`${candidate}.html`)) continue;

      missing.push(`${path.relative(root, htmlPath)} -> ${reference}`);
    }
  }

  assert.deepEqual(missing, []);
});
