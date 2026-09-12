import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const publicDir = path.resolve(import.meta.dirname, "../public");
const origin = "https://getjunkernauts.com";
const businessId = `${origin}/#business`;
const serviceRoutes = new Set([
  "/appliance-removal", "/basement-cleanouts", "/commercial-junk-removal",
  "/construction-debris-removal", "/estate-cleanouts", "/furniture-removal",
  "/garage-cleanouts", "/services",
]);

function decode(value = "") {
  const entities = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity) => {
    if (entity.startsWith("#")) {
      return String.fromCodePoint(entity[1].toLowerCase() === "x"
        ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
    }
    return entities[entity.toLowerCase()];
  });
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map((match) => [match[1].toLowerCase(), decode(match[2] ?? match[3])]));
}

function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((match) => attributes(match[0]));
}

function text(html) {
  return decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function metadata(head, key) {
  const matches = tags(head, "meta").filter((tag) => (tag.name ?? tag.property) === key);
  assert.equal(matches.length, 1, `${key} must occur exactly once in the static head`);
  assert.ok(matches[0].content?.trim(), `${key} must not be empty`);
  return matches[0].content;
}

function nodes(head) {
  return [...head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => attributes(match[1]).type === "application/ld+json")
    .flatMap((match) => {
      const value = JSON.parse(match[2]);
      return Array.isArray(value) ? value : value["@graph"] ?? [value];
    });
}

function hasType(node, type) {
  return [node["@type"]].flat().includes(type);
}

const pages = await Promise.all((await readdir(publicDir)).filter((file) => file.endsWith(".html"))
  .map(async (file) => {
    const html = await readFile(path.join(publicDir, file), "utf8");
    const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
    const route = file === "index.html" ? "/" : `/${file.slice(0, -5)}`;
    return { file, html, head, route, url: `${origin}${route}` };
  }));
const indexable = pages.filter((page) => !tags(page.head, "meta")
  .some((tag) => tag.name === "robots" && /\bnoindex\b/i.test(tag.content)));
const sitemap = await readFile(path.join(publicDir, "sitemap.xml"), "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => decode(match[1]));

test("sitemap contains exactly the canonical, indexable HTML pages", () => {
  assert.ok(indexable.length > 0);
  assert.equal(new Set(sitemapUrls).size, sitemapUrls.length, "sitemap must not contain duplicates");
  assert.deepEqual([...sitemapUrls].sort(), indexable.map((page) => page.url).sort());
  for (const page of indexable) {
    const canonical = tags(page.head, "link").filter((tag) => tag.rel === "canonical");
    assert.deepEqual(canonical.map((tag) => tag.href), [page.url], page.file);
    assert.ok(!/\?|#|\.html$/.test(page.url), `${page.file}: canonical must use the clean route`);
  }
});

test("indexable pages have unique static search and complete social metadata", async () => {
  const titles = new Map();
  const descriptions = new Map();
  for (const page of indexable) {
    const titleTags = [...page.head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
    assert.equal(titleTags.length, 1, page.file);
    const title = text(titleTags[0][1]);
    const description = metadata(page.head, "description");
    assert.ok(title, `${page.file}: empty title`);
    assert.ok(!titles.has(title), `${page.file}: title duplicates ${titles.get(title)}`);
    assert.ok(!descriptions.has(description), `${page.file}: description duplicates ${descriptions.get(description)}`);
    titles.set(title, page.file);
    descriptions.set(description, page.file);
    assert.equal(metadata(page.head, "og:title"), title, page.file);
    assert.equal(metadata(page.head, "og:description"), description, page.file);
    assert.equal(metadata(page.head, "og:url"), page.url, page.file);
    assert.equal(metadata(page.head, "og:type"), "website", page.file);
    assert.equal(metadata(page.head, "og:site_name"), "Junkernauts Junk Removal", page.file);
    const imageUrl = new URL(metadata(page.head, "og:image"));
    assert.equal(imageUrl.origin, origin, page.file);
    assert.match(metadata(page.head, "og:image:type"), /^image\/(?:png|jpeg|webp)$/);
    assert.ok(Number(metadata(page.head, "og:image:width")) > 0, page.file);
    assert.ok(Number(metadata(page.head, "og:image:height")) > 0, page.file);
    assert.ok(metadata(page.head, "og:image:alt").trim(), page.file);
    await access(path.join(publicDir, decodeURIComponent(imageUrl.pathname)));
    assert.equal(metadata(page.head, "twitter:card"), "summary_large_image", page.file);
    assert.equal(metadata(page.head, "twitter:title"), title, page.file);
    assert.equal(metadata(page.head, "twitter:description"), description, page.file);
    assert.equal(metadata(page.head, "twitter:image"), imageUrl.href, page.file);
    assert.ok(metadata(page.head, "twitter:image:alt").trim(), page.file);
  }
});

test("business and page schema use consistent public identifiers", () => {
  for (const page of pages.filter((page) => page.file !== "404.html")) {
    const businesses = nodes(page.head).filter((node) => hasType(node, "LocalBusiness"));
    assert.equal(businesses.length, 1, `${page.file}: one business definition`);
    assert.equal(businesses[0]["@id"], businessId, page.file);
    assert.equal(businesses[0].name, "Junkernauts Junk Removal", page.file);
    assert.equal(businesses[0].url, `${origin}/`, page.file);
  }
  for (const page of indexable) {
    const graph = nodes(page.head);
    const webPages = graph.filter((node) => hasType(node, "WebPage"));
    assert.equal(webPages.length, 1, `${page.file}: one WebPage definition`);
    assert.equal(webPages[0]["@id"], `${page.url}#webpage`, page.file);
    assert.equal(webPages[0].url, page.url, page.file);
    const websites = graph.filter((node) => hasType(node, "WebSite"));
    assert.equal(websites.length, page.route === "/" ? 1 : 0, page.file);
    if (websites.length) assert.equal(websites[0]["@id"], `${origin}/#website`, page.file);
    const services = graph.filter((node) => hasType(node, "Service"));
    const isCity = /^\/junk-removal-.+-mi$/.test(page.route);
    assert.equal(services.length, serviceRoutes.has(page.route) || isCity ? 1 : 0, page.file);
    for (const service of services) {
      assert.equal(service.provider?.["@id"], businessId, page.file);
      assert.equal(service.url, page.url, page.file);
      const areas = [service.areaServed].flat().filter(Boolean);
      assert.ok(areas.length > 0, `${page.file}: service area is required`);
      assert.ok(areas.every((area) => typeof area === "string" ? area.trim() : area.name?.trim()), page.file);
      if (isCity) {
        const city = page.route.slice("/junk-removal-".length, -3).replaceAll("-", " ");
        assert.ok(areas.some((area) => (typeof area === "string" ? area : area.name)
          .toLowerCase().replace(/,?\s+(?:mi|michigan)$/i, "") === city), `${page.file}: area must match the city`);
      }
    }
  }
});

test("visible breadcrumbs match schema and link to real canonical parent pages", () => {
  for (const page of indexable.filter((page) => page.route !== "/")) {
    const navs = [...page.html.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/gi)]
      .filter((match) => attributes(match[1]).class?.split(/\s+/).includes("breadcrumbs"));
    assert.equal(navs.length, 1, page.file);
    assert.equal(attributes(navs[0][1])["aria-label"], "Breadcrumb", page.file);
    assert.doesNotMatch(navs[0][1], /\bhidden\b|display\s*:\s*none/i, page.file);
    const visibleItems = [...navs[0][2].matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi)];
    const breadcrumbs = nodes(page.head).filter((node) => hasType(node, "BreadcrumbList"));
    assert.equal(breadcrumbs.length, 1, page.file);
    const schemaItems = breadcrumbs[0].itemListElement;
    assert.ok(Array.isArray(schemaItems) && schemaItems.length >= 2, page.file);
    assert.equal(visibleItems.length, schemaItems.length, page.file);
    for (const [index, item] of schemaItems.entries()) {
      const visible = visibleItems[index];
      assert.equal(item.position, index + 1, page.file);
      assert.equal(item["@type"], "ListItem", page.file);
      assert.equal(text(visible[2]), item.name, `${page.file}: breadcrumb text must match schema`);
      const itemUrl = typeof item.item === "string" ? item.item : item.item?.["@id"];
      if (index === schemaItems.length - 1) {
        assert.match(visible[0], /aria-current=["']page["']/, `${page.file}: final breadcrumb marks current page`);
        if (itemUrl) assert.equal(itemUrl, page.url, page.file);
      } else {
        const links = tags(visible[2], "a");
        assert.equal(links.length, 1, page.file);
        const linkUrl = new URL(links[0].href, page.url).href;
        assert.equal(linkUrl, itemUrl, page.file);
        assert.ok(sitemapUrls.includes(linkUrl), `${page.file}: breadcrumb parent must be indexable`);
        if (index === 0) assert.equal(linkUrl, `${origin}/`, page.file);
      }
    }
  }
});

test("utility pages cannot be indexed and the error page works on nested missing routes", () => {
  for (const file of ["confirmation.html", "quote-thanks.html", "thanks.html", "404.html"]) {
    const page = pages.find((page) => page.file === file);
    assert.ok(page, `${file} must exist`);
    const robots = metadata(page.head, "robots").toLowerCase().split(/\s*,\s*/);
    assert.ok(robots.includes("noindex") && robots.includes("follow"), file);
    assert.ok(!robots.includes("nofollow"), file);
    assert.ok(!sitemapUrls.includes(page.url), file);
  }
  const errorPage = pages.find((page) => page.file === "404.html");
  assert.equal(tags(errorPage.head, "link").filter((tag) => tag.rel === "canonical").length, 0);
  for (const tag of [...tags(errorPage.html, "a"), ...tags(errorPage.html, "link"),
    ...tags(errorPage.html, "img"), ...tags(errorPage.html, "script")]) {
    const reference = tag.href ?? tag.src;
    if (!reference || /^(?:https?:|mailto:|tel:|data:|#)/i.test(reference)) continue;
    assert.ok(reference.startsWith("/"), `404.html: ${reference} must resolve from any nested URL`);
  }
});

test("robots permits public crawling and declares the production sitemap", async () => {
  const robots = await readFile(path.join(publicDir, "robots.txt"), "utf8");
  assert.match(robots, /^User-agent:\s*\*\s*$/mi);
  assert.doesNotMatch(robots, /^Disallow:\s*\/\s*$/mi);
  assert.match(robots, /^Sitemap:\s*https:\/\/getjunkernauts\.com\/sitemap\.xml\s*$/mi);
  assert.match(sitemap, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
});

test("every image reserves its layout size and retains an explicit alt attribute", () => {
  for (const page of pages) {
    for (const image of tags(page.html, "img")) {
      assert.ok(Number(image.width) > 0 && Number(image.height) > 0, `${page.file}: ${image.src} needs dimensions`);
      assert.ok(Object.hasOwn(image, "alt"), `${page.file}: ${image.src} needs alt text or an explicit decorative alt`);
      if (/junkernauts-icon-512-optimized/.test(image.src)) assert.equal(image.loading, "lazy", page.file);
    }
  }
});
