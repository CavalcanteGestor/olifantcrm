import type { SupabaseClient } from "@supabase/supabase-js";

export async function syncTemplatesForTenant(opts: {
  supabase: SupabaseClient;
  tenantId: string;
  phoneNumberId: string;
  accessToken: string;
  graphVersion: string;
}) {
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

export async function syncAllTemplates(opts: {
  supabase: SupabaseClient;
  accessToken: string;
  graphVersion: string;
  log: { info: (o: any, m?: string) => void; warn: (o: any, m?: string) => void };
}) {
  const { supabase, accessToken, graphVersion, log } = opts;

  try {
    // Buscar todos os tenants com whatsapp_accounts configurados
    const { data: accounts, error: accountsErr } = await supabase
      .from("whatsapp_accounts")
      .select("tenant_id, phone_number_id");
    if (accountsErr || !accounts) {
      log.warn({ error: accountsErr }, "failed_to_fetch_whatsapp_accounts");
      return;
    }

    let totalSynced = 0;
    for (const account of accounts) {
      try {
        const result = await syncTemplatesForTenant({
          supabase,
          tenantId: account.tenant_id as string,
          phoneNumberId: account.phone_number_id as string,
          accessToken,
          graphVersion
        });
        totalSynced += result.synced;
      } catch (err: any) {
        log.warn({ tenantId: account.tenant_id, error: err.message }, "template_sync_failed_for_tenant");
      }
    }

    if (totalSynced > 0) {
      log.info({ totalSynced }, "templates_synced_for_all_tenants");
    }
  } catch (err: any) {
    log.warn({ error: err.message }, "template_sync_job_failed");
  }
}

