# Web Dashboard V3 — Production Polish & Real-World Hardening

## Status
PLANNING

## Scope
**P1** — Quality, performance, real-world usability improvements. No new SDK integration needed.

## Summary
V2 delivered full SDK feature parity (28 features). V3 focuses on making the dashboard production-ready: performance under real workloads, offline resilience, progressive web app install, testing coverage, and UX polish based on actual usage feedback.

## Motivation
V2 was a feature sprint — everything works but many areas need hardening:
- No E2E tests (only unit/integration)
- Bundle is 400KB+ JS (could be split better)
- No offline support or service worker
- No PWA install prompt
- Charts lag with large datasets (1000+ points)
- No keyboard shortcuts
- Mobile layout exists but lacks touch gestures
- No onboarding flow for new users

## Proposed Epics

### Epic 1: Performance & Bundle (High)
1. **Route-based code splitting** — Lazy-load pages (Dashboard, DeviceDetail, Events, Guide, Settings) so initial load is <100KB
2. **Chart virtualization** — Virtualize large datasets in TemperatureChart (downsample to viewport resolution)
3. **Device list virtualization** — Use windowed rendering for users with 20+ devices
4. **Image/asset optimization** — Serve SVG icons as sprite, optimize favicon for all sizes

### Epic 2: PWA & Offline (High)
5. **Service worker + manifest** — App installable, basic offline shell
6. **Offline data caching** — Cache last-known device state in IndexedDB, show stale data with "Last updated" indicator
7. **Background sync** — Queue alarm config changes when offline, replay on reconnect
8. **Push notifications** — Use Web Push API for alarm alerts when app is closed (replaces current Notification API which requires app tab open)

### Epic 3: Testing & Quality (High)
9. **E2E test suite** — Playwright tests for login → dashboard → device detail → alarm config → export flows
10. **Visual regression tests** — Screenshot comparison for key pages (light + dark theme)
11. **Accessibility audit** — WCAG 2.1 AA compliance for all pages (keyboard nav, screen reader, color contrast)
12. **Error boundary coverage** — Ensure every page has error boundary with retry action

### Epic 4: UX Polish (Medium)
13. **Keyboard shortcuts** — `r` to refresh, `/` to focus search, `1-5` for sidebar nav, `Escape` to close modals
14. **Toast notifications** — Replace alert() calls with toast system for success/error feedback
15. **Onboarding** — First-login empty state with setup wizard (connect device → set alarms → choose units)
16. **Drag-and-drop reorder** — Allow users to reorder device cards and sidebar items
17. **Dark mode auto-detect** — Follow system preference by default, manual override persists

### Epic 5: Data & Analytics (Low)
18. **Data usage dashboard** — Show BigQuery usage per device (uses getDataUsage SDK method)
19. **Export scheduler** — Periodic CSV export to email or cloud storage
20. **Multi-account switch** — Support users with multiple ThermoWorks accounts
21. **Activity feed** — Unified timeline across all devices (events + session starts/ends)

## Implementation Order
1. Route-based code splitting (immediate win, no behavior change)
2. Service worker + manifest (PWA install)
3. E2E tests (safety net for everything else)
4. Chart virtualization (solves real perf issue)
5. Keyboard shortcuts + toasts (quick UX wins)
6. Offline caching + push notifications
7. Remaining items by priority

## Success Criteria
- Lighthouse Performance score ≥90 (currently ~70 due to bundle size)
- Lighthouse PWA score: installable
- E2E tests cover 5 critical user journeys
- WCAG 2.1 AA — zero violations on axe scan
- Largest Contentful Paint <2s on 3G throttle
- Works offline for read-only operations (viewing cached data)
