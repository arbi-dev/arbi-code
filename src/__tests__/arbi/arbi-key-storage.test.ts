import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { safeStorage } from "electron";
import { writeSettings } from "@/main/settings";
import { getUserDataPath } from "@/paths/paths";
import { getRemoteDesktopConfig } from "@/ipc/shared/remote_desktop_config";
import { ARBI_PROVIDER_ID } from "@/arbi-config";

// Uses the REAL arbi-config so the actual shipped provider id is what gets the
// plaintext treatment. The invariant under test: the ARBI event key is stored
// in plaintext (+ trimmed) because Electron safeStorage round-trips corrupted
// it on packaged Windows, while every OTHER provider key stays encrypted.
vi.mock("node:fs");
vi.mock("node:path");
vi.mock("electron", () => ({
  app: { on: vi.fn() },
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
}));
vi.mock("@/paths/paths", () => ({ getUserDataPath: vi.fn() }));
vi.mock("@/ipc/shared/remote_desktop_config", () => ({
  getRemoteDesktopConfig: vi.fn(),
}));

const mockFs = vi.mocked(fs);
const mockPath = vi.mocked(path);
const mockSafeStorage = vi.mocked(safeStorage);
const mockGetUserDataPath = vi.mocked(getUserDataPath);
const mockGetRemoteDesktopConfig = vi.mocked(getRemoteDesktopConfig);

const SETTINGS_PATH = "/mock/user/data/user-settings.json";

/** Parse the JSON written through the atomic temp-file write. */
function writtenSettings(): any {
  const tempWrite = mockFs.writeFileSync.mock.calls.find((c) =>
    String(c[0]).includes(".tmp-"),
  );
  if (!tempWrite) throw new Error("writeSettings did not persist anything");
  return JSON.parse(String(tempWrite[1]));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserDataPath.mockReturnValue("/mock/user/data");
  mockPath.join.mockReturnValue(SETTINGS_PATH);
  mockGetRemoteDesktopConfig.mockResolvedValue(undefined as never);
  // Encryption is "available" and this is not an E2E build, so encrypt() takes
  // the real safeStorage path for non-event providers.
  mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
  mockSafeStorage.encryptString.mockImplementation((s: string) =>
    Buffer.from(`enc:${s}`),
  );
  mockFs.existsSync.mockReturnValue(true);
  mockFs.readFileSync.mockReturnValue(
    JSON.stringify({
      selectedModel: { name: "Fast", provider: ARBI_PROVIDER_ID },
      providerSettings: {},
    }),
  );
  mockFs.writeFileSync.mockImplementation(() => {});
  mockFs.copyFileSync.mockImplementation(() => {});
  mockFs.renameSync.mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("writeSettings — event provider key storage", () => {
  it("stores the event-provider key in plaintext, trimmed, never encrypted", () => {
    writeSettings({
      providerSettings: {
        [ARBI_PROVIDER_ID]: {
          apiKey: { value: "  sk-event-key\n", encryptionType: "plaintext" },
        },
      },
    });

    const apiKey = writtenSettings().providerSettings[ARBI_PROVIDER_ID].apiKey;
    expect(apiKey).toEqual({
      value: "sk-event-key",
      encryptionType: "plaintext",
    });
    expect(mockSafeStorage.encryptString).not.toHaveBeenCalled();
  });

  it("still encrypts a NON-event provider key with safeStorage", () => {
    writeSettings({
      providerSettings: {
        openai: {
          apiKey: { value: "sk-openai", encryptionType: "plaintext" },
        },
      },
    });

    const apiKey = writtenSettings().providerSettings.openai.apiKey;
    expect(apiKey.encryptionType).toBe("electron-safe-storage");
    expect(apiKey.value).toBe(Buffer.from("enc:sk-openai").toString("base64"));
    expect(mockSafeStorage.encryptString).toHaveBeenCalledWith("sk-openai");
  });

  it("applies each policy per-provider in a single write", () => {
    writeSettings({
      providerSettings: {
        [ARBI_PROVIDER_ID]: {
          apiKey: { value: "ev", encryptionType: "plaintext" },
        },
        openai: { apiKey: { value: "oa", encryptionType: "plaintext" } },
      },
    });

    const ps = writtenSettings().providerSettings;
    expect(ps[ARBI_PROVIDER_ID].apiKey.encryptionType).toBe("plaintext");
    expect(ps.openai.apiKey.encryptionType).toBe("electron-safe-storage");
  });
});
