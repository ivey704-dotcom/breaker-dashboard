import { createBrowserClient } from "@supabase/ssr";

const fallbackUrl = "https://egwqeinlherqtscsaazl.supabase.co";
const fallbackKey = "sb_publishable_DHEy-EkyMJ_iw8SjAf5b-w_1VIFKEqV";

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fallbackUrl;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || fallbackKey;

  // These fallbacks are the project's public browser-safe Supabase values.
  // Environment variables still take precedence in every environment.
  return createBrowserClient(url, key);
}
