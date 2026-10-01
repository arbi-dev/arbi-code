import { describe, it, expect, beforeEach, vi } from "vitest";

// Control the event flags per-test; mock @/db so importing language_model_helpers
// (which pulls in the DB client at module load) doesn't open a real connection.
const cfg = vi.hoisted(() => ({
  ARBI_MODE: true,
  HIDE_OTHER_PROVIDERS: true,
  ARBI_PROVIDER_ID: "custom::test-arbi",
}));

vi.mock("@/arbi-config", () => ({
  get ARBI_MODE() {
    return cfg.ARBI_MODE;
  },
  get HIDE_OTHER_PROVIDERS() {
    return cfg.HIDE_OTHER_PROVIDERS;
  },
  get ARBI_PROVIDER_ID() {
    return cfg.ARBI_PROVIDER_ID;
  },
}));
vi.mock("@/db", () => ({ db: {} }));

import { applyArbiProviderFilter } from "@/ipc/shared/language_model_helpers";

const PROVIDERS = [
  { id: "custom::test-arbi", type: "custom" },
  { id: "openai", type: "cloud" },
  { id: "anthropic", type: "cloud" },
  { id: "auto", type: "cloud" },
  { id: "ollama", type: "local" },
  { id: "lmstudio", type: "local" },
];

beforeEach(() => {
  cfg.ARBI_MODE = true;
  cfg.HIDE_OTHER_PROVIDERS = true;
  cfg.ARBI_PROVIDER_ID = "custom::test-arbi";
});

describe("applyArbiProviderFilter", () => {
  it("keeps only the event provider + local providers in event mode", () => {
    const result = applyArbiProviderFilter(PROVIDERS);
    expect(result.map((p) => p.id)).toEqual([
      "custom::test-arbi",
      "ollama",
      "lmstudio",
    ]);
  });

  it("drops every cloud provider, including upstream's `auto` router", () => {
    const ids = applyArbiProviderFilter(PROVIDERS).map((p) => p.id);
    expect(ids).not.toContain("openai");
    expect(ids).not.toContain("anthropic");
    expect(ids).not.toContain("auto");
  });

  it("returns the full list unchanged when HIDE_OTHER_PROVIDERS is off", () => {
    cfg.HIDE_OTHER_PROVIDERS = false;
    expect(applyArbiProviderFilter(PROVIDERS)).toEqual(PROVIDERS);
  });

  it("returns the full list unchanged when ARBI_MODE is off", () => {
    cfg.ARBI_MODE = false;
    expect(applyArbiProviderFilter(PROVIDERS)).toEqual(PROVIDERS);
  });

  it("preserves input order of the surviving providers", () => {
    const reordered = [
      { id: "ollama", type: "local" },
      { id: "openai", type: "cloud" },
      { id: "custom::test-arbi", type: "custom" },
    ];
    expect(applyArbiProviderFilter(reordered).map((p) => p.id)).toEqual([
      "ollama",
      "custom::test-arbi",
    ]);
  });
});
