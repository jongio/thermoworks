# Web Dashboard V2 — Full SDK Feature Parity

## Status
COMPLETE — Delivered in PR #78 (merged 2026-06-09)

## Scope
**P1** — User-facing features, new UI surfaces, API integration changes.

## Summary
Upgrade the ThermoWorks web dashboard from its current minimal state (device list + archive chart) to a full-featured monitoring and management application that exposes every capability available in the SDK. The dashboard currently only uses ~15% of the SDK surface.

## SDK-to-Dashboard Gap Analysis

### Currently Implemented in Web
| SDK Method | Web Feature |
|---|---|
| `getDevices()` | Device list with status, battery, WiFi, firmware |
| `getAllDeviceChannels()` | Channel readings with alarm color coding |
| `getArchives()` | Temperature history chart (Recharts) |
| `getUser()` | User info for auth state |
| Public share endpoints | SharedDeviceView, SharedArchiveView pages |

### NOT Implemented — Full Gap List
| SDK Method | Planned Dashboard Feature | Priority |
|---|---|---|
| `getEvents()` / `getDeviceEvents()` | Event log panel (alarms, alerts, status changes) | High |
| `setAlarm()` | Alarm configuration UI (set high/low thresholds) | High |
| `getHistory()` | Historical data viewer (BigQuery time-series) | High |
| `subscribe()` | Real-time temperature streaming (WebSocket/polling) | High |
| `startSession()` / `endSession()` / `clearSession()` | Session management (start/stop cooking sessions) | High |
| `getCalibration()` | Calibration data display per device | Medium |
| `getFirmwareInfo()` | Firmware update alerts + version comparison | Medium |
| `getTemperatureGuide()` | Cooking temperature reference guide | Medium |
| `getDeviceGroups()` / `createDeviceGroup()` / `deleteDeviceGroup()` | Device group management | Medium |
| `shareDevice()` / `shareArchive()` | Share management (generate/revoke share links) | Medium |
| `getNotificationSettings()` / `updateNotificationSettings()` | Notification preferences panel | Medium |
| `getAccount()` / `getBillingPlan()` | Account info + billing status display | Low |
| `getDataUsage()` / `getDataUsageByDevice()` | Data usage dashboard | Low |
| `getInvites()` / `removeUser()` | Multi-user/invite management | Low |
| `renameDevice()` | Inline device rename | Low |
| `resetMinMax()` | Reset min/max readings button | Low |
| `clearEvents()` | Clear events action | Low |
| `updateDeviceState()` | Device settings panel | Low |
| `getFanState()` / `setFanTarget()` / `setFanEnabled()` | Fan controller UI (Billows) | Low |
| `search()` | Global search across devices/events | Low |
| `factoryReset()` | Factory reset (with confirmation) | Low |
| Unit conversion (`toCelsius`/`toFahrenheit`) | F/C toggle in UI | High |

## Architecture

### Planned Structure
```
src/
  components/
    DeviceCard.tsx          (existing — enhance)
    ChannelReading.tsx      (existing)
    TemperatureChart.tsx    (existing — enhance)
    AlarmConfig.tsx         (new)
    EventLog.tsx            (new)
    SessionControls.tsx     (new)
    DeviceSettings.tsx      (new)
    CalibrationView.tsx     (new)
    FirmwareStatus.tsx      (new)
    TemperatureGuide.tsx    (new)
    DeviceGroups.tsx        (new)
    ShareManager.tsx        (new)
    NotificationPrefs.tsx   (new)
    AccountPanel.tsx        (new)
    DataUsage.tsx           (new)
    FanController.tsx       (new)
    SearchBar.tsx           (new)
    UnitToggle.tsx          (new)
  hooks/
    useDevices.ts           (existing)
    useArchiveData.ts       (existing)
    useEvents.ts            (new)
    useSession.ts           (new)
    useHistory.ts           (new)
    useSubscription.ts      (new)
  pages/
    Dashboard.tsx           (new — main authenticated view)
    DeviceDetail.tsx        (new — single device deep view)
    Settings.tsx            (new — account/notification prefs)
    SharedDeviceView.tsx    (existing)
    SharedArchiveView.tsx   (existing)
```

### Navigation
- Sidebar or tab navigation: Dashboard | Devices | Events | Guide | Settings
- Device detail page accessed by clicking a device card
- Settings page for account, notifications, unit preferences

## Issue Breakdown

Issues are organized by epic/theme. Each issue is independently deliverable.
**Milestone**: [Web Dashboard V2](https://github.com/jongio/thermoworks/milestone/1)

### Epic 1: Real-Time Monitoring (High Priority)
1. #50 **Web: Add real-time temperature streaming**
2. #51 **Web: Add F/C unit toggle**
3. #52 **Web: Add configurable refresh interval**

### Epic 2: Alarms & Events (High Priority)
4. #53 **Web: Add alarm configuration UI**
5. #54 **Web: Add event log panel**
6. #55 **Web: Add desktop notifications for alarms**

### Epic 3: Sessions & History (High Priority)
7. #56 **Web: Add session management controls**
8. #57 **Web: Add historical data viewer**
9. #58 **Web: Enhance temperature chart with zoom, pan, and export**

### Epic 4: Device Management (Medium Priority)
10. #59 **Web: Add device detail page**
11. #60 **Web: Add inline device rename**
12. #61 **Web: Add firmware update alerts**
13. #62 **Web: Add calibration data display**
14. #63 **Web: Add device groups**
15. #64 **Web: Add reset min/max button**

### Epic 5: Sharing & Collaboration (Medium Priority)
16. #65 **Web: Add share management UI**
17. #66 **Web: Add multi-user management**

### Epic 6: Settings & Account (Medium Priority)
18. #67 **Web: Add notification preferences panel**
19. #68 **Web: Add account info and billing display**
20. #69 **Web: Add temperature guide page**

### Epic 7: Advanced Features (Low Priority)
21. #70 **Web: Add fan controller UI (Billows)**
22. #71 **Web: Add global device search**
23. #72 **Web: Add data export (CSV/JSON)**
24. #73 **Web: Add device settings panel**

### Epic 8: UX & Polish (Medium Priority)
25. #74 **Web: Add sidebar navigation**
26. #75 **Web: Add responsive mobile layout (PWA-ready)**
27. #76 **Web: Add loading skeletons**
28. #77 **Web: Add error recovery UI**

## Acceptance Criteria (Phase 1 — Planning)
- [x] SDK surface fully mapped to dashboard features
- [x] Gap analysis complete with priority classification
- [x] Issues broken into independently deliverable units
- [x] Architecture planned (components, hooks, pages, navigation)
- [x] GitHub issues filed with labels and milestone (28 issues, milestone #1)
- [x] Project plan updated with implementation order

## Implementation Order (Recommended)
1. Navigation + unit toggle (foundation for everything else)
2. Real-time streaming (biggest UX improvement)
3. Event log (high value, moderate effort)
4. Alarm config (pairs with events)
5. Session management (pairs with charts)
6. Device detail page (container for medium-priority items)
7. Settings page (account, notifications)
8. Remaining features in priority order

## Gate Evidence
```
GATE EVIDENCE:
  phase: 1
  gate: scope & plan
  command: manual analysis of SDK client.ts + web/src/ directory
  exit_code: 0
  scope: Full SDK-to-web gap analysis covering 40+ SDK methods
  output: 28 issues identified across 8 epics, prioritized by user impact
```
