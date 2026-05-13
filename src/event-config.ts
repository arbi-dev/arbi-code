// Event-mode configuration for this fork.
// Edit the placeholders below before building.
//
// Patches that consume this file:
//   - src/main/event-seed.ts            (pre-seeds the provider + models on launch)
//   - src/ipc/shared/language_model_helpers.ts  (hides non-event providers)
//   - src/components/EventKeyDialog.tsx (first-run "paste your key" modal)

export const EVENT_MODE = true;

// Stable id used in the DB. MUST start with "custom::" (Dyad's CUSTOM_PROVIDER_PREFIX).
export const EVENT_PROVIDER_ID = "custom::arbi-litellm";

// Display name shown in the provider picker.
export const EVENT_PROVIDER_NAME = "ARBI";

// Public OpenAI-compatible endpoint. Attendees authenticate with a
// per-attendee virtual key issued to them ahead of the event.
export const EVENT_LITELLM_URL = "https://api.arbi.work/v1";

// Models attendees can pick. apiName = the model id you'd send to LiteLLM.
// displayName = what attendees see in the picker.
//
// NOTE: ARBI's LiteLLM uses STORE_MODEL_IN_DB=True, so the model names below
// must match what's registered in your LiteLLM admin UI. To verify:
//   curl -H "Authorization: Bearer $YOUR_KEY" https://api.arbi.work/v1/models
export const EVENT_MODELS: ReadonlyArray<{
  apiName: string;
  displayName: string;
  description?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
}> = [
  {
    apiName: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    description: "Default event model.",
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
  },
];

// When true, all built-in cloud providers (OpenAI / Anthropic / Google / etc.)
// are hidden from the provider picker. Only the event provider is visible.
// Local providers (Ollama / LM Studio) are kept so power users can still go off-grid.
export const HIDE_OTHER_PROVIDERS = true;

// First-run modal copy.
export const EVENT_BRAND_NAME = "ARBI Code";
export const EVENT_WELCOME_TITLE = "Welcome";
export const EVENT_WELCOME_BODY =
  "Paste the API key from your ARBI event instructions to get started.";

// Brand colors (used by EventKeyDialog).
export const ARBI_BLUE = "#01adef";
export const ARBI_NAVY = "#202b61";
