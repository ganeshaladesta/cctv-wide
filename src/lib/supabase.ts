/**
 * SCC - EAGLE EYES: Supabase Client & Connection Utility
 * Server-side privileged client (Service Role) and configuration checks.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

/**
 * Checks whether Supabase environment variables are configured.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  return Boolean(
    url &&
    url.trim() !== "" &&
    !url.includes("your-project") &&
    key &&
    key.trim() !== "" &&
    !key.includes("your-service-role")
  );
}

/**
 * Returns a server-side Supabase client with Service Role privileges (bypassing RLS).
 * NEVER expose this client or its key to the browser.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (adminClient) {
    return adminClient;
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)!.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY)!.trim();

  adminClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return adminClient;
}
