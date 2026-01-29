import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const webAppRoot = path.join(repoRoot, "apps", "web", "src", "app");
const webSrcRoot = path.join(repoRoot, "apps", "web", "src");
const webApiFile = path.join(repoRoot, "apps", "web", "src", "lib", "api.ts");
const apiRoutesRoot = path.join(repoRoot, "apps", "api", "src", "routes");
const outDir = path.join(repoRoot, "docs");

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

function uniqSort(arr) {
  return [...new Set(arr)].sort();
}

function routeFromPage(file) {
  const rel = path.relative(webAppRoot, file).replace(/\\/g, "/");
  if (rel === "page.tsx" || rel === "page.ts") return "/";
  if (!rel.endsWith("/page.tsx") && !rel.endsWith("/page.ts")) return null;
  const routeDir = rel.endsWith("/page.tsx") ? rel.slice(0, -"/page.tsx".length) : rel.slice(0, -"/page.ts".length);
  return "/" + routeDir;
}

function normalizeLink(l) {
  const base = l.split("#")[0].split("?")[0];
  if (base.length > 1 && base.endsWith("/")) return base.slice(0, -1);
  return base;
}

function normalizeApiPath(p) {
  const base = p.split("#")[0].split("?")[0];
  return base.replace(/\/+$/, "") || "/";
}

function coverPattern(pathname, pattern) {
  const a = normalizeApiPath(pathname).split("/").filter(Boolean);
  const b = normalizeApiPath(pattern).split("/").filter(Boolean);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ps = b[i];
    if (ps?.startsWith(":")) continue;
    if (ps?.startsWith("{") && ps.endsWith("}")) continue;
    if (ps !== a[i]) return false;
  }
  return true;
}

function isCoveredWebRoute(link, routes) {
  const l = normalizeLink(link);
  if (routes.has(l)) return true;
  const segs = l.split("/").filter(Boolean);
  for (const r of routes) {
    const rsegs = r.split("/").filter(Boolean);
    if (rsegs.length !== segs.length) continue;
    let ok = true;
    for (let i = 0; i < segs.length; i++) {
      const rs = rsegs[i];
      if (rs?.startsWith("[") && rs.endsWith("]")) continue;
      if (rs !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function extractApiFromUrl(url) {
  const idx = url.indexOf("/api/");
  if (idx === -1) return null;
  const tail = url.slice(idx);
  return normalizeApiPath(tail.replace(/\$\{[^}]+\}/g, ":param"));
}

const webAppFiles = walk(webAppRoot);
const webRoutesSet = new Set();
for (const f of webAppFiles) {
  const r = routeFromPage(f);
  if (r) webRoutesSet.add(r);
}

const srcFiles = walk(webSrcRoot).filter((f) => /\.(ts|tsx|js|jsx)$/.test(f) && !f.includes("node_modules"));
const linkRe = /\b(?:href|replace|push)\s*[:=]\s*(['"`])([^'"`]+)\1|\b(?:replace|push)\s*\(\s*(['"`])([^'"`]+)\3/g;
const webLinks = [];
for (const f of srcFiles) {
  const txt = fs.readFileSync(f, "utf8");
  let m;
  while ((m = linkRe.exec(txt))) {
    const val = (m[2] || m[4] || "").trim();
    if (!val) continue;
    if (!val.startsWith("/")) continue;
    if (val.startsWith("/api/")) continue;
    if (val.startsWith("/_next")) continue;
    webLinks.push(val);
  }
}

const missingWebRoutes = uniqSort(webLinks).filter((l) => !isCoveredWebRoute(l, webRoutesSet));

const routeFiles = walk(apiRoutesRoot).filter((f) => f.endsWith(".ts"));
const apiRoutes = [];
const serverRe = /\bapp\.(get|post|put|delete|patch)\(\s*["'](\/api\/[^"']+)["']/g;
for (const f of routeFiles) {
  const txt = fs.readFileSync(f, "utf8");
  let m;
  while ((m = serverRe.exec(txt))) {
    apiRoutes.push(normalizeApiPath(m[2]));
  }
}
const apiRoutesSorted = uniqSort(apiRoutes);

const webApiCalls = new Set();
const webTxt = fs.readFileSync(webApiFile, "utf8");
const fetchTplRe = /\bfetch\s*\(\s*`([^`]+)`/g;
const fetchStrRe = /\bfetch\s*\(\s*["']([^"']+)["']/g;
for (const m of webTxt.matchAll(fetchTplRe)) {
  const api = extractApiFromUrl(m[1]);
  if (api) webApiCalls.add(api);
}
for (const m of webTxt.matchAll(fetchStrRe)) {
  const api = extractApiFromUrl(m[1]);
  if (api) webApiCalls.add(api);
}

const missingApiOnServer = [...webApiCalls].filter((w) => !apiRoutesSorted.some((a) => coverPattern(w, a))).sort();

const inventory = {
  generated_at: new Date().toISOString(),
  web: {
    routes: [...webRoutesSet].sort(),
    links: uniqSort(webLinks),
    missing_routes_for_links: missingWebRoutes
  },
  api: {
    routes: apiRoutesSorted,
    used_by_web_api_ts: [...webApiCalls].sort(),
    missing_routes_for_web_api_ts: missingApiOnServer
  }
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "system-inventory.json"), JSON.stringify(inventory, null, 2));

const md = [
  "# System Inventory",
  "",
  `Gerado em: ${inventory.generated_at}`,
  "",
  "## Web",
  `- Rotas: ${inventory.web.routes.length}`,
  `- Links internos encontrados: ${inventory.web.links.length}`,
  `- Links quebrados (sem rota): ${inventory.web.missing_routes_for_links.length}`,
  "",
  "## API",
  `- Rotas registradas: ${inventory.api.routes.length}`,
  `- Rotas usadas por apps/web/src/lib/api.ts: ${inventory.api.used_by_web_api_ts.length}`,
  `- Rotas faltando no servidor (usadas no web): ${inventory.api.missing_routes_for_web_api_ts.length}`,
  ""
].join("\n");
fs.writeFileSync(path.join(outDir, "SYSTEM_INVENTORY.md"), md + "\n");

console.log(JSON.stringify({ webRoutes: inventory.web.routes.length, brokenLinks: inventory.web.missing_routes_for_links.length, apiRoutes: inventory.api.routes.length, missingApi: inventory.api.missing_routes_for_web_api_ts.length }, null, 2));

