# ARBI Code

A minimal fork of [Dyad](https://github.com/dyad-sh/dyad) that turns it into a one-key, one-provider AI app builder for ARBI hackathon events. Attendees download the installer, paste their event key on first launch, and start building.

## How it works

1. App is pre-configured to point at `https://api.arbi.work/v1`
2. First launch shows a single-field modal: "Paste your event key"
3. Key is stored locally and used for every chat completion
4. All built-in providers (OpenAI / Anthropic / Google direct) are hidden from the picker
5. Auto-update is disabled to prevent attendees being pulled to upstream Dyad builds

## What was patched vs upstream Dyad

| File                                                      | What it does                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/event-config.ts`                                     | **New.** Single source of truth — gateway URL, models, brand strings, brand colors.                           |
| `src/main/event-seed.ts`                                  | **New.** On every launch, inserts the ARBI provider + models into the local SQLite DB. Idempotent.            |
| `src/components/EventKeyDialog.tsx`                       | **New.** First-run "paste your key" modal styled with ARBI blue/navy.                                         |
| `src/main.ts`                                             | Calls `seedEventProvider()` after DB init; disables auto-update.                                              |
| `src/ipc/shared/language_model_helpers.ts`                | Hides built-in cloud providers from the picker.                                                               |
| `src/app/layout.tsx`                                      | Mounts `<EventKeyDialog />` at root.                                                                          |
| `package.json`                                            | `productName: "ARBI Code"` (drives installer filenames + window title)                                        |
| `forge.config.ts`                                         | Disables osx/windows signing; sets publisher to `arbi-dev/arbi-code`; renames protocol display to "ARBI Code" |
| `assets/icon/logo.{ico,icns,png,svg}` + `assets/logo.svg` | ARBI shield logo (rendered from `ARBI-frontend/public/favicon.svg`)                                           |

To re-sync with upstream Dyad: `git remote add upstream https://github.com/dyad-sh/dyad.git && git fetch upstream && git rebase upstream/main`. Patches live in their own files so conflicts should be minimal.

## Building installers

CI does this automatically. Locally:

```bash
# Dyad needs Node >=24 <26
npm install
npm run make   # Windows .exe / Mac .dmg / Linux .deb+.rpm+.AppImage in ./out/make/
```

## Releasing via CI

1. `git tag v0.1.0 && git push origin v0.1.0`
2. `.github/workflows/release.yml` builds all three platforms in parallel (~10 min)
3. Installers are uploaded to GitHub Releases as a draft
4. Edit the draft → publish → share the URL

## Verifying the model list

The model names in `src/event-config.ts#EVENT_MODELS` must match what's registered upstream. To check:

```bash
curl -H "Authorization: Bearer $YOUR_KEY" https://api.arbi.work/v1/models | jq '.data[].id'
```

Edit `EVENT_MODELS` to match.

## Attendee experience

1. Download installer from https://github.com/arbi-dev/arbi-code/releases
2. **Windows**: SmartScreen warns "Unrecognized app" → click **More info → Run anyway** (one-time, unsigned build)
   **Mac**: Gatekeeper blocks "unidentified developer" → right-click the app → **Open** → confirm (one-time)
3. App opens → ARBI Code welcome modal → paste event key → Continue
4. Build

## Distributing event keys

You should hand each attendee a virtual key scoped to:

- The models in `EVENT_MODELS`
- A per-attendee dollar budget
- A short expiry (e.g. 24h past event end)

## Code signing (Azure Trusted Signing)

The Windows signing pipeline is **pre-wired** in `.github/workflows/release.yml`
(`forge.config.ts` → `windowsSign.ts`, signtool `/dlib /dmdf`, timestamped).
It is **gated on secrets**: until the `AZURE_*` repo secrets exist the signing
step is skipped and builds ship unsigned — so releases keep working unchanged.

**Reality check:** signing removes the "unknown publisher" UAC prompt and shows
your org name immediately, but Microsoft **SmartScreen is reputation-based** —
the full-screen "Windows protected your PC" prompt fades only as the validated
identity accrues install reputation over a release or few. There is no
legitimate switch for day-one zero-warning on a brand-new identity.

**One-time procurement (Organization identity):**

1. Azure subscription → create a **Trusted Signing account** + **Certificate
   Profile** (Public Trust). Note the **endpoint** (e.g.
   `https://eus.codesigning.azure.net/`), account name, profile name.
2. Complete **Organization identity validation** (legal entity, verifiable
   tenure). The validated org name is what users see.
3. Create an Entra **app registration** (service principal) and grant it the
   **Trusted Signing Certificate Profile Signer** role on the account.

**Add these GitHub repo secrets** (Settings → Secrets → Actions); the workflow
auto-enables signing once present:

| Secret                     | Value                                     |
| -------------------------- | ----------------------------------------- |
| `AZURE_TENANT_ID`          | Entra tenant ID                           |
| `AZURE_CLIENT_ID`          | service-principal app ID                  |
| `AZURE_CLIENT_SECRET`      | service-principal secret                  |
| `TRUSTED_SIGNING_ENDPOINT` | e.g. `https://eus.codesigning.azure.net/` |
| `TRUSTED_SIGNING_ACCOUNT`  | Trusted Signing account name              |
| `TRUSTED_SIGNING_PROFILE`  | certificate profile name                  |

Then cut a normal `arbi-v*` tag. Verify on the resulting `Setup.exe`:
right-click → Properties → **Digital Signatures** shows your org, and
`signtool verify /pa /v ARBI.Code-*.exe` succeeds. (Bump the dlib version
in the workflow's signing step if Microsoft ships a newer client.)

## What's NOT done (intentionally)

- **macOS signing/notarization** — still disabled (`osxSign`/`osxNotarize` undefined); only Windows signing is wired. Add an Apple Developer ID before shipping a Mac build to a wider audience.
- **Custom update server** — auto-update is turned off, not redirected. To ship fixes mid-event, build a new tag and re-distribute the installer URL.
- **Per-attendee logging** — LiteLLM tracks usage per virtual key. No additional telemetry was added to this fork.
