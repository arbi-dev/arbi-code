import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  language_model_providers as providersTable,
  language_models as modelsTable,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// Mocks. arbi-config is mocked (not the real shipped values) so the suite
// exercises the *behavior* independently of whatever models the event happens
// to ship, and so the ARBI_MODE=false branch can be toggled per-test.
// ---------------------------------------------------------------------------
const cfg = vi.hoisted(() => ({
  ARBI_MODE: true,
  ARBI_PROVIDER_ID: "custom::test-arbi",
  ARBI_PROVIDER_NAME: "TestARBI",
  ARBI_GATEWAY_URL: "https://gateway.test/v1",
  ARBI_MODELS: [
    { apiName: "Fast", displayName: "Fast" },
    { apiName: "Wise", displayName: "Wise" },
  ] as Array<{ apiName: string; displayName: string; description?: string }>,
}));

vi.mock("@/arbi-config", () => ({
  get ARBI_MODE() {
    return cfg.ARBI_MODE;
  },
  get ARBI_PROVIDER_ID() {
    return cfg.ARBI_PROVIDER_ID;
  },
  get ARBI_PROVIDER_NAME() {
    return cfg.ARBI_PROVIDER_NAME;
  },
  get ARBI_GATEWAY_URL() {
    return cfg.ARBI_GATEWAY_URL;
  },
  get ARBI_MODELS() {
    return cfg.ARBI_MODELS;
  },
}));

// Chainable drizzle stub. select() is discriminated by whether it received a
// projection: seedArbiProvider calls select() (no args) for providers and
// select({apiName}) for models — so we route reads without table identity.
const dbState = vi.hoisted(() => ({
  existingProviders: [] as unknown[],
  existingModels: [] as Array<{ apiName: string }>,
  deletedModels: [] as Array<{ apiName: string }>,
  inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: unknown; set: Record<string, unknown> }>,
  deletes: [] as Array<{ table: unknown }>,
}));

vi.mock("@/db", () => ({
  db: {
    select: (proj?: unknown) => ({
      from: (_table: unknown) => ({
        where: async () =>
          proj === undefined
            ? dbState.existingProviders
            : dbState.existingModels,
      }),
    }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        dbState.inserts.push({ table, values });
      },
    }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => {
          dbState.updates.push({ table, set });
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: (_cond: unknown) => ({
        returning: async () => {
          dbState.deletes.push({ table });
          return dbState.deletedModels;
        },
      }),
    }),
  },
}));

const settingsMock = vi.hoisted(() => ({
  readSettings: vi.fn(),
  writeSettings: vi.fn(),
}));
vi.mock("@/main/settings", () => ({
  readSettings: settingsMock.readSettings,
  writeSettings: settingsMock.writeSettings,
}));

import {
  seedArbiProvider,
  normalizeSelectedModel,
  verifyOrClearArbiKey,
} from "@/main/arbi-seed";

const fetchMock = vi.fn();

function resetDbState() {
  dbState.existingProviders = [];
  dbState.existingModels = [];
  dbState.deletedModels = [];
  dbState.inserts = [];
  dbState.updates = [];
  dbState.deletes = [];
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDbState();
  cfg.ARBI_MODE = true;
  cfg.ARBI_PROVIDER_ID = "custom::test-arbi";
  cfg.ARBI_GATEWAY_URL = "https://gateway.test/v1";
  cfg.ARBI_MODELS = [
    { apiName: "Fast", displayName: "Fast" },
    { apiName: "Wise", displayName: "Wise" },
  ];
  // Default: a valid stored selection + no stored key, so seedArbiProvider's
  // normalize/verify tails are no-ops unless a test overrides them.
  settingsMock.readSettings.mockReturnValue({
    selectedModel: { name: "Fast", provider: "custom::test-arbi" },
    providerSettings: {},
  });
  vi.stubGlobal("fetch", fetchMock);
});

const providerInserts = () =>
  dbState.inserts.filter((i) => i.table === providersTable);
const modelInserts = () =>
  dbState.inserts.filter((i) => i.table === modelsTable);

