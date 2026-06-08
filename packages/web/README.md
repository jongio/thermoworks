# ThermoWorks Web Dashboard

Real-time temperature dashboard for ThermoWorks Cloud devices.

**Live:** [jongio.github.io/thermoworks](https://jongio.github.io/thermoworks/)

## Tech Stack

- **React 19** + TypeScript
- **Vite** (bundler + dev server)
- **Tailwind CSS v4** (styling)
- **Recharts** (temperature history charts, lazy-loaded)
- **React Router** (client-side routing)

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
├── main.tsx              # React root + router setup
├── App.tsx               # Authenticated dashboard (login gate)
├── index.css             # Tailwind base + CSS custom properties
├── components/
│   ├── LoginForm.tsx     # Email/password auth form
│   ├── DeviceList.tsx    # Device card grid
│   ├── DeviceCard.tsx    # Individual device with channels + expandable chart
│   ├── ChannelReading.tsx # Temperature display with alarm color coding
│   ├── TemperatureChart.tsx # Recharts line chart (lazy-loaded)
│   ├── ThemeToggle.tsx   # Light/dark mode toggle
│   └── ShareLayout.tsx   # Shared layout for public pages
├── hooks/
│   ├── useDevices.ts     # 10s polling hook for device data
│   └── useArchiveData.ts # Lazy archive fetch for charts
├── lib/
│   ├── api.ts            # Browser-native Firebase REST client
│   └── utils.ts          # cn() utility (clsx + tailwind-merge)
└── pages/
    ├── SharedDeviceView.tsx   # Public device viewer (no auth)
    └── SharedArchiveView.tsx  # Public archive viewer (no auth)
```

## Routes

| Route | Auth Required | Description |
|-------|:---:|-------------|
| `/` | Yes | Main dashboard — device list with real-time temperatures |
| `/share/device/:serial` | No | Public view of a shared device |
| `/share/archive/:serial/:archiveId` | No | Public view of a shared archive session |

## Features

- **Real-time temperatures** — 10-second polling with auto-refresh
- **Alarm color coding** — Red for high alarms, blue for low alarms
- **Temperature history charts** — Expandable per-device, with alarm threshold lines
- **Light/dark theme** — Toggle with system preference detection
- **Public sharing** — View shared devices/archives without login
- **Responsive** — Mobile-first grid layout

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
