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