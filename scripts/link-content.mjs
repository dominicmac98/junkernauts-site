// Static links stay crawlable and work without JavaScript. Run links:write after editing copy.
import { readFile, readdir, writeFile, access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const cities = [
  'Ann Arbor', 'Brighton', 'Canton', 'Dearborn', 'Detroit', 'Farmington Hills',
  'Livonia', 'Monroe', 'Novi', 'Pontiac', 'Port Huron', 'Rochester Hills',
  'Royal Oak', 'Saline', 'Southfield', 'Sterling Heights', 'Taylor', 'Troy',
  'Warren', 'Westland', 'Ypsilanti',
];
const nearbyCommunities = [
  'South Lyon', 'Plymouth', 'Belleville', 'Milan', 'Dexter', 'Chelsea',
  'Pittsfield Township', 'Whitmore Lake', 'Van Buren Township', 'Bridgewater',
  'Clinton', 'Manchester', 'Tecumseh', 'Downriver',
];
const join = String.raw`(?:\s+(?:and|&amp;|&)\s+|,\s*(?:(?:and|&amp;|&)\s+)?)`;
const cleanout = String.raw`clean[ -]?outs?`;
const removal = String.raw`(?:removals?|pickups?|hauling|collection)`;
const furniture = String.raw`(?:furniture|couch(?:es)?|sofas?|sectionals?(?:\s+couch(?:es)?)?|mattress(?:es)?|box[ -]springs?)`;
const appliance = String.raw`(?:appliances?|refrigerators?|fridges?|freezers?|washers?|dryers?|ovens?)`;
const property = String.raw`(?:estate|property|house|home|apartment|rental|moving|landlord|tenant|room|move[ -]out|foreclosure|storage[ -]unit)`;
const servicePatterns = [
  [String.raw`(?:garage${join}basement|basement${join}garage)\s+${cleanout}`, 'garage-cleanouts'],
  [String.raw`${furniture}(?:${join}${furniture})*\s+${removal}`, 'furniture-removal'],
  [String.raw`${appliance}(?:${join}${appliance})*\s+${removal}`, 'appliance-removal'],
  [String.raw`${furniture}(?=(?:${join}(?:${furniture}|${appliance}))+\s+${removal})`, 'furniture-removal'],
  [String.raw`${appliance}(?=(?:${join}(?:${furniture}|${appliance}))+\s+${removal})`, 'appliance-removal'],
  [String.raw`garage\s+(?:${cleanout}|junk\s+removal|clutter(?:\s+removal)?)`, 'garage-cleanouts'],
  [String.raw`basement\s+(?:${cleanout}|junk(?:\s+removal)?)`, 'basement-cleanouts'],
  [String.raw`${property}(?:${join}${property})*\s+${cleanout}`, 'estate-cleanouts'],
  [String.raw`(?:commercial|office|business|retail|warehouse)\s+(?:junk\s+removal|${cleanout})`, 'commercial-junk-removal'],
  [String.raw`(?:construction|renovation|remodeling|demolition)\s+debris(?:\s+(?:removal|hauling|cleanup|pickup))?`, 'construction-debris-removal'],
  [String.raw`(?:carpet${join}drywall|carpet|drywall|decking)\s+(?:${removal}|debris(?:\s+removal)?|cleanup)`, 'construction-debris-removal'],
  [String.raw`deck[ -]demolition\s+cleanup`, 'construction-debris-removal'],
  [String.raw`light\s+demo(?:lition)?|shed\s+(?:removal|demolition|${cleanout}|dismantling)`, 'light-demolition'],
  [String.raw`junk\s+(?:removal|pickup|hauling)(?:\s*(?:&amp;|&)\s*hauling)?`, 'services'],
  [String.raw`yard\s+(?:waste|debris)(?:\s+(?:removal|pickup|cleanup))?`, 'services'],
];

// A shared suffix still names a service: "garage and rental cleanouts".
for (const [noun, href] of [
  ['garage', 'garage-cleanouts'], ['basement', 'basement-cleanouts'],
  [property, 'estate-cleanouts'],
]) servicePatterns.push([String.raw`(?:${noun})(?=(?:${join}(?:${property}|garage|basement))+\s+${cleanout})`, href]);

const definitions = [
  ...cities.map(city => [city, `junk-removal-${city.toLowerCase().replaceAll(' ', '-')}-mi`]),
  ...nearbyCommunities.map(city => [city, 'service-areas']),
  ...servicePatterns,
].map(([pattern, href]) => ({ expression: new RegExp(String.raw`\b(?:${pattern})\b`, 'gi'), href }));

const protectedPatterns = [
  /\bJunkernauts(?:\s+Junk\s+Removal)?\b/gi,
  // Keep a shared county list together; Monroe County is not the city of Monroe.
  /\b(?:(?:Washtenaw|Monroe|Oakland|Wayne|Livingston|Lenawee|Jackson|Macomb|St\. Clair)\s*(?:,\s*(?:and\s+)?|\s+and\s+)?)+count(?:y|ies)\b/gi,
];
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const excludedTags = new Set(['head', 'a', 'script', 'style', 'form', 'label', 'button', 'select', 'option', 'textarea', 'svg', 'code', 'pre', 'template', 'noscript']);

function linkText(text) {
  const protectedRanges = protectedPatterns.flatMap(pattern => [...text.matchAll(pattern)].map(match => [match.index, match.index + match[0].length]));
  // In an explicit service list, bare category names are meaningful links too.
  const categories = /\b(?:we (?:remove|haul|pick up)|(?:cleanout|removal|pickup) services)\b/i.test(text)
    ? [{ expression: /\bfurniture\b/gi, href: 'furniture-removal' }, { expression: /\bappliances?\b/gi, href: 'appliance-removal' }]
    : [];
  const matches = [...definitions, ...categories].flatMap(({ expression, href }) => [...text.matchAll(expression)].map(match => ({ start: match.index, end: match.index + match[0].length, text: match[0], href })))
    .filter(match => !protectedRanges.some(([start, end]) => match.start < end && match.end > start))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const addedLinks = [];
  let html = '', cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    html += text.slice(cursor, match.start) + `<a class="content-link" href="${match.href}">${match.text}</a>`;
    cursor = match.end;
    addedLinks.push({ text: match.text, href: match.href });
  }
  return { html: html + text.slice(cursor), addedLinks };
}

