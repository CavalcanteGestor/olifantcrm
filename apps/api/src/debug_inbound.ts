
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../worker/.env") });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log("--- DEBUGGING LATEST INBOUND MESSAGES ---");

  // 1. Get the last 5 messages created in the last hour
  const { data: messages, error: msgErr } = await supabase
    .from("messages")
    .select("*")
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(5);

  if (msgErr) {
    console.error("Error fetching messages:", msgErr);
    return;
  }

  console.log(`Found ${messages?.length} recent inbound messages:`);

  for (const msg of messages || []) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Msg ID: ${msg.id}`);
    console.log(`Created At: ${msg.created_at}`);
    console.log(`Type: ${msg.type}`);
    console.log(`Body JSON:`, JSON.stringify(msg.body_json).substring(0, 150) + "...");
    
    const mediaId = msg.body_json?.media_asset_id;
    if (mediaId) {
        console.log(`Media Asset ID from Body: ${mediaId}`);
        
        // Check if asset exists
        const { data: asset, error: assetErr } = await supabase
            .from("media_assets")
            .select("*")
            .eq("id", mediaId)
            .maybeSingle();
            
        if (assetErr) console.error("Error fetching asset:", assetErr);
        
        if (asset) {
            console.log(`✅ Asset Record Found:`, asset);
            // Check storage
            const { data: files } = await supabase.storage.from("whatsapp-media").list(path.dirname(asset.storage_path));
            const fileName = path.basename(asset.storage_path);
            const exists = files?.some(f => f.name === fileName);
            console.log(`   Storage File '${asset.storage_path}': ${exists ? "EXISTS ✅" : "MISSING ❌"}`);
        } else {
            console.log(`❌ Asset Record MISSING in DB!`);
        }
    } else {
        console.log("No media_asset_id in body_json (Expected for text messages)");
    }

    // Check if we can find the webhook event for this message
    if (msg.meta_message_id) {
         const { data: events } = await supabase
            .from("whatsapp_webhook_events")
            .select("id, created_at, processing_error")
            .ilike("raw_json::text", `%${msg.meta_message_id}%`)
            .limit(1);
            
         if (events && events.length > 0) {
             console.log(`Webhook Event Found: ID ${events[0].id}, Created: ${events[0].created_at}`);
             if (events[0].processing_error) {
                 console.log(`❌ Processing Error: ${events[0].processing_error}`);
             } else {
                 console.log(`Processing Status: apparently success (no error logged in event)`);
             }
         } else {
             console.log(`⚠️ No webhook event found containing meta_message_id ${msg.meta_message_id}`);
         }
    }
  }
}

main();
