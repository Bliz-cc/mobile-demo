# Bliz mobile attribution demo

A small Expo (React Native) app that shows how to connect a native iOS or Android app to
Bliz mobile attribution. On first open the app asks Bliz: *"Which marketing link brought
this install?"* and receives an encrypted token to attach to later in-app events
(sign-ups, purchases, deposits) so revenue is credited to the original link.

No IDFA, no App Tracking Transparency prompt and no third-party SDK are required.

## How it works

```
1. User taps a Bliz short link        (opens in the phone's browser)
2. User installs / opens your app
3. App  ──POST /api/v1/attribution/mobile/init──▶  Bliz      (this demo)
4. Bliz ──{ sid_token, tier }──────────────────▶  App
5. App stores sid_token and passes it to your backend
6. Backend ──POST /api/v1/attribution/events (blizid = sid_token)──▶ Bliz
```

- **Matching window:** the app open must happen within **24 hours** of the link click, on
  the same device.
- **`tier`:** `prob_high` is a confident match; `prob_low` is a weaker match that Bliz
  records internally; `null` means no match (organic install).
- **One click, one device:** a click can be claimed by a single device. Calling `mobile/init`
  again from the same device returns a fresh token; a different device receives
  `{ "sid_token": null, "tier": null }`.

## Requirements

- Node.js 20 or newer
- A Bliz account with a **public key** (`pk_live_...`) from the dashboard
- iOS Simulator (Xcode), Android Emulator, or the Expo Go app on a real phone

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

| Variable | Description |
| :--- | :--- |
| `EXPO_PUBLIC_BLIZ_API_URL` | Bliz API host that serves `/api/v1/attribution/mobile/init` |
| `EXPO_PUBLIC_BLIZ_PK` | Your public key (`pk_live_...`) |

Use the public key only. Your secret key (`sk_live_...`) must never be placed in a mobile
app, and `mobile/init` rejects it.

API host tips:

- iOS Simulator: `http://localhost:3008` (local API)
- Android Emulator: `http://10.0.2.2:3008` (local API)
- Real phone: your computer's LAN IP, for example `http://192.168.1.20:3008`, or your deployed API URL

## Run

```bash
npx expo start --ios       # iOS Simulator
npx expo start --android   # Android Emulator
npx expo start             # then scan the QR code with Expo Go on a real phone
```

After changing `.env`, restart with `npx expo start --clear` and fully reopen the app.

## Test the full flow

1. On the same device, open one of your Bliz short links in the browser (Safari / Chrome).
2. Open this app and tap **Call mobile/init**.
3. Expected response:

```json
{ "sid_token": "eyJhbGciOiJkaXIi...", "tier": "prob_high" }
```

If nothing matched (for example the link was never opened on this device, or more than 24
hours ago):

```json
{ "sid_token": null, "tier": null }
```

## What the app sends

See `buildInitPayload()` in [App.tsx](App.tsx).

| Field | Source in React Native | Notes |
| :--- | :--- | :--- |
| `sw`, `sh` | `Dimensions.get('screen')` | Full screen in **points / dp**, not physical pixels. Do not use `'window'`. |
| `sc` | `PixelRatio.get()` | Screen scale |
| `tz` | `Intl.DateTimeFormat().resolvedOptions().timeZone` | IANA name such as `Asia/Tbilisi` |
| `lang` | `getLocales()[0].languageTag` (`expo-localization`) | Primary language |
| `os` | `Platform.OS` | `ios` or `android` |
| `mtp` | constant `1` | Mobile devices are touch capable |
| `os_version` | `Platform.Version` | Optional, analytics only |

Native equivalents: iOS `UIScreen.main.bounds` / `.scale`; Android `WindowMetrics` or
`Display.getRealMetrics()` divided by `DisplayMetrics.density`; Flutter
`view.physicalSize / view.devicePixelRatio`.

## Using the token

In your real app, call `mobile/init` **once** on first launch and store `sid_token` securely
(Keychain / Keystore). Then, from your **backend**, send events with your secret key:

```bash
curl -X POST "$BLIZ_API/api/v1/attribution/events" \
  -H "Authorization: Bearer sk_live_YOUR_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "blizid": "<sid_token>", "event_source": "MOBILE", ... }'
```

Refer to the Bliz API documentation for the complete event fields.

## Troubleshooting

| Symptom | Likely cause |
| :--- | :--- |
| `sid_token: null` | The link was not opened on this device within 24 hours, the key belongs to a different account than the link, or the click was already claimed by another device. |
| HTTP 403 | Missing or invalid public key. Use a `pk_live_...` key, not `sk_live_...`. |
| Request failed | Wrong API URL for your device type (see API host tips). A real phone cannot reach `localhost`. |
| Key field is empty | `.env` not loaded. Restart Expo with `--clear` and reopen the app. |

## Project layout

```
App.tsx        Demo screen and the mobile/init call
.env.example   Environment template (copy to .env, never commit .env)
app.json       Expo configuration
```
