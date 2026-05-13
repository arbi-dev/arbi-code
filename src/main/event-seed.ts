import { db } from "@/db";
import {
  language_model_providers as providersTable,
  language_models as modelsTable,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import log from "electron-log";
import {
  EVENT_MODE,
  EVENT_PROVIDER_ID,
  EVENT_PROVIDER_NAME,
  EVENT_LITELLM_URL,
  EVENT_MODELS,
} from "../event-config";

const logger = log.scope("event-seed");

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
  } catch (err) {
    // Seeding failure should not block app launch.
    logger.error("seedEventProvider failed", err);
  }
}
