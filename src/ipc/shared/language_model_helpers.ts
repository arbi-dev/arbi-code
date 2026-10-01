import { db } from "@/db";
import {
  language_model_providers as languageModelProvidersSchema,
  language_models as languageModelsSchema,
} from "@/db/schema";
import type { LanguageModelProvider, LanguageModel } from "@/ipc/types";
import { eq } from "drizzle-orm";
import log from "electron-log";
import {
  CLOUD_PROVIDERS,
  LOCAL_PROVIDERS,
  MODEL_OPTIONS,
  PROVIDER_TO_ENV_VAR,
} from "./language_model_constants";
import { getBuiltinLanguageModelCatalog } from "./remote_language_model_catalog";
import {
  ARBI_MODE,
  ARBI_PROVIDER_ID,
  HIDE_OTHER_PROVIDERS,
} from "../../arbi-config";

const logger = log.scope("language_model_helpers");
/**
 * Fetches language model providers from both the database (custom) and hardcoded constants (cloud),
 * merging them with custom providers taking precedence.
 * @returns A promise that resolves to an array of LanguageModelProvider objects.
 */
export async function getLanguageModelProviders(): Promise<
  LanguageModelProvider[]
> {
  // Fetch custom providers from the database
  const customProvidersDb = await db
    .select()
    .from(languageModelProvidersSchema);

  const customProvidersMap = new Map<string, LanguageModelProvider>();
  for (const cp of customProvidersDb) {
    customProvidersMap.set(cp.id, {
      id: cp.id,
      name: cp.name,
      apiBaseUrl: cp.api_base_url,
      envVarName: cp.env_var_name ?? undefined,
      type: "custom",
      // hasFreeTier, websiteUrl, gatewayPrefix are not in the custom DB schema
      // They will be undefined unless overridden by hardcoded values if IDs match
    });
  }

  const builtinCatalog = await getBuiltinLanguageModelCatalog();
  logger.debug("Loaded builtin catalog for provider list", {
    source: builtinCatalog.source,
    version: builtinCatalog.version,
    providerCount: builtinCatalog.providers.length,
  });

  const hardcodedProviders: LanguageModelProvider[] = [
    ...builtinCatalog.providers,
  ];

  // Merge in any CLOUD_PROVIDERS not present in the remote catalog
  // (e.g. auto, azure, bedrock which are not in the remote API).
  for (const [providerId, providerDetails] of Object.entries(CLOUD_PROVIDERS)) {
    if (!hardcodedProviders.some((p) => p.id === providerId)) {
      hardcodedProviders.push({
        id: providerId,
        name: providerDetails.displayName,
        hasFreeTier: providerDetails.hasFreeTier,
        websiteUrl: providerDetails.websiteUrl,
        gatewayPrefix: providerDetails.gatewayPrefix,
        secondary: providerDetails.secondary,
        envVarName:
          PROVIDER_TO_ENV_VAR[providerId as keyof typeof PROVIDER_TO_ENV_VAR] ??
          undefined,
        type: "cloud",
      });
    }
  }

  for (const providerKey in LOCAL_PROVIDERS) {
    if (Object.prototype.hasOwnProperty.call(LOCAL_PROVIDERS, providerKey)) {
      const key = providerKey as keyof typeof LOCAL_PROVIDERS;
      const providerDetails = LOCAL_PROVIDERS[key];
      hardcodedProviders.push({
        id: key,
        name: providerDetails.displayName,
        hasFreeTier: providerDetails.hasFreeTier,
        type: "local",
      });
    }
  }

  const all = [...hardcodedProviders, ...customProvidersMap.values()];

  // Test harnesses (Vitest, E2E builds) register their own fake provider
  // ("testing"), which the ARBI whitelist would otherwise hide.
  if (process.env.VITEST === "true" || process.env.E2E_TEST_BUILD === "true") {
    return all;
  }

  return applyArbiProviderFilter(all);
}

/**
 * ARBI mode: hide every provider except the seeded ARBI provider and local
 * providers (Ollama / LM Studio), so users see one option in the picker.
 * When ARBI_MODE (or HIDE_OTHER_PROVIDERS) is off, the list is returned as-is.
 *
 * Extracted as a pure helper so the ARBI provider-hiding invariant can be unit
 * tested without standing up the DB/env that getLanguageModelProviders needs.
 */
export function applyArbiProviderFilter<
  T extends { id: string; type?: string },
