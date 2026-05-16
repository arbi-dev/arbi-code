import { db } from "@/db";
import {
  language_model_providers as providersTable,
  language_models as modelsTable,
} from "@/db/schema";
import { and, eq, notInArray } from "drizzle-orm";
import log from "electron-log";
import {
  EVENT_MODE,
  EVENT_PROVIDER_ID,
  EVENT_PROVIDER_NAME,
  EVENT_LITELLM_URL,
  EVENT_MODELS,
} from "../event-config";
import { readSettings, writeSettings } from "./settings";

const logger = log.scope("event-seed");

// Reset selectedModel to a valid event entry when it points at:
//   - upstream Dyad's `auto` router (hidden from this fork's picker), OR
//   - a stale event-model that no longer exists in EVENT_MODELS (e.g.
//     v0.1.0's "claude-sonnet-4-6" placeholder after upgrading to v0.1.1+)
function normalizeSelectedModel(): void {
  try {
    const settings = readSettings();
    const sel = settings.selectedModel;
    const validNames = new Set(EVENT_MODELS.map((m) => m.apiName));
    const stale =
      sel?.provider === "auto" ||
      (sel?.provider === EVENT_PROVIDER_ID && !validNames.has(sel.name));
    if (stale) {
      writeSettings({
        selectedModel: {
          name: EVENT_MODELS[0].apiName,
          provider: EVENT_PROVIDER_ID,
        },
      });
      logger.info("Reset selectedModel to event default", {
        previous: sel,
      });
    }
  } catch (err) {
    logger.error("normalizeSelectedModel failed", err);
  }
}

// Self-heal a stored event key that the gateway rejects.
//
// The diagnostic proved a valid key works end-to-end, so a stored key that
// fails auth means the persisted value is wrong/expired/corrupted (e.g. an
// older build encrypted it via Electron safeStorage and the decrypt
// round-trip mangled it on packaged Windows). EventKeyDialog only re-prompts
// when NO key is stored, so a truthy-but-broken key leaves every chat failing
// silently with no error and no recovery. Clearing it makes the dialog
// re-appear. Network errors are treated as transient (key left untouched).
async function verifyOrClearEventKey(): Promise<void> {
  try {
    const settings = readSettings();
    const key = settings.providerSettings?.[EVENT_PROVIDER_ID]?.apiKey?.value;
    if (!key) return;

    let res;
    try {
      res = await fetch(`${EVENT_LITELLM_URL}/models`, {
        headers: { Authorization: `Bearer ${key}` },
      });
    } catch (netErr) {
      logger.warn(
        "Event key verification skipped (network error); leaving key as-is",
        netErr,
      );
      return;
    }

    if (res.ok) {
      logger.info("Stored event key verified OK against gateway");
      return;
    }

    if (res.status === 401 || res.status === 403) {
      const providerSettings = { ...settings.providerSettings };
      const ev = { ...providerSettings[EVENT_PROVIDER_ID] };
      delete ev.apiKey;
      providerSettings[EVENT_PROVIDER_ID] = ev;
      writeSettings({ providerSettings });
      logger.error(
        `Event key rejected by ${EVENT_LITELLM_URL} (HTTP ${res.status}); ` +
          "cleared the stored key so the setup dialog re-prompts instead of " +
          "failing silently.",
      );
      return;
    }

    logger.warn(
      `Event key check returned HTTP ${res.status}; leaving key as-is`,
    );
  } catch (err) {
    logger.error("verifyOrClearEventKey failed", err);
  }
}

// Idempotent: inserts the event provider + models into the local SQLite DB
// on every launch if they're not already present. Safe to run unconditionally.
export async function seedEventProvider(): Promise<void> {
  if (!EVENT_MODE) return;

  try {
    const existing = await db
      .select()
      .from(providersTable)
      .where(eq(providersTable.id, EVENT_PROVIDER_ID));

    if (existing.length === 0) {
      await db.insert(providersTable).values({
        id: EVENT_PROVIDER_ID,
        name: EVENT_PROVIDER_NAME,
        api_base_url: EVENT_LITELLM_URL,
      });
      logger.info("Seeded event provider", { id: EVENT_PROVIDER_ID });
    } else {
      // Keep URL in sync with config in case the fork is rebuilt with a new URL.
      await db
        .update(providersTable)
        .set({
          api_base_url: EVENT_LITELLM_URL,
          name: EVENT_PROVIDER_NAME,
        })
        .where(eq(providersTable.id, EVENT_PROVIDER_ID));
    }

    const existingModels = await db
      .select({ apiName: modelsTable.apiName })
      .from(modelsTable)
      .where(eq(modelsTable.customProviderId, EVENT_PROVIDER_ID));
    const existingApiNames = new Set(existingModels.map((m) => m.apiName));

    for (const m of EVENT_MODELS) {
      if (existingApiNames.has(m.apiName)) continue;
      await db.insert(modelsTable).values({
        customProviderId: EVENT_PROVIDER_ID,
        displayName: m.displayName,
        apiName: m.apiName,
        description: m.description ?? null,
        context_window: m.contextWindow ?? null,
        max_output_tokens: m.maxOutputTokens ?? null,
      });
      logger.info("Seeded event model", { apiName: m.apiName });
    }

    // Remove any models seeded by an older build of this fork that are no
    // longer in EVENT_MODELS, so upgraders don't see stale entries in the
    // picker (e.g. v0.1.0's "Claude Sonnet 4.6" placeholder).
    const allowedApiNames = EVENT_MODELS.map((m) => m.apiName);
    const deleted = await db
      .delete(modelsTable)
      .where(
        and(
          eq(modelsTable.customProviderId, EVENT_PROVIDER_ID),
          notInArray(modelsTable.apiName, allowedApiNames),
        ),
      )
      .returning({ apiName: modelsTable.apiName });
    if (deleted.length) {
      logger.info("Removed stale event models", {
        apiNames: deleted.map((d) => d.apiName),
      });
    }

    normalizeSelectedModel();
    await verifyOrClearEventKey();
  } catch (err) {
    // Seeding failure should not block app launch.
    logger.error("seedEventProvider failed", err);
  }
}
