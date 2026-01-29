import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

type SyncTemplatesOptions = {
  supabase: SupabaseClient;
  tenantId: string;
  phoneNumberId: string;
  accessToken: string;
  graphVersion: string;
};

export async function syncTemplatesForTenant(opts: SyncTemplatesOptions) {
  const { supabase, tenantId, phoneNumberId, accessToken, graphVersion } = opts;

  try {
    // Chamar Meta Graph API para listar templates
    const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/message_templates?limit=100`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Meta API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const templates = data.data || [];

    // Sincronizar templates no banco
    let synced = 0;
    const now = new Date().toISOString();

    for (const template of templates) {
      const { error } = await supabase.from("whatsapp_templates").upsert(
        {
          tenant_id: tenantId,
          name: template.name,
          language: template.language || "pt_BR",
          category: template.category || null,
          approved_status: template.status || null,
          components_json: template.components || [],
          last_synced_at: now
        },
        {
          onConflict: "tenant_id,name,language",
          ignoreDuplicates: false
        }
      );
      if (!error) synced++;
    }

    return { synced, total: templates.length };
  } catch (err: any) {
    throw new Error(`Sync failed: ${err.message}`);
  }
}

