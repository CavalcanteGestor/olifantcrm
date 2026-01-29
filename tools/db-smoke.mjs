import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const repoRoot = process.cwd();
const apiEnvPath = path.join(repoRoot, "apps", "api", ".env");
const rootEnvPath = path.join(repoRoot, ".env");
const envLocalPath = path.join(repoRoot, "env.local");

if (fs.existsSync(apiEnvPath)) dotenv.config({ path: apiEnvPath });
if (fs.existsSync(rootEnvPath)) dotenv.config({ path: rootEnvPath });
if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: "missing_env",
        details: "Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (apps/api/.env ou .env)."
      },
      null,
      2
    )
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const tables = [
  "tenants",
  "profiles",
  "roles",
  "user_roles",
  "contacts",
  "funnel_stages",
  "conversations",
  "messages",
  "funnel_moves",
  "sla_policies",
  "sla_timers",
  "whatsapp_accounts",
  "whatsapp_templates",
  "internal_messages",
  "agent_shifts",
  "agent_pauses",
  "agent_goals",
  "agent_badges",
  "agent_notes",
  "conversation_ratings",
  "conversation_tasks",
  "audit_logs",
  "jobs",
  "job_attempts"
];

async function checkTable(table) {
  const { error, count } = await supabase.from(table).select("*", { head: true, count: "exact" });
  if (!error) return { table, ok: true, count };
  return {
    table,
    ok: false,
    code: error.code,
    message: error.message
  };
}

const startedAt = Date.now();
const results = [];

for (const t of tables) {
  // eslint-disable-next-line no-await-in-loop
  results.push(await checkTable(t));
}

const okCount = results.filter((r) => r.ok).length;
const failCount = results.length - okCount;
const durationMs = Date.now() - startedAt;

console.log(
  JSON.stringify(
    {
      ok: failCount === 0,
      tables_tested: results.length,
      tables_ok: okCount,
      tables_failed: failCount,
      duration_ms: durationMs
    },
    null,
    2
  )
);

if (failCount > 0) {
  console.log("FAILED_TABLES", results.filter((r) => !r.ok));
  process.exit(2);
}

