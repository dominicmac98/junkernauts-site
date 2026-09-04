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
    "commercial-junk-removal.html",
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
    assert.match(html, /assets\/junkernauts-icon-512\.png/, page);
    assert.doesNotMatch(html, /<div class="photo-grid">/, page);
  }
});

test("real job pages lead with their before and after photos", async () => {
  const pages = [
    "basement-cleanouts.html",
    "construction-debris-removal.html",
    "junk-removal-ann-arbor-mi.html",
  ];

  for (const page of pages) {
    const html = await readFile(path.join(publicDir, page), "utf8");
    const introIndex = html.indexOf("job-comparison-intro");
    const firstHeadingIndex = html.indexOf("<h2>");
    const lowerPhotoIndex = html.lastIndexOf('class="seo-photo');

    assert.match(html, /real-job-photo-order-20260828\.css/, page);
    assert.ok(introIndex > 0 && introIndex < firstHeadingIndex, `${page} should show the comparison first`);
    assert.ok(lowerPhotoIndex > firstHeadingIndex, `${page} should move the single photo below the page copy`);
    assert.match(html.slice(introIndex, firstHeadingIndex), /Before:[\s\S]*After:/, page);
  }

  const construction = await readFile(path.join(publicDir, "construction-debris-removal.html"), "utf8");
  assert.match(construction, /photo-grid deck-demo-grid job-comparison-intro/);
});

test("furniture removal includes a distinct curbside pickup before and after", async () => {
  const html = await readFile(path.join(publicDir, "furniture-removal.html"), "utf8");

  assert.match(html, /<h2>Recent Curbside Pickup<\/h2>/);
  assert.match(html, /assets\/curbside-pickup-before\.jpg/);
  assert.match(html, /assets\/curbside-pickup-after-private\.jpg/);
  assert.doesNotMatch(html, /<h2>Recent Pool Table Removal<\/h2>/);
});

test("before-and-after photo grids reset markup dimensions for consistent crops", async () => {
  const styles = await readFile(path.join(publicDir, "styles-20260611-passive-glow.css"), "utf8");

  assert.match(
    styles,
    /\.photo-card img \{[\s\S]*width: 100%;[\s\S]*height: auto;[\s\S]*aspect-ratio: 4 \/ 3;[\s\S]*object-fit: cover;[\s\S]*\}/,
  );
});

test("commercial junk removal is linked from the service hub and sitemap", async () => {
  const commercial = await readFile(path.join(publicDir, "commercial-junk-removal.html"), "utf8");
  const services = await readFile(path.join(publicDir, "services.html"), "utf8");
  const sitemap = await readFile(path.join(publicDir, "sitemap.xml"), "utf8");
  const htmlFiles = (await collect(publicDir)).filter(
    (filePath) => path.extname(filePath).toLowerCase() === ".html",
  );

  assert.match(commercial, /<title>Commercial Junk Removal \| Junkernauts Junk Removal<\/title>/);
  assert.match(commercial, /https:\/\/getjunkernauts\.com\/commercial-junk-removal/);
  assert.match(commercial, /service-photo-placeholder/);
  assert.match(services, /href="commercial-junk-removal">Commercial Junk Removal -&gt;<\/a>/);
  assert.match(sitemap, /https:\/\/getjunkernauts\.com\/commercial-junk-removal/);

  for (const htmlPath of htmlFiles) {
    const html = await readFile(htmlPath, "utf8");
    assert.match(html, /href="commercial-junk-removal">Commercial Junk Removal<\/a>/, path.basename(htmlPath));
  }
});

test("service navigation mirrors the Google Business Profile services", async () => {
  const htmlFiles = (await collect(publicDir)).filter(
    (filePath) => path.extname(filePath).toLowerCase() === ".html",
  );
  const expectedLinks = [
    ["furniture-removal", "Furniture Removal"],
    ["appliance-removal", "Appliance Removal"],
    ["garage-cleanouts", "Garage &amp; Basement Cleanouts"],
    ["estate-cleanouts", "Estate &amp; Property Cleanouts"],
    ["construction-debris-removal", "Construction Debris"],
    ["commercial-junk-removal", "Commercial Junk Removal"],
  ];

  for (const htmlPath of htmlFiles) {
    const html = await readFile(htmlPath, "utf8");
    const page = path.basename(htmlPath);

    for (const [href, label] of expectedLinks) {
      assert.match(html, new RegExp(`href="${href}">${label}<\\/a>`), page);
    }
  }

  const services = await readFile(path.join(publicDir, "services.html"), "utf8");
  for (const [, label] of expectedLinks) {
    assert.match(services, new RegExp(`<h3>${label}<\\/h3>`));
  }
});

test("every public page shows the daily business hours and structured hours", async () => {
  const htmlFiles = (await collect(publicDir)).filter(
    (filePath) => path.extname(filePath).toLowerCase() === ".html",
  );

  for (const htmlPath of htmlFiles) {
    const html = await readFile(htmlPath, "utf8");
    const page = path.basename(htmlPath);

    assert.match(
      html,
      /<p class="footer-contact"><strong>Hours:<\/strong><br \/>Monday: 8 AM - 6 PM<br \/>Tuesday: 8 AM - 6 PM<br \/>Wednesday: 8 AM - 6 PM<br \/>Thursday: 8 AM - 6 PM<br \/>Friday: 8 AM - 6 PM<br \/>Saturday: 8 AM - 6 PM<br \/>Sunday: 8 AM - 6 PM<\/p>/,
      page,
    );
    assert.match(html, /"openingHoursSpecification": \{[\s\S]*"dayOfWeek": \[[\s\S]*"Monday"[\s\S]*"Sunday"[\s\S]*"opens": "08:00"[\s\S]*"closes": "18:00"/, page);
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
