import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const webAppRoot = path.join(repoRoot, "apps", "web", "src", "app");
const webSrcRoot = path.join(repoRoot, "apps", "web", "src");

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
  return "/" + routeDir;
}

const appFiles = walk(webAppRoot);
const routes = new Set();
for (const f of appFiles) {
  const r = routeFromPage(f);
  if (r) routes.add(r);
}

const srcFiles = walk(webSrcRoot).filter((f) => /\.(ts|tsx|js|jsx)$/.test(f) && !f.includes("node_modules"));
const linkRe = /\b(?:href|replace|push)\s*[:=]\s*(['"`])([^'"`]+)\1|\b(?:replace|push)\s*\(\s*(['"`])([^'"`]+)\3/g;
const literals = new Set();
for (const f of srcFiles) {
  const txt = fs.readFileSync(f, "utf8");
  let m;
  while ((m = linkRe.exec(txt))) {
    const val = (m[2] || m[4] || "").trim();
    if (!val) continue;
    if (!val.startsWith("/")) continue;
    if (val.startsWith("/api/")) continue;
    if (val.startsWith("/_next")) continue;
    literals.add(val);
  }
}

function normalizeLink(l) {
  const base = l.split("#")[0].split("?")[0];
  if (base.length > 1 && base.endsWith("/")) return base.slice(0, -1);
  return base;
}

function isCovered(link) {
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

const missing = [...literals].filter((l) => !isCovered(l)).sort();
console.log(JSON.stringify({ routesCount: routes.size, linksCount: literals.size, missingCount: missing.length }, null, 2));
if (missing.length) {
  for (const m of missing) console.log("MISSING", m);
}
