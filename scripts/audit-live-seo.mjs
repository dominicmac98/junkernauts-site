// Read-only HTTP crawl. Optional argument: a local or preview origin to audit.
// Canonical URLs must always point to the production domain.
const canonicalOrigin = "https://getjunkernauts.com";
const auditOrigin = new URL(process.argv[2] ?? canonicalOrigin).origin;
const failures = [];
let requests = 0;

function check(condition, message) {
  if (!condition) failures.push(message);
}

function decode(value = "") {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map((match) => [match[1].toLowerCase(), decode(match[2] ?? match[3])]));
}

function metadata(head, name) {
  return [...head.matchAll(/<meta\b[^>]*>/gi)].map((match) => attributes(match[0]))
    .filter((tag) => (tag.name ?? tag.property) === name).map((tag) => tag.content);
}

async function get(url) {
  requests += 1;
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20000) });
  return { response, html: await response.text() };
}

async function parallel(items, action) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      try { await action(item); } catch (error) { failures.push(`${item}: ${error.message}`); }
    }
  }));
}

try {
  const { response: sitemapResponse, html: sitemap } = await get(`${auditOrigin}/sitemap.xml`);
  check(sitemapResponse.status === 200, `sitemap.xml: HTTP ${sitemapResponse.status}`);
  check(/(?:application|text)\/xml/.test(sitemapResponse.headers.get("content-type")), "sitemap.xml: invalid content type");
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => decode(match[1]));
  check(urls.length > 0, "sitemap.xml: no URLs");
  check(new Set(urls).size === urls.length, "sitemap.xml: duplicate URLs");
  const titles = new Map();
  const descriptions = new Map();
  const images = new Set();

  await parallel(urls, async (canonical) => {
    check(new URL(canonical).origin === canonicalOrigin, `${canonical}: unexpected sitemap origin`);
    const route = new URL(canonical).pathname;
    const { response, html } = await get(`${auditOrigin}${route}`);
    check(response.status === 200, `${route}: HTTP ${response.status}`);
    check(/text\/html/.test(response.headers.get("content-type")), `${route}: not HTML`);
    const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
    const canonicals = [...head.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0]))
      .filter((tag) => tag.rel === "canonical").map((tag) => tag.href);
    check(canonicals.length === 1 && canonicals[0] === canonical, `${route}: canonical mismatch`);
    // Cloudflare intentionally marks preview hosts noindex via a response header.
    const indexingHeader = auditOrigin === canonicalOrigin ? response.headers.get("x-robots-tag") ?? "" : "";
    check(!/noindex/i.test(`${metadata(head, "robots").join()} ${indexingHeader}`), `${route}: indexable page is noindex`);
    const titleMatches = [...head.matchAll(/<title\b[^>]*>(.*?)<\/title>/gi)];
    const title = decode(titleMatches[0]?.[1] ?? "").trim();
    check(titleMatches.length === 1 && title.length > 0, `${route}: missing or duplicate title tag`);
    check(!titles.has(title), `${route}: duplicate title with ${titles.get(title)}`);
    titles.set(title, route);
    const description = metadata(head, "description");
    check(description.length === 1 && description[0]?.trim(), `${route}: missing or duplicate description`);
    check(!descriptions.has(description[0]), `${route}: duplicate description with ${descriptions.get(description[0])}`);
    descriptions.set(description[0], route);
    const expected = {
      "og:type": "website", "og:title": title, "og:description": description[0],
      "og:url": canonical, "og:site_name": "Junkernauts Junk Removal", "twitter:card": "summary_large_image",
    };
    for (const [key, value] of Object.entries(expected)) {
      const found = metadata(head, key);
      check(found.length === 1 && found[0] === value, `${route}: invalid ${key}`);
    }
    for (const key of ["og:image", "og:image:width", "og:image:height", "og:image:type", "og:image:alt"]) {
      const found = metadata(head, key);
      check(found.length === 1 && found[0]?.trim(), `${route}: missing or duplicate ${key}`);
    }
    if (metadata(head, "og:image")[0]) images.add(metadata(head, "og:image")[0]);
    for (const script of head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (attributes(script[1]).type === "application/ld+json") JSON.parse(script[2]);
    }
  });

  await parallel([...images], async (url) => {
    const parsed = new URL(url);
    check(parsed.origin === canonicalOrigin, `${url}: social image should use production origin`);
    const { response } = await get(`${auditOrigin}${parsed.pathname}`);
    check(response.status === 200 && /^image\//.test(response.headers.get("content-type")), `${url}: unavailable social image`);
  });

  const { response: robotsResponse, html: robots } = await get(`${auditOrigin}/robots.txt`);
  check(robotsResponse.status === 200, `robots.txt: HTTP ${robotsResponse.status}`);
  check(robots.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`), "robots.txt: missing production sitemap");
  check(!/^Disallow:\s*\/\s*$/mi.test(robots), "robots.txt: blanket crawl block");

  const probe = `seo-audit-missing-${Date.now()}`;
  await parallel([`/${probe}`, `/${probe}/nested`, `/assets/${probe}.webp`], async (route) => {
    const { response } = await get(`${auditOrigin}${route}`);
    check(response.status === 404, `${route}: expected 404, received ${response.status}`);
  });

  const redirectCases = [
    ["/index.html", "/"], ["/garage-cleanouts.html", "/garage-cleanouts"],
    ["/garage-cleanouts/", "/garage-cleanouts"], ["/thanks", "/confirmation"],
    ["/quote-thanks", "/confirmation"],
  ];
  await parallel(redirectCases, async ([source, destination]) => {
    const { response } = await get(`${auditOrigin}${source}`);
    check([301, 308].includes(response.status), `${source}: expected permanent redirect, received ${response.status}`);
    check(new URL(response.headers.get("location") ?? source, auditOrigin).href === `${auditOrigin}${destination}`, `${source}: wrong redirect target`);
  });

  const { response: confirmationResponse, html: confirmation } = await get(`${auditOrigin}/confirmation`);
  check(confirmationResponse.status === 200, `confirmation: HTTP ${confirmationResponse.status}`);
  check(metadata(confirmation, "robots").some((value) => /noindex/.test(value)), "confirmation: missing noindex");
  const { response: legacyResponse } = await get(`${auditOrigin}/comments/feed/`);
  check(legacyResponse.status === 410, `comments/feed: expected 410, received ${legacyResponse.status}`);

  if (auditOrigin === canonicalOrigin) {
    await parallel(["http://getjunkernauts.com/", "https://www.getjunkernauts.com/"], async (url) => {
      const { response } = await get(url);
      check([301, 308].includes(response.status) && response.headers.get("location") === `${canonicalOrigin}/`, `${url}: missing permanent apex HTTPS redirect`);
    });
  }
  console.log(`Audited ${urls.length} sitemap pages, ${images.size} social images, crawl controls, missing routes, redirects, and legacy URLs (${requests} read-only requests) at ${auditOrigin}.`);
} catch (error) {
  failures.push(error.message);
}

if (failures.length) {
  console.error(`${failures.length} SEO audit failure(s):\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("All live SEO checks passed.");
}
