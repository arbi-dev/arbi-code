import { session } from "electron";
import log from "electron-log";
import { blockedReason } from "../lib/blocked_hosts";

const logger = log.scope("network_guard");

function requestUrl(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input === "object" && "url" in input) {
    return String((input as { url: unknown }).url);
  }
  return "";
}

/** Makes every outgoing request to a blocked service fail, so a missed code path cannot leak. */
export function installNetworkGuard(): void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: unknown) => {
    const url = requestUrl(input);
    const reason = blockedReason(url, { includeSupabase: true });
    if (reason) {
      logger.warn(`Blocked ${reason} request from the main process: ${url}`);
      throw new Error(`ARBI Code does not contact ${reason} services (${new URL(url).hostname}).`);
    }
    return realFetch(input as RequestInfo, init as RequestInit);
  }) as typeof fetch;

  // The app window (renderer scripts, link navigations). The window session is shared with the preview
  // iframe, so Supabase stays reachable here.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const reason = blockedReason(details.url, { includeSupabase: false });
    if (reason) {
      logger.warn(`Blocked ${reason} request from the window: ${details.url}`);
      callback({ cancel: true });
      return;
    }
    callback({});
  });
}
