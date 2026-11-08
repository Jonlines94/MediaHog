import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

let client: SupabaseClient | null = null;

/** Anonymous client for public catalogue reads. Row level security limits it to active listings. */
export function publicDb(): SupabaseClient {
  client ??= createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function artworkUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${requireEnv("NEXT_PUBLIC_SUPABASE_URL")}/storage/v1/object/public/artwork/${path}`;
}
