import { describe, expect, it, vi } from "vitest";

// Upstream's tests run with the Dyad features on; these assert what the shipped ARBI build does.
vi.mock("@/arbi-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/arbi-config")>()),
  HIDE_PRO_UPSELLS: true,
}));

import { getEffectiveDefaultChatMode, isBasicAgentMode } from "@/lib/schemas";
import type { UserSettings } from "@/lib/schemas";
import { SETTING_IDS, SETTINGS_SEARCH_INDEX } from "@/lib/settingsSearchIndex";

const settings = (overrides: Partial<UserSettings> = {}): UserSettings =>
  ({
    providerSettings: {},
    selectedModel: { name: "Fast", provider: "custom::arbi-litellm" },
    selectedChatMode: "local-agent",
    ...overrides,
  }) as UserSettings;

describe("ARBI build without Dyad Pro", () => {
  it("starts new users in Build, not Dyad's quota-limited Basic Agent", () => {
    expect(getEffectiveDefaultChatMode(settings(), {})).toBe("build");
  });

  it("still honours an explicit default the user chose", () => {
    expect(getEffectiveDefaultChatMode(settings({ defaultChatMode: "ask" }), {})).toBe("ask");
  });

  it("never applies the free-tier agent quota (which is counted against a Dyad-hosted clock)", () => {
    expect(isBasicAgentMode(settings({ selectedChatMode: "local-agent" }))).toBe(false);
  });

  it("does not list settings that only work with a Dyad Pro subscription", () => {
    const ids = new Set(SETTINGS_SEARCH_INDEX.map((item) => item.id));
    expect(ids.has(SETTING_IDS.enableCodeExplorer)).toBe(false);
    expect(ids.has(SETTING_IDS.autoApproveSafeMcpTools)).toBe(false);
    expect(ids.has(SETTING_IDS.enableCloudSandbox)).toBe(false);
  });

  it("does not mention Dyad Pro in any searchable setting", () => {
    for (const item of SETTINGS_SEARCH_INDEX) {
      expect(`${item.label} ${item.description}`, item.id).not.toMatch(/\bPro\b/);
    }
  });
});
