import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const publicDir = path.resolve(import.meta.dirname, "../public");
const origin = "https://getjunkernauts.com";
const routeFor = (pathname) => pathname.replace(/\.html$/, "").replace(/\/$/, "").replace(/^\/index$/, "") || "/";

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map((match) => [match[1].toLowerCase(), match[2] ?? match[3]]));
}

function bodyMarkup(html) {
  return (html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "")
    .replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
}

const pages = new Map(await Promise.all(
  (await readdir(publicDir)).filter((file) => file.endsWith(".html")).map(async (file) => {
    const html = await readFile(path.join(publicDir, file), "utf8");
    const body = bodyMarkup(html);
    const anchors = [...body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
      .map((match) => ({ ...attributes(match[1]), content: match[2] }));
    return [routeFor(`/${file}`), { file, html, body, anchors }];
  }),
));

function localTarget(href, route) {
  if (!href) return null;
  const url = new URL(href.replaceAll("&amp;", "&"), `${origin}${route}`);
  return ["getjunkernauts.com", "www.getjunkernauts.com"].includes(url.hostname) ? url : null;
}

test("ordinary copy does not use the retired automatic keyword links", () => {
  for (const { file, html } of pages.values()) {
    assert.doesNotMatch(html, /\bclass=["'][^"']*\bcontent-link\b|content-links-20261101\.css/, file);
  }
});

test("links remain readable and do not contain nested anchors", () => {
  for (const { file, anchors } of pages.values()) {
    for (const anchor of anchors) {
      assert.doesNotMatch(anchor.content, /<a\b/i, `${file}: nested anchor`);
      const text = anchor.content.replace(/<[^>]*>/g, "").trim();
      const imageAlt = [...anchor.content.matchAll(/<img\b[^>]*>/gi)]
        .some((match) => attributes(match[0]).alt?.trim());
      assert.ok(text || anchor["aria-label"]?.trim() || imageAlt,
        `${file}: empty link to ${anchor.href}`);
    }
  }
});

test("local links resolve and section links target existing IDs", async () => {
  for (const [route, { file, anchors }] of pages) {
    for (const { href } of anchors) {
      const url = localTarget(href, route);
      if (!url) continue;
      const pathname = decodeURIComponent(url.pathname);
      const target = pages.get(routeFor(pathname));
      if (!target) await access(path.join(publicDir, pathname));
      if (url.hash) {
        assert.ok(target, `${file}: section link must target an HTML page: ${href}`);
        const id = decodeURIComponent(url.hash.slice(1));
        const ids = [...target.body.matchAll(/\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
          .map((match) => match[1] ?? match[2]);
        assert.ok(ids.includes(id), `${file}: missing section ${href}`);
      }
    }
  }
});

test("every sitemap page stays reachable from the homepage through static links", async () => {
  const sitemap = await readFile(path.join(publicDir, "sitemap.xml"), "utf8");
  const expected = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => routeFor(new URL(match[1]).pathname));
  const visited = new Set();
  const pending = ["/"];
  while (pending.length) {
    const route = pending.pop();
    if (visited.has(route)) continue;
    const page = pages.get(route);
    if (!page) continue;
    visited.add(route);
    for (const { href } of page.anchors) {
      const url = localTarget(href, route);
      if (url) pending.push(routeFor(decodeURIComponent(url.pathname)));
    }
  }
  assert.deepEqual(expected.filter((route) => !visited.has(route)), []);
});
