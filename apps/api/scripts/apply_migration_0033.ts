import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ljhvlnejcsadgckvmztn.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqaHZsbmVqY3NhZGdja3ZtenRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTIwMjg2MCwiZXhwIjoyMDg0Nzc4ODYwfQ.OQQjl4KyQ-nD79B1X7aW1Dr7Yb_K0KSbz86C6_QrRIM';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log('--- Applying Migration 0033 ---');

  const sql = `
    alter table public.tenants
      add column if not exists follow_up_alert_minutes int default 120;

    comment on column public.tenants.follow_up_alert_minutes is 'Tempo em minutos sem resposta do cliente para disparar alerta de follow-up';
  `;

  // Try to use a known RPC for SQL execution if it exists (some projects have it)
  // If not, we are stuck without DDL access via API.
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    console.error('Migration Failed:', error);
    if (error.message.includes('function "exec_sql" does not exist')) {
        console.error('CRITICAL: Cannot apply migration because "exec_sql" RPC is missing.');
        console.error('Please run the migration SQL manually in Supabase SQL Editor.');
    }
  } else {
    console.log('Migration Applied Successfully!');
  }
}

main();
