# Windows Code Signing (Azure Trusted Signing)

How to set up and run signed Windows release builds. The pipeline is pre-wired in
`.github/workflows/release.yml` (→ `forge.config.ts` → `windowsSign.ts`,
`signtool /dlib /dmdf`, timestamped) and **auto-enables once the `AZURE_*` /
`TRUSTED_SIGNING_*` GitHub secrets exist**; until then builds ship unsigned and
releases keep working.

> Instance-specific values for this repo's actual deployment (account name,
> resource group, app/SP ids, which secrets are set, current status) live in
> [ARBI_SETUP.md](../ARBI_SETUP.md#provisioned-status-as-of-2026-06-02), not here.
> This guide is generic — fill in the placeholders below.

```bash
# Set these once for the commands in this guide:
SUB=$(az account show --query id -o tsv)
RG=<resource-group>
ACCOUNT=<trusted-signing-account>
CI_APP=<ci-app-display-name>          # e.g. <product>-signing-ci
PROFILE=<certificate-profile-name>
REPO=<github-owner/repo>
SCOPE="/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.CodeSigning/codeSigningAccounts/$ACCOUNT"
```

## Hard-won facts (read these first)

- **Do NOT create a new Entra tenant.** Use the Azure subscription's existing
  default Microsoft Entra ID directory. Azure AD **B2C** and **Entra External ID**
  are CIAM products and *cannot* secure Azure services like Trusted Signing.
- **Two distinct RBAC roles, both renamed `Trusted Signing …` → `Artifact Signing …`**
  (the old names fail with `Role '...' doesn't exist`):
  - **`Artifact Signing Identity Verifier`** — assign to the **human** who will
    submit/manage identity validations in the portal. Without it the portal shows
    *"no identity validations available"* / nags *"ensure you have the Artifact
    Signing Identity Verifier role"*. This is a **missing-role** symptom, not a
    region problem.
  - **`Artifact Signing Certificate Profile Signer`** — assign to the **CI service
    principal** that signs builds.
- **Region eligibility** — Artifact Signing identity validation is available to
  organizations in the **USA, Canada, EU, and UK**. (The account itself can live
  in a region like West Europe regardless.)
- **Identity validation is the gate and is NOT scriptable.** `az trustedsigning`
  only exposes `certificate-profile`. Identity validation is portal-only and
  **Microsoft reviews it by hand (~1–5 business days)**. No certificate profile —
  and therefore no signing — until it shows **Completed**.
- **The endpoint is region-specific.** West Europe = `https://weu.codesigning.azure.net/`,
  East US = `https://eus.codesigning.azure.net/`, etc. Match the account's region.
- **Entra replication lag** — `az ad sp create` and `az role assignment create`
  often fail for a few seconds after `az ad app create` ("does not reference a
  valid application object"). Retry with a short backoff; it succeeds within ~10–20s.
- **SmartScreen is reputation-based.** Signing removes the "unknown publisher"
  UAC prompt and shows your org name, but the full-screen "Windows protected your
  PC" warning only fades as the validated identity accrues install reputation over
  a release or few. There is no day-one zero-warning for a brand-new identity.

## End-to-end process

### 1. One-time procurement (manual, portal)
1. In the **existing** subscription/directory, create a **Trusted Signing account**
   (search "Trusted Signing") + note its region.
2. Grant the human who will do validation the **Identity Verifier** role
   (otherwise the portal shows "no identity validations available"):
   ```bash
   # guest/B2B users: use the #EXT# UPN, e.g. user_domain.com#EXT#@tenant.onmicrosoft.com
   USER_OID=$(az ad user show --id "<upn>" --query id -o tsv)
   az role assignment create --assignee-object-id "$USER_OID" --assignee-principal-type User \
     --role "Artifact Signing Identity Verifier" --scope "$SCOPE"
   ```
   Wait a few minutes for propagation, then refresh the portal.
3. The account → **Identity validations** → **New** → **Organization** → enter the
   legal entity details (the approved name is what users see). Submit and wait for
   Microsoft → status **Completed**.

### 2. CI signing identity (scriptable — `az`)
```bash
APP_ID=$(az ad app create --display-name "$CI_APP" \
  --sign-in-audience AzureADMyOrg --query appId -o tsv)

# Retry: Entra replication lag right after app create
for i in $(seq 6); do az ad sp create --id "$APP_ID" && break; sleep 10; done
SP_OID=$(az ad sp show --id "$APP_ID" --query id -o tsv)

az role assignment create --assignee-object-id "$SP_OID" \
  --assignee-principal-type ServicePrincipal \
  --role "Artifact Signing Certificate Profile Signer" --scope "$SCOPE"
```

### 3. Certificate profile (scriptable — only AFTER identity validation Completed)
```bash
az extension add --name trustedsigning
az trustedsigning certificate-profile create -g "$RG" --account-name "$ACCOUNT" \
  --profile-name "$PROFILE" --profile-type PublicTrust \
  --identity-validation-id <ID from the completed validation>
```

### 4. GitHub Actions secrets (scriptable — `gh`)
Pipe the client secret via stdin so it never lands in shell history / process args:
```bash
SECRET=$(az ad app credential reset --id "$APP_ID" --years 2 --query password -o tsv)
printf '%s' "$SECRET" | gh secret set AZURE_CLIENT_SECRET -R "$REPO"; unset SECRET
gh secret set AZURE_TENANT_ID          -R "$REPO" --body "$(az account show --query tenantId -o tsv)"
gh secret set AZURE_CLIENT_ID          -R "$REPO" --body "$APP_ID"
gh secret set TRUSTED_SIGNING_ENDPOINT -R "$REPO" --body "https://<region>.codesigning.azure.net/"
gh secret set TRUSTED_SIGNING_ACCOUNT  -R "$REPO" --body "$ACCOUNT"
gh secret set TRUSTED_SIGNING_PROFILE  -R "$REPO" --body "$PROFILE"
```

### 5. Release
Cut an `arbi-v*` tag → `release.yml` detects the secrets and signs. Verify on the
`Setup.exe`: Properties → **Digital Signatures** shows the org, and
`signtool verify /pa /v <Installer>.exe` succeeds. Bump the dlib client version in
the workflow's signing step if Microsoft ships a newer one.

## Intentionally NOT done
- **macOS signing/notarization** — disabled (`osxSign`/`osxNotarize` undefined);
  needs an Apple Developer ID, separate from Azure.
