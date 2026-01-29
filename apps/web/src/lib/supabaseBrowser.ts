import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient<any, "public", any> | null = null;

export function supabaseBrowser() {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Não quebrar build/prerender; só falhar quando o app realmente rodar no browser sem env.
    throw new Error("Supabase env não configurado (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  }

  _client = createClient<any>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
  return _client;
}


