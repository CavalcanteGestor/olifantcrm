import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const webApiFile = path.join(repoRoot, "apps", "web", "src", "lib", "api.ts");
const apiRoutesRoot = path.join(repoRoot, "apps", "api", "src", "routes");

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

const webTxt = fs.readFileSync(webApiFile, "utf8");
const webApis = new Set();
const fetchTplRe = /\bfetch\s*\(\s*`([^`]+)`/g;
const fetchStrRe = /\bfetch\s*\(\s*["']([^"']+)["']/g;

function extractApiFromUrl(url) {
  const idx = url.indexOf("/api/");
  if (idx === -1) return null;
  const tail = url.slice(idx);
  return normalizeApiPath(tail.replace(/\$\{[^}]+\}/g, ":param"));
}

for (const m of webTxt.matchAll(fetchTplRe)) {
  const api = extractApiFromUrl(m[1]);
  if (api) webApis.add(api);
}
for (const m of webTxt.matchAll(fetchStrRe)) {
  const api = extractApiFromUrl(m[1]);
  if (api) webApis.add(api);
}

const routeFiles = walk(apiRoutesRoot).filter((f) => f.endsWith(".ts"));
const apiApis = new Set();
const serverRe = /\bapp\.(get|post|put|delete|patch)\(\s*["'](\/api\/[^"']+)["']/g;
for (const f of routeFiles) {
  const txt = fs.readFileSync(f, "utf8");
  let m;
  while ((m = serverRe.exec(txt))) {
    apiApis.add(normalizeApiPath(m[2]));
  }
}

const missingOnServer = [...webApis].filter((w) => ![...apiApis].some((a) => coverPattern(w, a))).sort();
const extraOnServer = [...apiApis].filter((a) => ![...webApis].some((w) => coverPattern(w, a))).sort();

console.log(
  JSON.stringify(
    { webApiCount: webApis.size, serverApiCount: apiApis.size, missingOnServerCount: missingOnServer.length, extraOnServerCount: extraOnServer.length },
    null,
    2
  )
);
if (missingOnServer.length) {
  for (const p of missingOnServer) console.log("MISSING_ON_SERVER", p);
}
if (extraOnServer.length) {
  for (const p of extraOnServer.slice(0, 50)) console.log("EXTRA_ON_SERVER", p);
  if (extraOnServer.length > 50) console.log("EXTRA_ON_SERVER_TRUNCATED", extraOnServer.length - 50);
}
