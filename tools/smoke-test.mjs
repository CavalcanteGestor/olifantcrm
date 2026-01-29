import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const webAppRoot = path.join(repoRoot, "apps", "web", "src", "app");
const apiRoutesRoot = path.join(repoRoot, "apps", "api", "src", "routes");
const outDir = path.join(repoRoot, "docs");

const WEB_BASE = process.env.SMOKE_WEB_BASE ?? "http://localhost:3000";
const API_BASE = process.env.SMOKE_API_BASE ?? "http://localhost:3001";

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function routeFromPage(file) {
  const rel = path.relative(webAppRoot, file).replace(/\\/g, "/");
  if (rel === "page.tsx" || rel === "page.ts") return "/";
  if (!rel.endsWith("/page.tsx") && !rel.endsWith("/page.ts")) return null;
  const routeDir = rel.endsWith("/page.tsx") ? rel.slice(0, -"/page.tsx".length) : rel.slice(0, -"/page.ts".length);
  const route = "/" + routeDir;
  if (route.includes("[")) return null;
  return route;
}

function normalizeApiPath(p) {
  const base = p.split("#")[0].split("?")[0];
  return base.replace(/\/+$/, "") || "/";
}

function safePathExample(p) {
  return p
    .replace(/:id\b/g, "00000000-0000-0000-0000-000000000000")
    .replace(/:userId\b/g, "00000000-0000-0000-0000-000000000000")
    .replace(/:conversationId\b/g, "00000000-0000-0000-0000-000000000000")
    .replace(/:contactId\b/g, "00000000-0000-0000-0000-000000000000")
    .replace(/:taskId\b/g, "00000000-0000-0000-0000-000000000000")
    .replace(/:mediaId\b/g, "00000000-0000-0000-0000-000000000000");
}

async function fetchStatus(url, opts) {
  try {
    const res = await fetch(url, { redirect: "manual", ...opts });
    return { status: res.status };
  } catch (e) {
    return { status: -1, error: e?.message ?? String(e) };
  }
}

const webRoutes = walk(webAppRoot)
  .map(routeFromPage)
  .filter(Boolean)
  .sort();

const serverRe = /\bapp\.(get|post|put|delete|patch)\(\s*["'](\/api\/[^"']+)["']/g;
const apiCalls = [];
for (const f of walk(apiRoutesRoot).filter((p) => p.endsWith(".ts"))) {
  const txt = fs.readFileSync(f, "utf8");
  let m;
  while ((m = serverRe.exec(txt))) {
    apiCalls.push({ method: m[1].toUpperCase(), path: normalizeApiPath(m[2]) });
  }
}

const uniqueApi = new Map();
for (const a of apiCalls) uniqueApi.set(`${a.method} ${a.path}`, a);
const apiRoutes = [...uniqueApi.values()].sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));

const webResults = [];
for (const r of webRoutes) {
  const url = WEB_BASE + r;
  const res = await fetchStatus(url);
  webResults.push({ route: r, url, ...res });
}

const apiResults = [];
for (const a of apiRoutes) {
  const url = API_BASE + safePathExample(a.path);
  const opts =
    a.method === "GET" || a.method === "DELETE"
      ? { method: a.method }
      : { method: a.method, headers: { "Content-Type": "application/json" }, body: "{}" };
  const res = await fetchStatus(url, opts);
  apiResults.push({ ...a, url, ...res });
}

const okApiStatuses = new Set([200, 201, 202, 204, 301, 302, 307, 308, 400, 401, 403, 404, 405, 409, 415, 422]);
const okWebStatuses = new Set([200, 301, 302, 307, 308, 404]);

const webBad = webResults.filter((r) => !okWebStatuses.has(r.status));
const apiBad = apiResults.filter((r) => !okApiStatuses.has(r.status));

const summary = {
  generated_at: new Date().toISOString(),
  web_base: WEB_BASE,
  api_base: API_BASE,
  web_routes_tested: webResults.length,
  api_routes_tested: apiResults.length,
  web_failures: webBad.length,
  api_failures: apiBad.length
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "SMOKE_RESULTS.json"), JSON.stringify({ summary, webResults, apiResults }, null, 2));

console.log(JSON.stringify(summary, null, 2));
if (webBad.length) console.log("WEB_BAD", webBad.slice(0, 10));
if (apiBad.length) console.log("API_BAD", apiBad.slice(0, 10));

