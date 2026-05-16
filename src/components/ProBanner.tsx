// ARBI fork: ARBI Code Pro is hidden in event builds, so every Pro upsell surface
// here renders nothing. Exports + signatures are preserved so existing
// consumers (home, ImageGeneratorDialog, AIGeneratorTab) keep compiling.
// Original upstream content intentionally replaced — see git history.

export function ProBanner() {
  return null;
}

export function ManageDyadProButton(_props: { className?: string }) {
  return null;
}

export function SetupDyadProButton() {
  return null;
}

export function AiAccessBanner() {
  return null;
}

export function SmartContextBanner() {
  return null;
}
