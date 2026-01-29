import { z } from "zod";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

function findEnvFile() {
  const cwd = process.cwd();
  const parents = [cwd, path.resolve(cwd, "..")];
  const baseCandidates = [".env", ".env.development", ".env.production"];
  const localCandidates = [".env.local", "env.local"];

  const loaded: string[] = [];
  for (const base of parents) {
    for (const c of baseCandidates) {
      const full = path.join(base, c);
      if (fs.existsSync(full)) loaded.push(full);
    }
    for (const c of localCandidates) {
      const full = path.join(base, c);
      if (fs.existsSync(full)) loaded.push(full);
    }
  }
  const unique = [...new Set(loaded)];
  return { cwd, paths: unique };
}

const envFile = process.env.DOTENV_CONFIG_PATH
  ? { cwd: process.cwd(), paths: [path.resolve(process.cwd(), process.env.DOTENV_CONFIG_PATH)] }
  : findEnvFile();

if (envFile.paths.length > 0) {
  for (const p of envFile.paths) {
    const isLocal = p.endsWith(".env.local") || p.endsWith(`${path.sep}env.local`);
    dotenv.config({ path: p, override: isLocal });
  }
}

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(3006),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_ANON_KEY: z.string().min(20),
  META_APP_SECRET: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  // Em produção, deve ser https://crm.olifant.cloud (ou a URL do frontend)
  WEB_ORIGIN: z.string().optional(),
  OTEL_ENABLED: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  META_GRAPH_VERSION: z.string().default("v21.0")
});

const raw = {
  ...process.env,
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN ?? process.env.WEBHOOK_VERIFY_TOKEN
};

export const env = EnvSchema.parse(raw);

export const envLoadInfo = {
  cwd: envFile.cwd,
  dotenv_config_path_env: process.env.DOTENV_CONFIG_PATH ?? null,
  loaded_env_path: envFile.paths[envFile.paths.length - 1] ?? null,
  loaded_env_paths: envFile.paths
};
