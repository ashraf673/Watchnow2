# Partypark / Watchnow photo-backup backend

This service is the trusted bridge between Partypark2, Watchnow2, Firebase, and the administrator's Google Drive.

## Security boundary

- Never put the central Google account password, OAuth refresh token, service-account private key, or Drive credentials in either client app.
- Android devices authenticate to this service with short-lived device credentials issued after one-time activation-code redemption.
- Watchnow owners authenticate with Firebase Authentication. The service must verify Firebase ID tokens before returning device/photo data.
- A device credential is restricted to one registered device. It cannot list other devices, read other devices' photos, or change ownership.
- Activation codes are random, single-use, expire quickly, and are consumed atomically.
- Keep the existing Firebase Realtime Database rules unchanged until both clients use verified authentication and the replacement rules have been tested.

## Planned Cloudflare resources

- Worker: HTTP API and Google Drive proxy.
- D1: activation codes, device registrations, device-token hashes, Drive file IDs, upload state, and expiry timestamps.
- Worker secrets: Firebase project configuration needed for token verification, Google OAuth client secret, and Google Drive refresh token.
- Cron Trigger: retryable cleanup of cloud photos older than 15 days.

No Firebase Storage or Firebase Cloud Functions are required for this design.

## API contract

All endpoints are versioned under `/v1`.

| Method | Path | Caller | Purpose |
| --- | --- | --- | --- |
| POST | `/v1/activation-codes` | Authenticated Watchnow owner | Create a short-lived, one-use code |
| POST | `/v1/devices/redeem` | Partypark | Redeem code and register device |
| POST | `/v1/photos/upload-sessions` | Registered Partypark device | Start a Drive resumable upload |
| PUT | `/v1/photos/upload-sessions/:id` | Registered Partypark device | Transfer a bounded upload chunk |
| POST | `/v1/photos/upload-sessions/:id/complete` | Registered Partypark device | Finalize upload and save metadata |
| GET | `/v1/devices` | Authenticated Watchnow owner | List only this owner's devices |
| GET | `/v1/devices/:deviceId/photos` | Authenticated Watchnow owner | List photo metadata and thumbnail information |
| GET | `/v1/photos/:photoId/content` | Authenticated Watchnow owner | Stream the original from Drive |
| DELETE | `/v1/devices/:deviceId` | Authenticated Watchnow owner | Revoke a device |
| GET | `/health` | Public | Health check only |

## Photo lifecycle

1. Partypark copies newly captured images to its private local queue after the user opts in.
2. The device uploads originals using resumable, chunked transfer. A successful Drive upload is required before the local queued copy can be removed.
3. The backend stores Drive file IDs and metadata. Watchnow lists metadata and requests content through the backend; Drive URLs and credentials are never exposed to clients.
4. A scheduled cleanup deletes Drive originals and their metadata after 15 days from upload time. Failed deletions remain queued for retry.
5. Unuploaded local queue items expire after 20 days, as specified by the app's retention policy.

## Deployment status

This folder is the deployment design and schema starting point. The Worker implementation, token verification, Drive OAuth connection, migrations, and integration tests must be completed before enabling uploads or changing Firebase rules.
