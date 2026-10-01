const DYAD_HOST = /(^|\.)dyad\.sh$/i;
const TELEMETRY_HOST = /(^|\.)(posthog\.com|sentry\.io)$/i;
const SUPABASE_HOST = /(^|\.)supabase\.(com|co|io)$/i;

export type BlockedReason = "dyad" | "telemetry" | "supabase";

/**
 * ARBI Code talks to ARBI services only. This names the third-party services it must never contact
 * from the app itself: Dyad's hosted services, product telemetry, and Supabase (the Supabase connector is removed).
 *
 * `includeSupabase` is for the main process only. The preview iframe runs the user's own generated app in
 * the same window session, and that app is free to use Supabase.
 */
export function blockedReason(
  url: string,
  { includeSupabase }: { includeSupabase: boolean },
): BlockedReason | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (DYAD_HOST.test(host)) return "dyad";
  if (TELEMETRY_HOST.test(host)) return "telemetry";
  if (includeSupabase && SUPABASE_HOST.test(host)) return "supabase";
  return null;
}

