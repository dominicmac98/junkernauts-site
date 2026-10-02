import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const section = html.match(/<section\b[^>]*id="reviews"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? "";
const googleUrl = "https://www.google.com/maps/place/Junkernauts+Junk+Removal/@42.2068029,-83.405485,10z/data=!3m1!4b1!4m6!3m5!1s0x269dd473619aca25:0x666cf24569d9cf63!8m2!3d42.2068029!4d-83.405485!16s%2Fg%2F11nr10jbj7";

function decode(value) {
  const entities = { amp: "&", quot: '"', apos: "'", ldquo: "\u201c", rdquo: "\u201d", hellip: "\u2026", middot: "\u00b7", nbsp: " " };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|ldquo|rdquo|hellip|middot|nbsp);/gi, (_, entity) => {
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

function text(value) {
  return decode(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

const cards = [...section.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
  .map((match) => ({ ...attributes(match[1]), body: match[2] }))
  .filter((card) => card.class?.split(/\s+/).includes("review-card"));

test("homepage Google review summary matches the verified six-review profile", () => {
  assert.ok(section, "reviews must remain in the static homepage HTML");
  const ratings = [...section.matchAll(/<strong\b[^>]*\bdata-google-rating(?:\s|>)[\s\S]*?<\/strong>/g)];
  const counts = [...section.matchAll(/<span\b[^>]*\bdata-google-count(?:\s|>)[\s\S]*?<\/span>/g)];
  assert.equal(ratings.length, 1);
  assert.equal(counts.length, 1);
  assert.equal(text(ratings[0][0]), "5.0 on Google");
  assert.equal(text(counts[0][0]), "6 customer reviews");
});

test("homepage preserves all six distinct Google reviews and the three existing Yelp reviews", () => {
  const ids = cards.map((card) => card["data-review-id"]);
  assert.equal(cards.length, 9);
  assert.equal(new Set(ids).size, cards.length, "review card IDs must be unique");
  assert.deepEqual(ids.filter((id) => id.startsWith("google-")).sort(), [
    "google-bijan-shahidi", "google-terry-bingham", "google-cassie-professional",
    "google-cassie-fast", "google-sam-extra-star", "google-jonathan-deck-boards",
  ].sort());
  assert.deepEqual(ids.filter((id) => id.startsWith("yelp-")).sort(), [
    "yelp-jonathan-deck-boards", "yelp-riley-helpful", "yelp-ld-pool-table",
  ].sort());
  for (const card of cards.filter((card) => card["data-review-id"].startsWith("yelp-"))) {
    assert.equal(card.href, "https://www.yelp.com/biz/junkernauts-junk-removal-ypsilanti");
    assert.match(card.body, /Yelp Review/);
  }
});

test("new verified Google reviews lead the carousel with accurate excerpts and attribution", () => {
  const expected = [
    { id: "google-bijan-shahidi", author: "Bijan Shahidi", quote: "Best guys to hire. \u2026 I would hire them back again." },
    { id: "google-terry-bingham", author: "Terry Bingham", quote: "Did a great job and took care of years of clutter." },
  ];
  for (const [index, review] of expected.entries()) {
    const card = cards[index];
    assert.equal(card?.["data-review-id"], review.id);
    assert.equal(card.href, googleUrl);
    assert.equal(card.target, "_blank");
    assert.ok(card.rel.split(/\s+/).includes("noopener"));
    assert.ok(card["aria-label"].includes(review.author));
    assert.ok(card["aria-label"].includes("Google"));
    const quote = card.body.match(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/)?.[1];
    assert.ok(quote);
    assert.equal(text(quote), `\u201c${review.quote}\u201d`);
    const meta = card.body.match(/<div class="review-meta">([\s\S]*?)<\/div>/)?.[1];
    assert.ok(meta);
    assert.equal(text(meta), `${review.author} Google customer`, "do not invent a review date");
    const stars = card.body.match(/<span\b([^>]*class="review-stars"[^>]*)>([\s\S]*?)<\/span>/);
    assert.ok(stars);
    assert.equal(attributes(stars[1])["aria-label"], "5 out of 5 stars");
    assert.equal(text(stars[2]), "\u2605".repeat(5));
    assert.match(card.body, /Google Review/);
    assert.match(card.body, /Read the complete review/);
  }
});

test("homepage retains accessible carousel controls and links to the original review platforms", () => {
  assert.match(section, /data-review-carousel\b[^>]*aria-roledescription="carousel"/);
  assert.match(section, /data-review-stage\b/);
  assert.match(section, /<button\b[^>]*data-review-previous\b[^>]*aria-label="Show previous review"/);
  assert.match(section, /<button\b[^>]*data-review-next\b[^>]*aria-label="Show next review"/);
  assert.match(section, /data-review-dots\b[^>]*aria-label="Choose a review"/);
  assert.match(section, /data-review-status\b[^>]*aria-live="polite"/);
  assert.match(section, />View Google Reviews<\/a>/);
  assert.match(section, />View Yelp Reviews<\/a>/);
  assert.match(html, /<script\b[^>]*src="reviews-carousel-20260723\.js(?:\?[^"]*)?"/);
});
