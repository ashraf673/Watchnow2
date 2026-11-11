# Watchnow

**Watchnow** is the receiver (viewer) web application for the HomeLook system.

It allows you to:
- Login with Google
- See remote devices (phones running HomeLook)
- View live camera stream
- View live location
- Send remote controls (switch camera, flashlight, mic, etc.)

---

## Current Status

✅ Basic UI completed  
✅ Google Login structure ready  
✅ Device list page ready  
⏳ Firebase configuration needed  
⏳ WebRTC live streaming (next step)  
⏳ Location viewing (next step)  
⏳ Remote controls (next step)

---

## How to Setup Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use existing)
3. Enable **Authentication** → Sign-in method → **Google**
4. Enable **Realtime Database**
5. Register a **Web app** in the project
6. Copy the Firebase config
7. Paste it inside `js/firebase-config.js`

---

## How to Run Locally

Just open `index.html` in a browser, or host the folder on any static hosting (GitHub Pages, Netlify, Vercel, etc.).

---

## Next Steps

1. Configure Firebase
2. Connect with HomeLook Android app
3. Add WebRTC live camera streaming
4. Add location sharing
5. Add remote controls

---

## Related App

- **HomeLook** → Android sender app (will be created next)

## Automatic Photo Backup (new)

- Partypark2 uploads newly created photos to Firebase Storage when online.
- Watchnow2 reads the media index at `users/{uid}/devices/{deviceId}/media` and downloads the original directly from Firebase Storage using `storagePath` or `downloadURL`.
- Cloud objects and their matching media records are expired after 15 days by the scheduled Cloud Function in `functions/index.js`.

### Deploy the 15-day cloud cleanup

1. Install Firebase CLI and sign in.
2. In this repository, run `cd functions && npm install`.
3. From the repository root, run `firebase use watchnow-a43d8` (or select the correct Firebase project).
4. Deploy with `firebase deploy --only functions:expireCloudPhotos`.

The scheduled function requires a billing-enabled Firebase/Google Cloud project with Cloud Scheduler support. It only removes objects whose metadata contains an `uploadedAt` timestamp older than 15 days and a `storagePath` under `media/{deviceId}/originals/`. If a Storage deletion fails, the database record is retained for a later retry.

### Required photo metadata

Each new media record should include `type: "image"`, `name`, `size`, `date`, `uploadedAt` (Unix milliseconds), `storagePath` and `downloadURL`. The Android client writes this record only after the original upload completes. Configure Firebase Realtime Database and Storage security rules for your account/device ownership before enabling uploads in production.
