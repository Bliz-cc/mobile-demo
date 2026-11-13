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
5. App stores sid_token
6. App  ──POST /mobile/analytics/v1 (blizid = sid_token)──▶  Bliz   (screen views, taps, sign-ups, purchases)
```

The SDK only needs two calls: `mobile/init` once to get the token, and `mobile/analytics/v1`
for every later event while a token exists. Both use the public key.

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

## Sending events

In your real app, call `mobile/init` **once** on first launch and store `sid_token` securely
(Keychain / Keystore). If `sid_token` is not null, send every later event to
`POST /mobile/analytics/v1` with the same public key. The demo has buttons for a screen view,
a button tap and a purchase.

```bash
curl -X POST "$BLIZ_API/mobile/analytics/v1" \
  -H "Authorization: Bearer pk_live_YOUR_PUBLIC_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "blizid": "<sid_token>",
    "stage": "CONVERT",
    "source": "purchase",
    "source_identifier": "checkout",
    "source_location": "app://checkout",
    "timestamp": "2026-11-13T14:30:00.000Z",
    "event": "PURCHASE_COMPLETED",
    "revenue": 49.99,
    "currency": "USD",
    "metadata": { "order_id": "ORD-1001" }
  }'
```

| Field | Required | Notes |
| :--- | :---: | :--- |
| `blizid` | yes | The `sid_token` from `mobile/init` |
| `stage` | yes | `VIEW` (screen), `ENGAGE` (tap), `SUBMITS` (form), `CONVERSION` (sign-up / lead), `CONVERT` (purchase) |
| `source` | yes | `screen`, `link`, `button`, `form`, `purchase` or `conversion` |
| `source_identifier` | yes | Screen name, button id or form id |
| `source_location` | yes | Screen or deep link, e.g. `app://checkout` |
| `timestamp` | yes | ISO 8601. Up to 7 days old (offline queue) and at most 5 minutes in the future |
| `event` | no | For example `PURCHASE_COMPLETED`, `ORDER_CREATED` |
| `revenue`, `currency` | no | Currency (3 letters) is required when revenue is sent |
| `customer`, `metadata` | no | User id and extra business context |

A successful call returns `{ "success": true, "status": "submitted" }`. Duplicate or rate-limited
events return `"status": "ignored"`. Unknown fields are rejected, and the event source is always
recorded as `MOBILE` by the server. Events from a weak (`prob_low`) match are recorded in Bliz but
are not sent to ad platforms.

## Troubleshooting

| Symptom | Likely cause |
| :--- | :--- |
| `sid_token: null` | The link was not opened on this device within 24 hours, the key belongs to a different account than the link, or the click was already claimed by another device. |
| HTTP 403 | Missing or invalid public key. Use a `pk_live_...` key, not `sk_live_...`. On events, it can also mean the token belongs to another account. |
| HTTP 401 on events | The `blizid` token is invalid or expired. |
| HTTP 400 on events | A field failed validation (unknown field, bad `stage` / `source`) or the timestamp is outside the accepted window. |
| Request failed | Wrong API URL for your device type (see API host tips). A real phone cannot reach `localhost`. |
| Key field is empty | `.env` not loaded. Restart Expo with `--clear` and reopen the app. |

## Project layout

```
App.tsx        Demo screen and the mobile/init call
.env.example   Environment template (copy to .env, never commit .env)
app.json       Expo configuration
```
