# On-site SEO audit — September 12, 2026

## Scope and starting state

Audited the static HTML repository and https://getjunkernauts.com. The existing full business-name update (bff3393) and garage before/after photos (c410247) were already complete and were preserved.

All 37 sitemap URLs returned HTTP 200 with matching canonical URLs before this work. robots.txt and the sitemap were accessible; internal pages, assets, and fragments resolved. HTTP/www, .html, and trailing-slash normalization already worked. The legacy comments feed correctly returned 410. Those working controls remain unchanged.

## Implemented

- Added a standalone, noindex error page. Missing pages, nested paths, and image URLs previously returned the homepage with HTTP 200; they now return HTTP 404. Recovery links and assets use root-relative URLs so they work at any missing path.
- Added static Open Graph and Twitter metadata to all 37 indexable pages, using each page's own title, description, and canonical URL, with an existing branded image and its dimensions/alt text.
- Improved service descriptions and descriptive hub/service titles. Kept existing location URLs and their city-specific titles.
- Linked LocalBusiness, WebSite, WebPage, Service, and BreadcrumbList structured data with stable identifiers. Added visible breadcrumb navigation to the 36 non-home indexable pages. Service pages describe their actual regional scope; city pages describe the city served, not a fictional branch office. Added the existing Saline service area to homepage business data.
- Kept confirmation and redirect-alias pages out of the sitemap and consistently noindex/follow. No fabricated address, ratings, reviews, offers, or rich-result eligibility claims were added.
- Replaced repetitive body copy on furniture, appliance, basement, and estate pages with specific answers about items, access, quote factors, and disposal, plus relevant internal links. Refined Brighton copy using the existing patio-cleanout evidence.
- Made page content visible without JavaScript. Guarded theme-storage errors so they cannot interrupt navigation. Reviews use a readable static grid until carousel initialization succeeds. Existing tracking and Jobber form/preload behavior were preserved.
- Added missing image dimensions and lazy loading for below-fold shared logos/placeholders. The repeated 512px placeholder is now a new 69,728-byte WebP instead of a 357,747-byte PNG (80.5% smaller). The original asset URL still exists. Updated changed CSS/JS version queries so new markup receives the matching assets.
- Added repeatable SEO and progressive-enhancement regression tests plus a read-only live crawl script.

## Search intent addressed

These are page-content targets, not measured query rankings or search volumes.

| Customer intent | Existing destination |
| --- | --- |
| Junk removal in Ypsilanti, Ann Arbor, or a supported city | Homepage and corresponding city page |
| Couch, mattress, furniture, or appliance pickup | Furniture and appliance service pages |
| Garage, basement, estate, or property cleanout | Relevant cleanout service page |
| Junk removal cost and load sizes | Pricing page |
| Photo estimate versus an on-site quote | Quote and booking pages |

## Validation

- 35 Node tests pass, including existing booking/calendar behavior and new metadata, sitemap, schema, breadcrumbs, error-page, image-dimension, and script-failure coverage.
- All 35 JavaScript files pass syntax checks.
- Cloudflare Pages Functions compile successfully with Wrangler 4.131.0.
- The local HTTP audit passed: 37 sitemap pages plus metadata, social image availability, robots, redirects, confirmation noindex, legacy 410, and missing-route 404 checks.
- Browser checks covered desktop and 390px mobile rendering, visible content, working carousel initialization, and nested error-page recovery. A local script-blocking test confirmed all homepage content and seven static reviews remain visible.
- No TypeScript project or separate static-HTML build exists; Functions compilation, JavaScript syntax checks, and tests are the applicable validation steps.
- Re-run unit/static checks with `npm test`; re-run the read-only production crawl with `npm run audit:seo`. To audit a local build: `npm run audit:seo -- http://127.0.0.1:8792`.

## Remaining evidence and account-level opportunities

- Search Console query, impression, indexing, and click-through data were not available. Use those reports to prioritize the next changes; ranking gains cannot be verified from a code audit.
- Twelve city pages remain largely templated: Farmington Hills, Pontiac, Novi, Monroe, Royal Oak, Rochester Hills, Southfield, Port Huron, Sterling Heights, Troy, Warren, and Westland. Real completed-job details/photos would support substantive improvements; invented location claims or repeated keyword variations would not.
- The pages.dev host already canonicalizes to the main domain. A host redirect is an optional Cloudflare account-level Bulk Redirect change, not an unsupported rule to add to this repository.
- Chrome tracing tools were unavailable. No Lighthouse score, Core Web Vitals improvement, or rich-result eligibility is claimed.
- No forms were submitted and no customer records were created during validation.

## Guidance used

- [Google: helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google: canonical URL consolidation](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google: breadcrumb structured data](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
- [Google: local business structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [Cloudflare Pages: serving pages and 404 behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Cloudflare Pages: redirecting pages.dev to a custom domain](https://developers.cloudflare.com/pages/how-to/redirect-to-custom-domain/)
