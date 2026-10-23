# Live Alerts - Standalone React Native Mobile Application

A standalone, production-ready React Native mobile application designed to authenticate against your live MERN + QuestDB backend, listen in real time to alert streams via Socket.io, and play audible notification chimes automatically upon every new alert arrival.

---

## 🚀 Key Features

1. **Authentication & Session Resilience**
   - Direct integration with existing `POST /api/v1/auth/login` endpoint.
   - Encrypted token storage using **Expo SecureStore** with seamless AsyncStorage fallback.
   - Axios request interceptor attaching `Authorization: Bearer <token>` to all requests.
   - Automatic background token renewal on `401 Unauthorized` using `POST /api/v1/auth/refresh-token`.

2. **Real-Time Stream Listener (Socket.io)**
   - Connects to the backend socket endpoint (`/api/alert/socket.io`).
   - Automatically passes JWT token during handshake (`auth: { token }`).
   - Listens to backend live events:
     - `alert:new` - Prepends newly ingested alerts in real-time.
     - `alert:updated` - Updates alert details (e.g. Warning $\rightarrow$ Critical promotions).
     - `alert:bulk_ack` & `alert:clear` - Updates status dynamically.
   - **Auto-Reconnection**: Reconnects with exponential backoff & jitter if connection drops.
   - **Live Indicator**: Visual UI badge displaying connection state (🟢 Live Stream, 🟡 Reconnecting, 🔴 Offline).

3. **Audible Alert Audio System (`expo-av` + `expo-haptics`)**
   - Synthesized PCM wave audio chimes that work offline with zero external network lag.
   - **Distinct sounds by severity level**:
     - 🚨 **Critical**: High-pitched multi-burst alarm tone + heavy haptic vibration.
     - ⚠️ **Warning**: Dual alert chime + warning haptic feedback.
     - ℹ️ **Info**: Soft chime tone + light tactile feedback.
   - Configured for background & silent mode playback (`playsInSilentModeIOS: true`).
   - Quick mute/unmute audio toggle in the top navigation bar with persisted settings.

4. **Mobile Dashboard & Telemetry UI**
   - **Metrics Counter**: Instant summary cards for Pending Critical, Pending Warning, and Acknowledged alerts.
   - **Real-Time Live Feed**: Live alert cards with severity color bars, pulsing glowing red borders for unacknowledged critical alerts, panel location, device ID, tag name, and values.
   - **In-App Toast Banner**: Slid-down notification whenever a live alert arrives in real time.
   - **Pull-to-Refresh & Infinite Scroll**: Seamless pagination against `GET /api/v1/alerts`.
   - **Detailed Inspection Modal**: View full timestamp history, origin metadata, and submit one-tap acknowledgements with optional notes.
   - **Dynamic Server Configuration**: Switch easily between Localhost (`10.0.2.2:9013` for Android, `localhost:9013` for iOS), local LAN IP, or Production Cloud URLs from the Login screen.

---

## 📁 Architecture Overview

```
alert-mobile-app/
├── App.tsx                      # App entry point with Context Providers
├── src/
│   ├── api/
│   │   ├── client.ts            # Axios instance + interceptors (JWT + auto-refresh)
│   │   ├── authApi.ts           # Login & Token refresh API
│   │   └── alertApi.ts          # Alert listing, filters & acknowledge API
│   ├── config/
│   │   └── constants.ts         # Server defaults, socket paths, severity palettes
│   ├── context/
│   │   ├── AuthContext.tsx      # User authentication state & session management
│   │   ├── AlertContext.tsx     # Central real-time alert feed & socket listeners
│   │   └── AudioContext.tsx     # Audio sound settings & haptic engine
│   ├── hooks/
│   │   ├── useLiveAlerts.ts     # Real-time socket stream hook
│   │   ├── useAlertAudio.ts     # Audio trigger hook
│   │   └── useDebounce.ts       # Debouncer for search inputs
│   ├── navigation/
│   │   └── RootNavigator.tsx    # Conditional auth & modal navigation stack
│   ├── screens/
│   │   ├── LoginScreen.tsx      # Auth screen with server config dialog
│   │   ├── DashboardScreen.tsx  # Live alert feed, counters, filters & pull-to-refresh
│   │   └── AlertDetailModal.tsx # Telemetry details & acknowledgement modal
│   ├── components/
│   │   ├── AlertCard.tsx        # Alert card with pulsing critical glow
│   │   ├── StatBadge.tsx        # Counter metrics component
│   │   ├── ConnectionStatus.tsx # Pulsing live stream status indicator
│   │   ├── FilterPills.tsx      # Severity & status filter chips
│   │   ├── Toast.tsx            # Real-time slide-down alert notification
│   │   └── AudioToggle.tsx      # Audio mute/unmute header button
│   ├── services/
│   │   ├── soundService.ts      # Expo-AV audio & haptic playback engine
│   │   ├── socketService.ts     # Resilient Socket.io client wrapper
│   │   └── storage.ts           # SecureStore / AsyncStorage abstraction
│   └── types/
│       ├── alert.ts             # Alert schema & response interfaces
│       ├── auth.ts              # User & JWT auth interfaces
│       └── navigation.ts        # Navigation route types
```

---

## 🛠️ Quick Start & Running

### 1. Install Dependencies
Navigate to the mobile app directory and install npm packages:
```bash
cd alert-mobile-app
npm install
```

### 2. Start Expo Development Server
```bash
npm start
```
- Press `a` to open on Android Emulator or connected device.
- Press `i` to open on iOS Simulator.
- Press `w` to run on Web browser.
- Scan the QR code with the **Expo Go** app on your physical mobile device.

### 3. Backend Connection Setup
- When running on an **Android Emulator**, use `http://10.0.2.2:9013`.
- When running on an **iOS Simulator** or **Web**, use `http://localhost:9013`.
- When testing on a **physical device over Wi-Fi**, set the server URL to your machine's LAN IP (e.g. `http://192.168.1.50:9013`).

---

## 🔔 Testing Live Alerts & Audio Notification
To test live alerts streaming into the mobile app in real-time, trigger an alert ingestion via your backend:

```bash
curl -X POST http://localhost:9013/api/v1/alerts/alert_ingest \
  -H "Content-Type: application/json" \
  -H "x-api-key: alert_secret_key" \
  -d '{
    "company_id": "<YOUR_COMPANY_ID>",
    "panel_name": "Main Substation Panel A",
    "tag_name": "TRANSFORMER_TEMP",
    "alert_value": 98.4,
    "unit": "°C",
    "message": "Transformer core temperature exceeded maximum safety threshold",
    "severity": "critical"
  }'
```

**Expected Result:**
1. The phone will immediately play the high-priority critical alarm audio tone and trigger haptic feedback.
2. An animated slide-down banner toast (`AlertToast`) will appear at the top.
3. The new alert card will appear at index 0 of the feed with a pulsing red glow indicator.
4. The `Pending Critical` counter badge will automatically increment.