export function linkContent(source) {
  // Quote-aware tokens preserve original HTML and attributes byte for byte.
  const tags = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:[^>"']|"[^"]*"|'[^']*')*>/g;
  const stack = [];
  let html = '', cursor = 0;
  const addedLinks = [];
  const appendText = text => {
    const eligible = stack.some(item => item.tag === 'body') && !stack.some(item => item.excluded);
    const result = eligible ? linkText(text) : { html: text, addedLinks: [] };
    html += result.html;
    addedLinks.push(...result.addedLinks);
  };
  for (const match of source.matchAll(tags)) {
    const token = match[0];
    const tag = token.match(/^<\/?([a-zA-Z][\w:-]*)/)?.[1]?.toLowerCase();
    // Raw-text elements can contain strings resembling HTML tags.
    const raw = stack.at(-1)?.tag;
    if ((raw === 'script' || raw === 'style') && !new RegExp(`^<\\/${raw}\\s*>$`, 'i').test(token)) continue;
    appendText(source.slice(cursor, match.index));
    html += token;
    cursor = match.index + token.length;
    if (!tag) continue;
    if (token.startsWith('</')) {
      const index = stack.findLastIndex(item => item.tag === tag);
      if (index >= 0) stack.splice(index);
    } else if (!voidTags.has(tag) && !token.endsWith('/>')) {
      stack.push({ tag, excluded: excludedTags.has(tag) || /\baria-current\s*=\s*["']page["']/i.test(token) });
    }
  }
  appendText(source.slice(cursor));
  return { html, addedLinks };
}

async function main() {
  const write = process.argv.includes('--write');
  const publicDir = path.resolve(import.meta.dirname, '../public');
  const files = (await readdir(publicDir)).filter(file => file.endsWith('.html'));
  let total = 0, changed = 0;
  for (const file of files) {
    const filename = path.join(publicDir, file);
    const source = await readFile(filename, 'utf8');
    const result = linkContent(source);
    if (!result.addedLinks.length) continue;
    for (const { href } of result.addedLinks) await access(path.join(publicDir, `${href.split('#')[0]}.html`));
    total += result.addedLinks.length;
    changed++;
    if (write) {
      let output = result.html;
      if (!output.includes('content-links-20261101.css')) {
        output = output.replace(/^(\s*<link rel="stylesheet")/m,
          '  <link rel="stylesheet" href="content-links-20261101.css?v=20261101-links1" />\n$1');
      }
      await writeFile(filename, output);
    }
    console.log(`${file}: ${result.addedLinks.length} ${write ? 'added' : 'unlinked'} city/service mentions`);
  }
  console.log(`${total} mentions across ${changed} pages; ${write ? 'saved static links' : 'checked'}.`);
  if (!write && total) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