>(providers: T[]): T[] {
  if (ARBI_MODE && HIDE_OTHER_PROVIDERS) {
    return providers.filter(
      (p) => p.id === ARBI_PROVIDER_ID || p.type === "local",
    );
  }
  return providers;
}

/**
 * Fetches language models for a specific provider.
 * @param obj An object containing the providerId.
 * @returns A promise that resolves to an array of LanguageModel objects.
 */
export async function getLanguageModels({
  providerId,
}: {
  providerId: string;
}): Promise<LanguageModel[]> {
  const allProviders = await getLanguageModelProviders();
  const provider = allProviders.find((p) => p.id === providerId);

  if (!provider) {
    console.warn(`Provider with ID "${providerId}" not found.`);
    return [];
  }

  // Get custom models from DB for all provider types
  let customModels: LanguageModel[] = [];

  try {
    const customModelsDb = await db
      .select({
        id: languageModelsSchema.id,
        displayName: languageModelsSchema.displayName,
        apiName: languageModelsSchema.apiName,
        description: languageModelsSchema.description,
        maxOutputTokens: languageModelsSchema.max_output_tokens,
        contextWindow: languageModelsSchema.context_window,
      })
      .from(languageModelsSchema)
      .where(
        isCustomProvider({ providerId })
          ? eq(languageModelsSchema.customProviderId, providerId)
          : eq(languageModelsSchema.builtinProviderId, providerId),
      );

    customModels = customModelsDb.map((model) => ({
      ...model,
      description: model.description ?? "",
      tag: undefined,
      maxOutputTokens: model.maxOutputTokens ?? undefined,
      contextWindow: model.contextWindow ?? undefined,
      type: "custom",
    }));
  } catch (error) {
    console.error(
      `Error fetching custom models for provider "${providerId}" from DB:`,
      error,
    );
    // Continue with empty custom models array
  }

  // If it's a cloud provider, also get the hardcoded models
  let hardcodedModels: LanguageModel[] = [];
  if (provider.type === "cloud") {
    const builtinCatalog = await getBuiltinLanguageModelCatalog();
    logger.debug("Loading cloud models from builtin catalog", {
      providerId,
      source: builtinCatalog.source,
      version: builtinCatalog.version,
      hasProviderModels: providerId in builtinCatalog.modelsByProvider,
    });
    if (providerId in builtinCatalog.modelsByProvider) {
      hardcodedModels = builtinCatalog.modelsByProvider[providerId] || [];
    } else if (providerId in MODEL_OPTIONS) {
      // Fall back to hardcoded MODEL_OPTIONS for providers not in the remote
      // catalog (e.g. auto, azure, bedrock).
      hardcodedModels = MODEL_OPTIONS[providerId].map((model) => ({
        apiName: model.name,
        displayName: model.displayName,
        description: model.description,
        tag: model.tag,
        tagColor: model.tagColor,
        maxOutputTokens: model.maxOutputTokens,
        contextWindow: model.contextWindow,
        temperature: model.temperature,
        dollarSigns: model.dollarSigns,
        effortSettings: model.effortSettings,
        type: "cloud" as const,
      }));
    } else {
      console.warn(
        `Provider "${providerId}" is cloud type but not found in builtin catalog or MODEL_OPTIONS.`,
      );
    }
  }

  return [...hardcodedModels, ...customModels];
}

/**
 * Fetches all language models grouped by their provider IDs.
 * @returns A promise that resolves to a Record mapping provider IDs to arrays of LanguageModel objects.
 */
export async function getLanguageModelsByProviders(): Promise<
  Record<string, LanguageModel[]>
> {
  const providers = await getLanguageModelProviders();

  // Fetch all models concurrently
  const modelPromises = providers
    .filter((p) => p.type !== "local")
    .map(async (provider) => {
      const models = await getLanguageModels({ providerId: provider.id });
      return { providerId: provider.id, models };
    });

  // Wait for all requests to complete
  const results = await Promise.all(modelPromises);

  // Convert the array of results to a record
  const record: Record<string, LanguageModel[]> = {};
  for (const result of results) {
    record[result.providerId] = result.models;
  }

  return record;
}

export function isCustomProvider({ providerId }: { providerId: string }) {
  return providerId.startsWith(CUSTOM_PROVIDER_PREFIX);
}

export const CUSTOM_PROVIDER_PREFIX = "custom::";
