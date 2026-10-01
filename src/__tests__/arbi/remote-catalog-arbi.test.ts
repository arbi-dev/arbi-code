import { describe, it, expect, beforeEach, vi } from "vitest";

// Force ARBI_MODE on so the short-circuit is always exercised regardless of the
// real shipped config value.
vi.mock("@/arbi-config", () => ({ ARBI_MODE: true }));

import { getBuiltinLanguageModelCatalog } from "@/ipc/shared/remote_language_model_catalog";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // If the short-circuit ever regresses, the real code path would hit the
  // network — a stubbed fetch lets us assert that never happens.
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("getBuiltinLanguageModelCatalog (event mode)", () => {
  it("returns the local fallback catalog without any network call", async () => {
    const catalog = await getBuiltinLanguageModelCatalog();

    expect(catalog.source).toBe("fallback");
    expect(catalog.providers.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves the cached fallback on subsequent calls, still offline", async () => {
    const first = await getBuiltinLanguageModelCatalog();
    const second = await getBuiltinLanguageModelCatalog();

    expect(second).toBe(first);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