describe("seedArbiProvider", () => {
  it("inserts the provider and all models when the DB is empty", async () => {
    await seedArbiProvider();

    expect(providerInserts()).toHaveLength(1);
    expect(providerInserts()[0].values).toMatchObject({
      id: "custom::test-arbi",
      name: "TestARBI",
      api_base_url: "https://gateway.test/v1",
    });
    expect(
      modelInserts()
        .map((i) => i.values.apiName)
        .sort(),
    ).toEqual(["Fast", "Wise"]);
    expect(dbState.updates).toHaveLength(0);
  });

  it("is idempotent: updates URL/name (no insert) when the provider exists", async () => {
    dbState.existingProviders = [{ id: "custom::test-arbi" }];
    dbState.existingModels = [{ apiName: "Fast" }, { apiName: "Wise" }];

    await seedArbiProvider();

    expect(providerInserts()).toHaveLength(0);
    expect(modelInserts()).toHaveLength(0);
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].table).toBe(providersTable);
    expect(dbState.updates[0].set).toMatchObject({
      api_base_url: "https://gateway.test/v1",
      name: "TestARBI",
    });
  });

  it("seeds only the models that are missing", async () => {
    dbState.existingProviders = [{ id: "custom::test-arbi" }];
    dbState.existingModels = [{ apiName: "Fast" }];

    await seedArbiProvider();

    expect(modelInserts()).toHaveLength(1);
    expect(modelInserts()[0].values.apiName).toBe("Wise");
  });

  it("runs a stale-model cleanup delete against the models table", async () => {
    dbState.existingProviders = [{ id: "custom::test-arbi" }];
    dbState.existingModels = [{ apiName: "Fast" }, { apiName: "Wise" }];
    dbState.deletedModels = [{ apiName: "claude-sonnet-4-6" }];

    await seedArbiProvider();

    expect(dbState.deletes).toHaveLength(1);
    expect(dbState.deletes[0].table).toBe(modelsTable);
  });

  it("no-ops entirely when ARBI_MODE is off", async () => {
    cfg.ARBI_MODE = false;

    await seedArbiProvider();

    expect(dbState.inserts).toHaveLength(0);
    expect(dbState.updates).toHaveLength(0);
    expect(dbState.deletes).toHaveLength(0);
    expect(settingsMock.readSettings).not.toHaveBeenCalled();
  });

  it("does not let a seeding failure throw out of launch", async () => {
    dbState.existingProviders = [{ id: "custom::test-arbi" }];
    dbState.existingModels = [];
    settingsMock.readSettings.mockImplementation(() => {
      throw new Error("boom");
    });

    await expect(seedArbiProvider()).resolves.toBeUndefined();
  });
});

describe("normalizeSelectedModel", () => {
  it("resets selection off upstream's hidden `auto` router", () => {
    settingsMock.readSettings.mockReturnValue({
      selectedModel: { name: "auto", provider: "auto" },
    });

    normalizeSelectedModel();

    expect(settingsMock.writeSettings).toHaveBeenCalledWith({
      selectedModel: { name: "Fast", provider: "custom::test-arbi" },
    });
  });

  it("resets a stale event model no longer in ARBI_MODELS", () => {
    settingsMock.readSettings.mockReturnValue({
      selectedModel: {
        name: "claude-sonnet-4-6",
        provider: "custom::test-arbi",
      },
    });

    normalizeSelectedModel();

    expect(settingsMock.writeSettings).toHaveBeenCalledWith({
      selectedModel: { name: "Fast", provider: "custom::test-arbi" },
    });
  });

  it("leaves a valid event selection untouched", () => {
    settingsMock.readSettings.mockReturnValue({
      selectedModel: { name: "Wise", provider: "custom::test-arbi" },
    });

    normalizeSelectedModel();

    expect(settingsMock.writeSettings).not.toHaveBeenCalled();
  });

  it("leaves a local-provider selection (Ollama etc.) untouched", () => {
    settingsMock.readSettings.mockReturnValue({
      selectedModel: { name: "llama3", provider: "ollama" },
    });

    normalizeSelectedModel();

    expect(settingsMock.writeSettings).not.toHaveBeenCalled();
  });

  it("does not throw when no model is selected", () => {
    settingsMock.readSettings.mockReturnValue({});

    expect(() => normalizeSelectedModel()).not.toThrow();
    expect(settingsMock.writeSettings).not.toHaveBeenCalled();
  });
});

describe("verifyOrClearArbiKey", () => {
  const withKey = () =>
    settingsMock.readSettings.mockReturnValue({
      providerSettings: {
        "custom::test-arbi": { apiKey: { value: "ev-key" } },
      },
    });

  it("is a no-op when no key is stored", async () => {
    settingsMock.readSettings.mockReturnValue({ providerSettings: {} });

    await verifyOrClearArbiKey();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(settingsMock.writeSettings).not.toHaveBeenCalled();
  });

  it("leaves a key the gateway accepts (HTTP 200)", async () => {
    withKey();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await verifyOrClearArbiKey();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.test/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer ev-key" },
      }),
    );
    expect(settingsMock.writeSettings).not.toHaveBeenCalled();
  });

  it.each([401, 403])(
    "clears a key the gateway rejects (HTTP %i) so the dialog re-prompts",
    async (status) => {
      withKey();
      fetchMock.mockResolvedValue({ ok: false, status });

      await verifyOrClearArbiKey();

      expect(settingsMock.writeSettings).toHaveBeenCalledTimes(1);
      const arg = settingsMock.writeSettings.mock.calls[0][0];
      expect(arg.providerSettings["custom::test-arbi"].apiKey).toBeUndefined();
    },
  );

  it("leaves the key on a transient 5xx", async () => {
    withKey();
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await verifyOrClearArbiKey();

    expect(settingsMock.writeSettings).not.toHaveBeenCalled();
  });

  it("leaves the key on a network error (treated as transient)", async () => {
    withKey();
    fetchMock.mockRejectedValue(new Error("ENOTFOUND"));

    await verifyOrClearArbiKey();

    expect(settingsMock.writeSettings).not.toHaveBeenCalled();
  });
});
