import { createBrowserClient } from "@supabase/ssr";

const fallbackUrl = "https://preview-placeholder.supabase.co";
const fallbackKey = "preview-placeholder-key";

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fallbackUrl;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || fallbackKey;

  // Keep preview rendering resilient. The dashboard can still render even if a
  // preview deployment was built without env vars; authenticated requests will
  // only work once the real public Supabase values are present.
  return createBrowserClient(url, key);
}
