const baseUrl = (process.env.SEO_AUDIT_BASE_URL || process.argv[2] || "http://127.0.0.1:4100").replace(/\/$/, "");

function value(html, pattern) {
  return html.match(pattern)?.[1]?.trim() || "";
}

async function read(url) {
  const response = await fetch(url, { redirect: "follow" });
  return { response, text: await response.text() };
}

const failures = [];
const robots = await read(`${baseUrl}/robots.txt`);
if (!robots.response.ok || !robots.text.includes("Sitemap:")) failures.push("robots.txt must be reachable and declare a sitemap");

const sitemap = await read(`${baseUrl}/sitemap.xml`);
if (!sitemap.response.ok) failures.push("sitemap.xml is not reachable");
const urls = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (!urls.length) failures.push("sitemap.xml contains no URLs");

const pages = [];
for (const url of urls) pages.push({ url, ...(await read(url.replace(/^https?:\/\/[^/]+/, baseUrl))) });
const titles = new Map();
const canonicals = new Map();

for (const { url, response, text } of pages) {
  if (!response.ok) failures.push(`${url} returned ${response.status}`);
  const title = value(text, /<title>([^<]+)<\/title>/i);
  const description = value(text, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || value(text, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const canonical = value(text, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    || value(text, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  const robotsMeta = value(text, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i);
  const h1Count = (text.match(/<h1[\s>]/gi) || []).length;
  if (!title) failures.push(`${url} is missing a title`);
  if (!description) failures.push(`${url} is missing a meta description`);
  if (!canonical) failures.push(`${url} is missing a canonical URL`);
  if (/noindex/i.test(robotsMeta)) failures.push(`${url} is in the sitemap but marked noindex`);
  if (h1Count !== 1) failures.push(`${url} has ${h1Count} H1 elements`);
  if (title) titles.set(title, [...(titles.get(title) || []), url]);
  if (canonical) canonicals.set(canonical, [...(canonicals.get(canonical) || []), url]);
}

for (const [title, titleUrls] of titles) if (titleUrls.length > 1) failures.push(`duplicate title "${title}" on ${titleUrls.join(", ")}`);
for (const [canonical, canonicalUrls] of canonicals) if (canonicalUrls.length > 1) failures.push(`duplicate canonical ${canonical}`);

const home = pages.find(({ url }) => new URL(url).pathname === "/")?.text || "";
if (!home.includes('"@type":"Organization"') || !home.includes('"@type":"WebSite"')) failures.push("homepage is missing Organization/WebSite JSON-LD");

const blog = await read(`${baseUrl}/blog`);
if (blog.response.status !== 404) failures.push(`paused RackRate blog must return 404, received ${blog.response.status}`);

const thinRegion = await read(`${baseUrl}/regions/canada`);
const thinRobots = value(thinRegion.text, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i);
if (!/noindex/i.test(thinRobots)) failures.push("thin Canada region page must remain noindex");

if (failures.length) {
  console.error(`SEO audit failed for ${baseUrl}:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`SEO audit passed for ${baseUrl}: ${urls.length} indexable URLs, unique titles/canonicals, valid robots and sitemap.`);
