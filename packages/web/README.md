# ThermoWorks Web Dashboard

Real-time temperature dashboard for ThermoWorks Cloud devices.

**Live:** [jongio.github.io/thermoworks](https://jongio.github.io/thermoworks/)

## Tech Stack

- **React 19** + TypeScript
- **Vite** (bundler + dev server)
- **Tailwind CSS v4** (styling)
- **Recharts** (temperature history charts, lazy-loaded)
- **React Router** (`HashRouter`, client-side routing with lazy-loaded pages)
- **@dnd-kit** (drag-and-drop device reordering)
- **@tanstack/react-virtual** (virtualized device grid for large accounts)
- **lucide-react** (icons)
- **PWA** (service worker for offline support)

## Development

```bash
# From monorepo root
pnpm install

# Start dev server
pnpm --filter thermoworks-web dev

# Build for production
pnpm --filter thermoworks-web build

# Run tests
pnpm --filter thermoworks-web test

# Type check
pnpm --filter thermoworks-web typecheck
```

## Architecture

```
src/
├── main.tsx              # React root, HashRouter, lazy-loaded route definitions, SW registration
├── App.tsx               # Authenticated app shell (nav/sidebar + <Outlet/>, login gate)
├── index.css             # Tailwind base + CSS custom properties
├── pages/                # Route pages: Dashboard, Devices, DeviceDetail, Events, Guide,
│                         #   Settings, DataUsage, ExportSchedules, SharedDeviceView, SharedArchiveView
├── components/           # UI: device cards, charts, alarm config, fan control, share UI,
│                         #   search, device groups, onboarding, export, notifications, …
├── hooks/                # Data + behavior hooks: useDevices, useEvents, useSearch,
│                         #   useDeviceGroups, useSubscription, useOnlineStatus, useHistory, …
├── context/              # React contexts: TemperatureUnitContext, OfflineCacheContext
└── lib/                  # api.ts (Firebase REST client), export, downsample, offline-store, utils
```

See the [Browser API Client](#browser-api-client) section below for how `src/lib/api.ts` talks to ThermoWorks Cloud.

## Routes

| Route | Auth Required | Description |
|-------|:---:|-------------|
| `/` | Yes | Dashboard — overview with real-time temperatures |
| `/devices` | Yes | Full device list with channels and controls |
| `/device/:serial` | Yes | Device detail — channels, chart, archives, fan, calibration |
| `/events` | Yes | Device events (alarms, status changes) |
| `/usage` | Yes | Account data storage usage |
| `/guide` | Yes | Cooking temperature guide |
| `/settings` | Yes | App settings and preferences |
| `/exports` | Yes | Scheduled data exports |
| `/share/device/:serial` | No | Public view of a shared device |
| `/share/archive/:serial/:archiveId` | No | Public view of a shared archive session |

> Routing uses `HashRouter`, so paths appear after `#` (e.g. `/#/devices`).

## Features

- **Real-time temperatures** — polling with configurable auto-refresh (default 10s)
- **Alarm color coding** — red for high alarms, blue for low alarms, with optional notifications
- **Temperature history charts** — per-device, with alarm threshold lines and chart export
- **Device management** — rename, fan control, reset min/max, alarm config, sessions
- **Device groups** — organize devices with drag-and-drop reordering
- **Search** — quickly filter devices
- **Events** — alarm, status, and connectivity history with per-device filtering
- **Calibration & firmware** — view calibration records and firmware update status
- **Data usage & scheduled exports** — track storage and automate CSV/JSON exports
- **Keyboard shortcuts** — with an in-app help overlay
- **Onboarding wizard** — guided first-run setup
- **Light/dark theme** — toggle with system preference detection
- **Offline support (PWA)** — service worker plus cached data when offline
- **Public sharing** — view shared devices/archives without login
- **Responsive** — mobile-first layout with bottom navigation, virtualized for large accounts

## Browser API Client

The web package uses a browser-native Firebase REST client (`src/lib/api.ts`) instead of the Node.js SDK directly. This is because the SDK depends on `undici` (Node-only HTTP client). The web client:

- Uses the browser's native `fetch` API
- Implements the same Firebase Auth flow (signInWithPassword + token refresh)
- Parses Firestore REST responses into the same typed domain objects
- Shares type definitions from `thermoworks-sdk` via `import type`

## Deployment

The web app deploys to GitHub Pages via the `pages.yml` workflow. Build output is in `dist/`.

## Environment

No environment variables required — Firebase config is embedded (public web API key per Firebase design). Credentials are entered at runtime via the login form and kept in memory only.
