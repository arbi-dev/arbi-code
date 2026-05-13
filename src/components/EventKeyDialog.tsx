import { useState } from "react";
import { useSettings } from "@/hooks/useSettings";
import {
  EVENT_MODE,
  EVENT_PROVIDER_ID,
  EVENT_BRAND_NAME,
  EVENT_WELCOME_TITLE,
  EVENT_WELCOME_BODY,
  ARBI_BLUE,
  ARBI_NAVY,
} from "@/event-config";
// @ts-ignore
import logo from "../../assets/logo.svg";

// First-run modal for event-mode builds. Shown until the attendee pastes the
// event API key. The key is written into the seeded provider's apiKey field
// so the existing model-client code finds it without any other patches.
export function EventKeyDialog() {
  const { settings, updateSettings } = useSettings();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  if (!EVENT_MODE) return null;
  if (!settings) return null;

  const existing =
    settings.providerSettings?.[EVENT_PROVIDER_ID]?.apiKey?.value;
  if (existing) return null;

  const onSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await updateSettings({
        providerSettings: {
          ...settings.providerSettings,
          [EVENT_PROVIDER_ID]: {
            ...(settings.providerSettings?.[EVENT_PROVIDER_ID] ?? {}),
            apiKey: { value: trimmed },
          },
        },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg bg-white dark:bg-gray-900 p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-3">
          <img src={logo} alt="ARBI" className="h-12 w-12" />
          <h2
            className="text-xl font-semibold"
            style={{ color: ARBI_NAVY }}
          >
            {EVENT_WELCOME_TITLE} to {EVENT_BRAND_NAME}
          </h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          {EVENT_WELCOME_BODY}
        </p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
          }}
          placeholder="Paste your event key"
          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm outline-none focus:ring-2"
          style={{
            // ARBI blue focus ring via inline style — Tailwind ring-* can't read CSS vars at build time.
            ["--tw-ring-color" as string]: ARBI_BLUE,
          }}
        />
        <button
          onClick={onSave}
          disabled={saving || !value.trim()}
          className="mt-4 w-full rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: ARBI_BLUE }}
        >
          {saving ? "Saving..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
