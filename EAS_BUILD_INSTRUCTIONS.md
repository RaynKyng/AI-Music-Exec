# Building Your Native Android Dev Build

This guide gets you from web/Expo Go to a real native Android APK on your Pixel — with **background audio** (Bluetooth/CarPlay-style continuous play) and **push notifications** for collaborator activity.

> All commands below run **on YOUR computer**, not in the cloud workspace. The cloud workspace doesn't have Android SDK access; EAS builds run on Expo's cloud build servers.

---

## ✅ One-Time Setup

### 1. Install the EAS CLI on your machine
```bash
npm install -g eas-cli
```

### 2. Log in to your Expo account
```bash
eas login
```
Use the same Expo account you log in with on the Expo Go app on your Pixel.

### 3. Pull the project to your local machine
You can either:
- **Push to GitHub** from this workspace and clone it locally, or
- **Download** the `/app/frontend` folder via the Emergent download button.

### 4. Initialize EAS for this project (only the first time)
From the `frontend/` directory:
```bash
eas init
```
This will:
- Create the project on Expo's servers under your account
- Print your **EAS `projectId`**
- (or modify `app.json` automatically — confirm yes)

After this runs, open `frontend/app.json` and verify the following are set:
```json
{
  "expo": {
    "owner": "<your-expo-username>",
    "extra": {
      "eas": { "projectId": "<the-uuid-it-gave-you>" }
    }
  }
}
```
The placeholders `REPLACE_WITH_YOUR_EAS_PROJECT_ID` and `REPLACE_WITH_YOUR_EXPO_USERNAME` need to be replaced with your real values (eas init usually does this automatically).

---

## 🚀 Build the Development Client APK (Android, your Pixel)

```bash
cd frontend
eas build --profile development --platform android
```

What happens:
1. EAS uploads your project to its build servers.
2. You'll get a build URL — typically takes **8–15 minutes**.
3. When it's done, you'll see a QR code and a download URL.
4. Open the URL on your Pixel → download → tap to install (you'll need to allow "Install from this source" the first time).

> After it's installed, you'll see an app called **"AI Music Exec"** on your Pixel home screen.

---

## ▶️ Running the App in Development

Once the dev build is installed on your phone:

1. From your computer, in the `frontend/` directory:
   ```bash
   npx expo start --dev-client
   ```
2. Scan the QR code with the **AI Music Exec** app (NOT the Expo Go app).
3. The app loads JS from your computer; you can edit code → save → it hot-reloads.

> For testing background audio in the car, you can also do `eas build --profile preview --platform android` — that produces a standalone APK that runs without the dev server, perfect for production-like testing.

---

## 🔔 Push Notifications

Already configured! Once you install the dev build and log in:

- The app will request notification permission on first launch
- It registers your device's Expo Push Token with the backend
- Whenever your wife creates/updates/comments on shared content, you'll get a push notification on the Pixel
- Tapping a notification deep-links you straight to that song/artist/idea

To **test**, after logging in once on the Pixel:
```bash
# From your computer (replace TOKEN with your JWT from /api/auth/login)
curl -X POST https://<your-backend-url>/api/notifications/test \
  -H "Authorization: Bearer TOKEN"
```
You should get a notification titled **"AI Music Exec — Push notifications are working! 🎵"**.

---

## 🎵 Background Audio in the Car

The dev build (and preview/production builds) include the native audio foreground service permissions, so:
- Plug into Bluetooth in your car
- Open AI Music Exec → play a song from a Release/Playlist
- Switch to Google Maps for GPS — audio keeps playing
- Bluetooth car deck shows the song title and lets you skip/pause via steering-wheel buttons (when the player exposes MediaSession metadata; we already wire that up via expo-audio).

---

## 🏪 Production Builds (Later, when ready for Play Store)

```bash
# Build a Play Store-ready AAB
eas build --profile production --platform android

# Submit it (requires Google Play Console account — $25 one-time)
eas submit --profile production --platform android
```

---

## 🆘 Troubleshooting

| Symptom | Fix |
|---|---|
| `eas init` fails with "owner" mismatch | Edit `app.json` → set `"owner"` to your Expo username (lowercase) |
| Build fails at "credentials" step | `eas credentials` → Android → development → "Set up new keystore" |
| Push notification permission denied | On Pixel: Settings → Apps → AI Music Exec → Notifications → Allow |
| `getExpoPushTokenAsync` warns about projectId | Make sure `app.json → extra.eas.projectId` is the UUID printed by `eas init`, not the placeholder |
| Audio stops when screen locks | Verify `app.json → ios.infoPlist.UIBackgroundModes` contains `audio` and Android permissions include `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (already configured) |

---

That's it. After your first `eas build --profile development --platform android`, you'll have a real native Android app on your Pixel that you can use in the car with full background audio + push notifications. 🚗🎶
