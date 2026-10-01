import { describe, expect, it } from "vitest";
import { isAttributionUrl, isUpstreamContentUrl } from "./upstream_links";

describe("isUpstreamContentUrl", () => {
  it.each([
    "https://dyad.sh/pro",
    "https://www.dyad.sh/docs/faq",
    "https://academy.dyad.sh/subscription",
    "https://dyad.sh/download",
    "https://github.com/dyad-sh/dyad",
    "https://github.com/dyad-sh/dyad/issues/new?title=x",
    "https://github.com/dyad-sh/nextjs-template",
    "https://www.reddit.com/r/dyadbuilders/",
    "https://x.com/dyad_sh",
    "https://twitter.com/dyad_sh",
  ])("blocks %s", (url) => {
    expect(isUpstreamContentUrl(url)).toBe(true);
  });

  it("keeps the Neon and Supabase sign-in proxies working", () => {
    expect(isUpstreamContentUrl("https://oauth.dyad.sh/api/integrations/neon/login")).toBe(false);
    expect(isUpstreamContentUrl("https://supabase-oauth.dyad.sh/api/connect-supabase/login")).toBe(false);
  });

  it("allows only the one attribution link", () => {
    expect(isAttributionUrl("https://dyad.sh")).toBe(true);
    expect(isAttributionUrl("https://www.dyad.sh/")).toBe(true);
    expect(isUpstreamContentUrl("https://dyad.sh")).toBe(false);
    // ...but not other pages on the same site
    expect(isAttributionUrl("https://dyad.sh/pro")).toBe(false);
    expect(isUpstreamContentUrl("https://dyad.sh/pro")).toBe(true);
  });

  it.each([
    "https://github.com/arbi-dev/arbi-code/issues/new",
    "https://pnpm.io/installation",
    "https://api.arbi.work/v1",
    "https://notdyad.sh/pro",
    "https://dyad.sh.evil.example/pro",
    "https://github.com/dyad-shop/app",
    "https://github.com/someone/dyad-sh",
    "not a url",
    "",
  ])("leaves %j alone", (url) => {
    expect(isUpstreamContentUrl(url)).toBe(false);
  });
});
