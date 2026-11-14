# Deploying Partypark backend

## Current state

The Worker API is implemented in `src/index.js`. It is not production-ready until you configure secrets, apply all three D1 migrations, deploy from this folder, and test the routes. It deliberately does not expose Drive credentials to Android or Watchnow.

## 1. D1 migrations

Apply these files in this order to the `partypark-db` database:

1. `../../migrations/0001_initial.sql`
2. `../../migrations/0002_device_drive_folder.sql`
3. `../../migrations/0003_device_token_expiry.sql`

The first migration has already been applied manually in the Cloudflare console. Apply only migrations 0002 and 0003 now. Do not rerun 0001.

## 2. Worker configuration

Bind the existing D1 database as `DB`.

Set these Worker secrets (Workers & Pages → partypark-backend → Settings → Variables and Secrets):

- `FIREBASE_WEB_API_KEY`: the Firebase Web API key from the Watchnow2 Firebase config. This is used only to ask Firebase Auth to verify owner ID tokens.
- `GOOGLE_CLIENT_ID`: OAuth client ID for the central Drive administrator account.
- `GOOGLE_CLIENT_SECRET`: matching OAuth client secret.
- `GOOGLE_REFRESH_TOKEN`: refresh token obtained by the administrator OAuth consent flow for the central Drive account.

Optional plain-text variables:

- `DRIVE_ROOT_FOLDER_ID`: Drive folder ID under which per-device folders are created. Leave unset to create device folders in the Drive root.
- `ALLOWED_ORIGINS`: comma-separated exact Watchnow website origins, e.g. `https://your-watchnow-site.example`. Android requests without an Origin header are allowed.

Never paste secrets into GitHub, chat, source code, or the APK. Do not use the central Gmail password. The refresh token must be generated through OAuth consent and stored only as a Worker secret.

## 3. Google OAuth

Use the narrow `https://www.googleapis.com/auth/drive.file` scope. Authorize only the central administrator Google account. The OAuth client must be a Web application with the redirect URI configured for the secure admin callback that will be added before production. Do not invent a refresh token or use a token from a different OAuth client.

## 4. Deployment

Connect this repository to Cloudflare Workers using the branch `feature/photo-backup-v1`, set the root directory to `backend/worker`, and use:

- Build command: leave empty
- Deploy command: `npm run deploy`

The D1 database ID in `wrangler.toml` is a placeholder and must be replaced with the real ID from the Cloudflare D1 database overview before CLI deployment. The dashboard-created binding can instead be configured in the Worker settings, but keep it named exactly `DB`.

## 5. API routes implemented

- `GET /health`
- `POST /v1/activation-codes` (Firebase owner ID token)
- `POST /v1/devices/redeem` (one-time 8-digit code)
- `GET /v1/devices` (Firebase owner ID token)
- `DELETE /v1/devices/:deviceId` (Firebase owner ID token)
- `POST /v1/photos/upload-sessions` (device bearer token)
- `PUT /v1/photos/upload-sessions/:sessionId` (device bearer token, max 8 MiB per request)
- `POST /v1/photos/upload-sessions/:sessionId/complete` (device bearer token; body includes Drive file ID and optional capturedAt)
- `GET /v1/devices/:deviceId/photos` (Firebase owner ID token)
- `GET /v1/photos/:photoId/content` (Firebase owner ID token)

## 6. Important remaining integration work

- Partypark2 Android must call the activation redeem and resumable upload endpoints, persist its device token securely, and keep local queued originals until upload completion.
- Watchnow2 must create codes through this API, pass Firebase ID tokens, and load photo lists/content from these routes.
- Add a secure admin OAuth callback to obtain and rotate the central Drive refresh token. Do not create this by placing credentials in browser JavaScript.
- Add thumbnail generation/proxying and UI retention indicators.
- Replace the current Firebase Storage worker and scheduled Firebase Cloud Function only after both clients have been migrated.
- Tighten Firebase RTDB rules only after all app components authenticate correctly. Current public rules are unsafe and must not be treated as production security.
- Test one owner, one device, one photo, device revocation, expired code, and 15-day deletion before enabling real users.

The Worker currently uses Firebase Identity Toolkit's `accounts:lookup` endpoint to validate owner ID tokens. It does not mint Firebase custom tokens; device API authorization is independently scoped through hashed bearer tokens in D1.


## GitHub Actions deployment (avoids the Cloudflare GitHub redirect issue)

A workflow is included at `.github/workflows/deploy-partypark-backend.yml`. It deploys on pushes to `feature/photo-backup-v1` that change the backend or workflow, and can also be started manually from GitHub Actions.

Add these three repository Actions secrets in GitHub → Watchnow2 → Settings → Secrets and variables → Actions → New repository secret:

- `CLOUDFLARE_API_TOKEN`: Cloudflare API token with permission to edit Workers scripts and D1 for this account.
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID.
- `D1_DATABASE_ID`: the UUID shown on the `partypark-db` D1 database overview.

The workflow substitutes the D1 ID into the Wrangler config at deploy time. Do not commit real credentials or IDs into the repository. The Worker runtime secrets listed above (Firebase API key and Google OAuth credentials) must still be added separately in Cloudflare Worker Settings → Variables and Secrets.

After adding the three Actions secrets, open the GitHub Actions tab and run **Deploy Partypark backend**, or push a backend change to the feature branch. Confirm the run succeeds and then check `GET /health`.

Do not deploy to the production/main branch. This workflow is intentionally limited to `feature/photo-backup-v1`.
