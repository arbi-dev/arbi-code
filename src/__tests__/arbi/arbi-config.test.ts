import { describe, it, expect } from "vitest";
import {
  ARBI_MODE,
  ARBI_PROVIDER_ID,
  ARBI_PROVIDER_NAME,
  ARBI_GATEWAY_URL,
  ARBI_MODELS,
  ARBI_CREDIT_LINE,
  UPSTREAM_NAME,
  UPSTREAM_URL,
} from "@/arbi-config";

// Structural guards on the *real* shipped event config. These run against the
// actual values that get baked into an event build, so a fat-fingered edit to
// src/arbi-config.ts (wrong prefix, empty model list, http:// gateway, etc.)
// fails CI here instead of bricking attendees at the event.
//
// Dyad treats any provider id starting with this prefix as a DB-backed custom
// provider; the event provider MUST use it or seeding/lookup breaks.
const CUSTOM_PROVIDER_PREFIX = "custom::";

describe("arbi-config invariants", () => {
  it("ARBI_MODE is a boolean", () => {
    expect(typeof ARBI_MODE).toBe("boolean");
  });

  it("provider id uses the custom:: prefix Dyad requires", () => {
    expect(ARBI_PROVIDER_ID.startsWith(CUSTOM_PROVIDER_PREFIX)).toBe(true);
    expect(ARBI_PROVIDER_ID.length).toBeGreaterThan(
      CUSTOM_PROVIDER_PREFIX.length,
    );
  });

  it("provider name is non-empty", () => {
    expect(ARBI_PROVIDER_NAME.trim().length).toBeGreaterThan(0);
  });

  it("gateway URL is a parseable https URL", () => {
    const url = new URL(ARBI_GATEWAY_URL);
    expect(url.protocol).toBe("https:");
  });

  it("ships at least one model, each with a non-empty apiName + displayName", () => {
    expect(ARBI_MODELS.length).toBeGreaterThan(0);
    for (const m of ARBI_MODELS) {
      expect(typeof m.apiName).toBe("string");
      expect(m.apiName.trim().length).toBeGreaterThan(0);
      expect(typeof m.displayName).toBe("string");
      expect(m.displayName.trim().length).toBeGreaterThan(0);
    }
  });

  it("model apiNames are unique (seeding + stale-dedupe key off apiName)", () => {
    const names = ARBI_MODELS.map((m) => m.apiName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("ARBI_MODELS[0] is usable as the default model (settings + seed rely on it)", () => {
    expect(ARBI_MODELS[0]?.apiName?.trim().length).toBeGreaterThan(0);
  });

  it("keeps Dyad attribution intact (credit where it's due)", () => {
    expect(UPSTREAM_NAME).toBe("Dyad");
    expect(new URL(UPSTREAM_URL).hostname).toContain("dyad.sh");
    expect(ARBI_CREDIT_LINE).toMatch(/Dyad/);
  });
});
