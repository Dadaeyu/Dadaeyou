import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "./config";

export function createPublicClient() {
  const config = getPublicSupabaseConfig();
  if (!config.isConfigured) throw new Error("Supabase public configuration is missing");

  return createClient(config.url.replace(/\/rest\/v1\/?$/, ""), config.key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  });
}
