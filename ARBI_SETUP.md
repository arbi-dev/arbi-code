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
| `src/arbi-config.ts`                                      | **New.** Single source of truth — gateway URL, models, brand strings, brand colors.                           |
| `src/main/arbi-seed.ts`                                   | **New.** On every launch, inserts the ARBI provider + models into the local SQLite DB. Idempotent.            |
| `src/components/ArbiSetupDialog.tsx`                      | **New.** First-run "paste your key" modal styled with ARBI blue/navy.                                         |
| `src/main.ts`                                             | Calls `seedArbiProvider()` after DB init; disables auto-update.                                               |
| `src/ipc/shared/language_model_helpers.ts`                | Hides built-in cloud providers from the picker.                                                               |
| `src/app/layout.tsx`                                      | Mounts `<ArbiSetupDialog />` at root.                                                                         |
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

The model names in `src/arbi-config.ts#ARBI_MODELS` must match what's registered upstream. To check:

```bash
curl -H "Authorization: Bearer $YOUR_KEY" https://api.arbi.work/v1/models | jq '.data[].id'
```

Edit `ARBI_MODELS` to match.

## Attendee experience

1. Download installer from https://github.com/arbi-dev/arbi-code/releases
2. **Windows**: SmartScreen warns "Unrecognized app" → click **More info → Run anyway** (one-time, unsigned build)
   **Mac**: Gatekeeper blocks "unidentified developer" → right-click the app → **Open** → confirm (one-time)
3. App opens → ARBI Code welcome modal → paste event key → Continue
4. Build

## Distributing event keys

You should hand each attendee a virtual key scoped to:

- The models in `ARBI_MODELS`
- A per-attendee dollar budget
- A short expiry (e.g. 24h past event end)

## Code signing (Azure Trusted Signing)

The Windows signing pipeline is **pre-wired** in `.github/workflows/release.yml`
(`forge.config.ts` → `windowsSign.ts`, signtool `/dlib /dmdf`, timestamped) and
**auto-enables once the `AZURE_*` / `TRUSTED_SIGNING_*` GitHub secrets exist**;
until then builds ship unsigned and releases keep working unchanged.

**The full, corrected end-to-end process** (procurement, the exact `az`/`gh`
commands, the gotchas — role renamed to *Artifact Signing*, identity validation
is a manual Microsoft review, region-specific endpoints, Entra replication
retries, SmartScreen reputation) lives in the knowledge base:
**[rules/windows-code-signing.md](rules/windows-code-signing.md)**. The current
live provisioning state is below.

### Provisioned status (as of 2026-06-02)

Done (via Azure CLI):

- **Trusted Signing account**: `arbicity` (RG `arbi-vault-shared-rg`, region `westeurope`).
- **CI signing identity**: Entra app `arbi-code-signing-ci`
  (client/app id `9bd28e1e-7f5f-4f9d-94a3-873410639d98`, SP object id
  `cebe41ab-b455-4845-9e74-29e580131ed5`), client secret expires 2028-06.
- **Roles on `arbicity`** (both renamed from "Trusted Signing …" → "Artifact Signing …"):
  - CI app SP → **Artifact Signing Certificate Profile Signer** (signs builds).
  - `dmitri.evseev@arbi.city` (guest user) → **Artifact Signing Identity Verifier**
    (lets the human submit the identity validation; required or the portal shows
    "no identity validations available").
- **GitHub secrets set**: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`,
  `TRUSTED_SIGNING_ENDPOINT` = `https://weu.codesigning.azure.net/` (West Europe),
  `TRUSTED_SIGNING_ACCOUNT` = `arbicity`.

Remaining (blocked on Microsoft / manual):

1. **Identity validation** — portal only (`arbicity` → Identity validations → New →
   Organization). No CLI exists for it; Microsoft reviews it by hand (~1–5 business days).
2. After it shows **Completed**, create the **Public Trust certificate profile**:
   ```
   az trustedsigning certificate-profile create \
     -g arbi-vault-shared-rg --account-name arbicity \
     --profile-name arbi-code --profile-type PublicTrust \
     --identity-validation-id <ID from the completed validation>
   ```
3. Set the last secret: `gh secret set TRUSTED_SIGNING_PROFILE -R arbi-dev/arbi-code --body arbi-code`.
4. Cut an `arbi-v*` tag — `release.yml` auto-detects the secrets and signs.

## What's NOT done (intentionally)

- **macOS signing/notarization** — still disabled (`osxSign`/`osxNotarize` undefined); only Windows signing is wired. Add an Apple Developer ID before shipping a Mac build to a wider audience.
- **Custom update server** — auto-update is turned off, not redirected. To ship fixes mid-event, build a new tag and re-distribute the installer URL.
- **Per-attendee logging** — LiteLLM tracks usage per virtual key. No additional telemetry was added to this fork.
