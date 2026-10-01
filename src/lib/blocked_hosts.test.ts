import { describe, expect, it } from "vitest";
import { blockedReason } from "./blocked_hosts";

const main = { includeSupabase: true };
const win = { includeSupabase: false };

describe("blockedReason", () => {
  it.each([
    "https://api.dyad.sh/v1/templates",
    "https://engine.dyad.sh/v1/chat",
    "https://academy.dyad.sh/api/desktop/subscription-status",
    "https://oauth.dyad.sh/api/integrations/neon/login",
    "https://supabase-oauth.dyad.sh/api/connect-supabase/refresh",
    "https://upload-logs.dyad.sh/generate-upload-url",
    "https://dyad.sh",
  ])("blocks Dyad service %s everywhere", (url) => {
    expect(blockedReason(url, main)).toBe("dyad");
    expect(blockedReason(url, win)).toBe("dyad");
  });

  it("blocks product telemetry", () => {
    expect(blockedReason("https://us.i.posthog.com/e/", win)).toBe("telemetry");
    expect(blockedReason("https://o123.ingest.sentry.io/api/1/envelope/", main)).toBe("telemetry");
  });

  it("blocks Supabase from the main process only (generated apps in the preview may use it)", () => {
    expect(blockedReason("https://api.supabase.com/v1/projects", main)).toBe("supabase");
    expect(blockedReason("https://abc.supabase.co/rest/v1/x", main)).toBe("supabase");
    expect(blockedReason("https://abc.supabase.co/rest/v1/x", win)).toBeNull();
  });

  it.each([
    "https://api.arbi.work/v1/models",
    "https://github.com/arbi-dev/arbi-code",
    "https://notdyad.sh/x",
    "https://dyad.sh.evil.example/x",
    "https://myposthog.com.example/x",
    "not a url",
    "",
  ])("leaves %j alone", (url) => {
    expect(blockedReason(url, main)).toBeNull();
  });
});
