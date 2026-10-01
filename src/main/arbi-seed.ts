import { db } from "@/db";
import {
  language_model_providers as providersTable,
  language_models as modelsTable,
} from "@/db/schema";
import { and, eq, notInArray } from "drizzle-orm";
import log from "electron-log";
import {
  ARBI_MODE,
  ARBI_PROVIDER_ID,
  ARBI_PROVIDER_NAME,
  ARBI_GATEWAY_URL,
  ARBI_MODELS,
} from "../arbi-config";
import { readSettings, writeSettings } from "./settings";

const logger = log.scope("arbi-seed");

// Reset selectedModel to a valid ARBI entry when it points at:
//   - upstream Dyad's `auto` router (hidden from this fork's picker), OR
//   - a stale ARBI model that no longer exists in ARBI_MODELS (e.g.
//     v0.1.0's "claude-sonnet-4-6" placeholder after upgrading to v0.1.1+)
export function normalizeSelectedModel(): void {
  try {
    const settings = readSettings();
    const sel = settings.selectedModel;
    const validNames = new Set(ARBI_MODELS.map((m) => m.apiName));
    const stale =
      sel?.provider === "auto" ||
      (sel?.provider === ARBI_PROVIDER_ID && !validNames.has(sel.name));
    if (stale) {
      writeSettings({
        selectedModel: {
          name: ARBI_MODELS[0].apiName,
          provider: ARBI_PROVIDER_ID,
        },
      });
      logger.info("Reset selectedModel to ARBI default", {
        previous: sel,
      });
    }
  } catch (err) {
    logger.error("normalizeSelectedModel failed", err);
  }
}

// Self-heal a stored ARBI key that the gateway rejects.
//
// The diagnostic proved a valid key works end-to-end, so a stored key that
// fails auth means the persisted value is wrong/expired/corrupted (e.g. an
// older build encrypted it via Electron safeStorage and the decrypt
// round-trip mangled it on packaged Windows). ArbiSetupDialog only re-prompts
// when NO key is stored, so a truthy-but-broken key leaves every chat failing
// silently with no error and no recovery. Clearing it makes the dialog
// re-appear. Network errors are treated as transient (key left untouched).
export async function verifyOrClearArbiKey(): Promise<void> {
  try {
    const settings = readSettings();
    const key = settings.providerSettings?.[ARBI_PROVIDER_ID]?.apiKey?.value;
    if (!key) return;

    let res;
    try {
      res = await fetch(`${ARBI_GATEWAY_URL}/models`, {
        headers: { Authorization: `Bearer ${key}` },
      });
    } catch (netErr) {
      logger.warn(
        "ARBI key verification skipped (network error); leaving key as-is",
        netErr,
      );
      return;
    }

    if (res.ok) {
      logger.info("Stored ARBI key verified OK against gateway");
      return;
    }

    if (res.status === 401 || res.status === 403) {
      const providerSettings = { ...settings.providerSettings };
      const ev = { ...providerSettings[ARBI_PROVIDER_ID] };
      delete ev.apiKey;
      providerSettings[ARBI_PROVIDER_ID] = ev;
      writeSettings({ providerSettings });
      logger.error(
        `ARBI key rejected by ${ARBI_GATEWAY_URL} (HTTP ${res.status}); ` +
          "cleared the stored key so the setup dialog re-prompts instead of " +
          "failing silently.",
      );
      return;
    }

    logger.warn(
      `ARBI key check returned HTTP ${res.status}; leaving key as-is`,
    );
  } catch (err) {
    logger.error("verifyOrClearArbiKey failed", err);
  }
}

// Idempotent: inserts the ARBI provider + models into the local SQLite DB
// on every launch if they're not already present. Safe to run unconditionally.
export async function seedArbiProvider(): Promise<void> {
  if (!ARBI_MODE) return;

  try {
    const existing = await db
      .select()
      .from(providersTable)
      .where(eq(providersTable.id, ARBI_PROVIDER_ID));

    if (existing.length === 0) {
      await db.insert(providersTable).values({
        id: ARBI_PROVIDER_ID,
        name: ARBI_PROVIDER_NAME,
        api_base_url: ARBI_GATEWAY_URL,
      });
      logger.info("Seeded ARBI provider", { id: ARBI_PROVIDER_ID });
    } else {
      // Keep URL in sync with config in case the fork is rebuilt with a new URL.
      await db
        .update(providersTable)
        .set({
          api_base_url: ARBI_GATEWAY_URL,
          name: ARBI_PROVIDER_NAME,
        })
        .where(eq(providersTable.id, ARBI_PROVIDER_ID));
    }

    const existingModels = await db
      .select({ apiName: modelsTable.apiName })
      .from(modelsTable)
      .where(eq(modelsTable.customProviderId, ARBI_PROVIDER_ID));
    const existingApiNames = new Set(existingModels.map((m) => m.apiName));

    for (const m of ARBI_MODELS) {
      if (existingApiNames.has(m.apiName)) continue;
      await db.insert(modelsTable).values({
        customProviderId: ARBI_PROVIDER_ID,
        displayName: m.displayName,
        apiName: m.apiName,
        description: m.description ?? null,
        context_window: m.contextWindow ?? null,
        max_output_tokens: m.maxOutputTokens ?? null,
      });
      logger.info("Seeded ARBI model", { apiName: m.apiName });
    }

    // Remove any models seeded by an older build of this fork that are no
    // longer in ARBI_MODELS, so upgraders don't see stale entries in the
    // picker (e.g. v0.1.0's "Claude Sonnet 4.6" placeholder).
    const allowedApiNames = ARBI_MODELS.map((m) => m.apiName);
    const deleted = await db
      .delete(modelsTable)
      .where(
        and(
          eq(modelsTable.customProviderId, ARBI_PROVIDER_ID),
          notInArray(modelsTable.apiName, allowedApiNames),
        ),
      )
      .returning({ apiName: modelsTable.apiName });
    if (deleted.length) {
      logger.info("Removed stale ARBI models", {
        apiNames: deleted.map((d) => d.apiName),
      });
    }

    normalizeSelectedModel();
    await verifyOrClearArbiKey();
  } catch (err) {
    // Seeding failure should not block app launch.
    logger.error("seedArbiProvider failed", err);
  }
}
