// ARBI-mode configuration for this fork.
//
// ARBI_MODE is the master switch for this whitelabel build of Dyad: it
// pre-seeds a single provider + models, hides everything else, and ships a
// prebaked API key so users can start with zero setup. Originally built for
// hackathon events, but used for any turnkey ARBI deployment.
//
// Edit the placeholders below before building.
//
// Modules that consume this file:
//   - src/main/arbi-seed.ts                       (pre-seeds the provider + models on launch)
//   - src/ipc/shared/language_model_helpers.ts    (hides all other providers)
//   - src/components/ArbiSetupDialog.tsx          (first-run "paste your key" modal)

export const ARBI_MODE = true;

// Stable id used in the DB. MUST start with "custom::" (Dyad's CUSTOM_PROVIDER_PREFIX).
export const ARBI_PROVIDER_ID = "custom::arbi-litellm";

// Display name shown in the provider picker.
export const ARBI_PROVIDER_NAME = "ARBI";

// Public OpenAI-compatible endpoint. Attendees authenticate with a
// per-attendee virtual key issued to them ahead of the event.
export const ARBI_GATEWAY_URL = "https://api.arbi.work/v1";

// Models attendees can pick. apiName = the model id you'd send to LiteLLM.
// displayName = what attendees see in the picker.
//
// NOTE: ARBI's LiteLLM uses STORE_MODEL_IN_DB=True, so the model names below
// must match what's registered in your LiteLLM admin UI. To verify:
//   curl -H "Authorization: Bearer $YOUR_KEY" https://api.arbi.work/v1/models
export const ARBI_MODELS: ReadonlyArray<{
  apiName: string;
  displayName: string;
  description?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
}> = [
  {
    apiName: "Fast",
    displayName: "Fast",
    description: "ARBI fast model for quick iterations.",
  },
  {
    apiName: "Wise",
    displayName: "Wise",
    description: "ARBI reasoning model.",
  },
];

// When true, all built-in cloud providers (OpenAI / Anthropic / Google / etc.)
// are hidden from the provider picker. Only the event provider is visible.
// Local providers (Ollama / LM Studio) are kept so power users can still go off-grid.
export const HIDE_OTHER_PROVIDERS = true;

// When true, every Dyad Pro / Dyad Free upsell and Pro-only control is hidden. This fork has no Dyad Pro
// backend, so those controls could only be dead ends that send users to dyad.sh.
//
// Upstream's unit tests exercise those Dyad features, so under Vitest (MODE "test") they stay on and the
// suite keeps tracking upstream; ARBI-specific tests turn this on with vi.mock("@/arbi-config", ...).
// (`process` does not exist in the packaged renderer, hence the typeof guard.)
export const HIDE_PRO_UPSELLS = !(
  typeof process !== "undefined" && process.env?.VITEST === "true"
);

// First-run modal copy.
export const ARBI_BRAND_NAME = "ARBI Code";
export const ARBI_WELCOME_TITLE = "Welcome";
export const ARBI_WELCOME_BODY =
  "Paste the API key from your ARBI event instructions to get started.";

// Attribution. ARBI Code is a whitelabel build of Dyad (the open-source AI app
// builder) — a convenience wrapper that ships preconfigured with an event API
// key so attendees can build without any setup. Credit where it's due.
export const UPSTREAM_NAME = "Dyad";
export const UPSTREAM_URL = "https://dyad.sh";
export const ARBI_CREDIT_LINE =
  "ARBI Code is a whitelabel build of Dyad, the open-source AI app builder.";

// Brand colors (used by ArbiSetupDialog).
export const ARBI_BLUE = "#01adef";
export const ARBI_NAVY = "#202b61";
