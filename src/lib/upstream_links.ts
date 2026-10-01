import { UPSTREAM_URL } from "../arbi-config";

// Hosts that only exist to sign users in to a third-party service (Neon, Supabase). They are never shown as
// links; the "Connect" buttons open them, so they must keep working.
const OAUTH_PROXY_HOSTS = new Set(["oauth.dyad.sh", "supabase-oauth.dyad.sh"]);

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function comparable(parsed: URL): string {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  return `${host}${parsed.pathname.replace(/\/+$/, "")}`;
}

/** The one link this app is allowed to show to Dyad: the "Based on Dyad App Builder" credit. */
export function isAttributionUrl(url: string): boolean {
  const parsed = parse(url);
  const attribution = parse(UPSTREAM_URL);
  return !!parsed && !!attribution && comparable(parsed) === comparable(attribution);
}

/**
 * True for content links that point at Dyad (its site, docs, pricing, GitHub org, community pages).
 * Such links must not be opened from this app; the only exception is the attribution link.
 */
export function isUpstreamContentUrl(url: string): boolean {
  const parsed = parse(url);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname.toLowerCase();

  if (OAUTH_PROXY_HOSTS.has(host)) return false;
  if (isAttributionUrl(url)) return false;

  if (host === "dyad.sh" || host.endsWith(".dyad.sh")) return true;
  if (host === "github.com" && /^\/dyad-sh(\/|$)/.test(path)) return true;
  if (host.endsWith("reddit.com") && path.startsWith("/r/dyadbuilders")) return true;
  if ((host === "x.com" || host === "twitter.com") && path.startsWith("/dyad_sh")) return true;
  return false;
}
