# thermoworks-sdk

> **Disclaimer:** This project is not affiliated with, endorsed by, or connected to [ThermoWorks](https://www.thermoworks.com/) in any way. It is an unofficial, community-built tool created by ThermoWorks customers for personal use. This SDK interacts with an undocumented API and may break if ThermoWorks changes their backend.

Node.js SDK for [ThermoWorks Cloud](https://cloud.thermoworks.com/) — programmatic access to temperature data from ThermoWorks connected devices (Smoke, Signals, RFX, etc).

![ThermoWorks statusline in GitHub Copilot CLI](https://raw.githubusercontent.com/jongio/thermoworks/main/docs/images/statusline.png)

![ThermoWorks statusline with per-channel display](https://raw.githubusercontent.com/jongio/thermoworks/main/docs/images/statusline-channels.png)

## Install

```bash
npm install thermoworks-sdk
```

## Exports

The package exports:

**Client:**
- `ThermoworksCloud` — main API client

**Error types:**
- `AuthError`, `NetworkError`, `NotFoundError`

**Alarm utilities:**
- `getChannelAlarmState(channel)` — returns `"high"`, `"low"`, or `"none"` for a channel
- `getChannelsAlarmState(channels)` — highest alarm state across multiple channels
- `escalateAlarm(current, incoming)` — returns the more severe of two alarm states

**Formatting:**
- `formatTimeAgo(date)` — human-readable relative time (e.g., `"5m ago"`, `"2h ago"`)

**Food safety:**
- `assessPasteurization(input)` — pasteurization progress from a probe temperature, using USDA time-at-temperature data (types: `Protein`, `PasteurizationInput`, `PasteurizationResult`)
- `requiredHoldMinutes(temperatureF, protein)` — minutes to hold at a temperature to pasteurize (`null` if too low to pasteurize, `0` if already instantly safe)
- `getPasteurizationTable(protein)` — the raw hold-time table (`PasteurizationTable`) for `"poultry"`, `"beef"`, or `"pork"`

**Carryover:**
- `assessCarryover(input)` — predict the pull temperature so carryover cooking lands on a target after resting (types: `CarryoverInput`, `CarryoverResult`, `CarryoverSize`)
- `carryoverRiseForSize(size)` — preset carryover rise in °F for a `"small"`, `"medium"`, or `"large"` cut

**Cook analytics & predictions:**
- `predictDoneTime(current, target, rateOfChange, options?)` — estimate time-to-target from the current temperature trend (types: `PredictionOptions`, `PredictionResult`)
- `detectStall(readings, options?)`, `detectRapidChange(readings, options?)` — stall and rapid-change detection over a reading series (types: `StallResult`, `RapidChangeResult`)
- `assessCooling(samples, options?)` — FDA two-stage cooling compliance, with constants `FDA_STAGE1_START_F`, `FDA_STAGE1_END_F`, `FDA_STAGE2_END_F`
- `assessWrap(input)` — should-I-wrap-now advisor, with defaults `DEFAULT_SLOW_RATE`, `DEFAULT_WRAP_AT_F`
- `buildCookTimeline(readings, options?)` — annotated cook milestones (types: `CookTimeline`, `TimelineEvent`, `TimelineKind`, `TimelineOptions`)
- `assessDeviceHealth(device, channels)`, `isChannelStale(channel)` — device health diagnostics (types: `DeviceHealth`, `DeviceHealthIssue`)
- `planCook(items, options)`, `getMeatProfiles()`, `resolveMeatProfile(name)` — backwards cook planning by serve time (types: `CookPlan`, `MeatProfile`)
- `calculateSeasoning(weightLb, options?)`, `listRubRecipes()`, `resolveRubRecipe(name)` — offline rub and brine scaling

**Replay & subscriptions:**
- `buildReplaySequence`, `archiveReadingToReplay`, `historyReadingToReplay`, `nextReplayIndex` — replay archived cooks as a time sequence
- `createSubscription(serial, fetchChannels, callback, options?)` — standalone live-update subscription (types: `ChannelUpdate`, `Subscription`)

**Token cache:**
- `invalidateTokenCache()`, `resolveTokenCachePath(path?)` — manage the on-disk auth token cache (type: `TokenCacheData`)

**Credential helpers:**
- `parseCredentialBlob(blob)` — parse a JSON credential blob into `{ email, password }`
- `serializeCredentials(email, password)` — serialize credentials to JSON
- `resolveEnvCredentials()` — resolve credentials from `THERMOWORKS_EMAIL`/`THERMOWORKS_PASSWORD` env vars
- Constants: `CREDENTIAL_SERVICE`, `CREDENTIAL_ACCOUNT`, `LEGACY_ACCOUNT_EMAIL`, `LEGACY_ACCOUNT_PASSWORD`

**Config types:**
- `StatuslineConfig`, `DeviceEntry`, `DEFAULT_STATUSLINE_CONFIG`
- `isValidStatuslineConfig(raw)`, `isValidDeviceEntry(entry)` — validation helpers
- `ChannelLabelMap`, `channelLabelKey(serial, channel)` — persistent channel label storage
- `resolveChannelLabel(serial, channel, labels, index)` — three-tier label resolution (custom > cloud > "Ch N")
- `sanitizeLabel(value)` — strips ANSI/control characters and truncates to 50 chars
- `isValidChannelLabelMap(raw)` — validation for channel label maps
- `MAX_CHANNEL_LABEL_LENGTH` — max label length constant (50)

**Type interfaces:**
- `Account`, `Alarm`, `Archive`, `CalibrationRecord`, `Credentials`, `Device`, `DeviceChannel`, `DeviceEvent`, `DeviceFilter`, `EventFilter`, `FirmwareInfo`, `MinMaxReading`, `TemperatureGuide`, `ThermoworksConfig`, `User`, and more

**Testing fixtures:**
- `thermoworks-sdk/testing` — typed offline builders, canonical Signals/Smoke/Node/offline devices, alarm and firmware scenarios, archives, and `FakeThermoworksCloud`

## Usage

```typescript
import { ThermoworksCloud } from "thermoworks-sdk";

const client = new ThermoworksCloud({
  email: process.env.THERMOWORKS_EMAIL!,
  password: process.env.THERMOWORKS_PASSWORD!,
});

const devices = await client.getDevices();

for (const device of devices) {
  const avg = await client.getAverageTemperature(device.serial);
  console.log(`${device.label ?? device.serial}: ${avg?.value}°${avg?.units}`);

  const channel = await client.getDeviceChannel(device.serial, 1);
  console.log(`  Ch1: ${channel.value}°${channel.units}`);
}

client.close();
```

## Offline test fixtures

Use `thermoworks-sdk/testing` for tests, demos, and smoke fixtures that need realistic data without ThermoWorks Cloud access:

```typescript
import {
	FIXTURE_DEVICES,
	FakeThermoworksCloud,
	getFixtureChannels,
	makeChannel,
	makeDevice,
} from "thermoworks-sdk/testing";

const client = new FakeThermoworksCloud();
const devices = await client.getDevices();
const highAlarmChannels = getFixtureChannels("DEMO-SIGNALS-4CH", "high");
const customDevice = makeDevice({ serial: "TEST-SMOKE", label: "Test Smoke", type: "smoke" });
const customChannel = makeChannel({ number: "1", label: "Pit", value: 225 });
```

The canonical fixtures cover a four-channel Signals, two-channel Smoke, Node, an offline Node, high/low alarm states, up-to-date and update-available firmware, and session archives. Prefer these fixtures over hand-written mock shapes in package tests so demos and offline behavior stay consistent.

## API

### `new ThermoworksCloud(config)`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `email` | `string` | Yes | ThermoWorks Cloud email |
| `password` | `string` | Yes | ThermoWorks Cloud password |
| `apiKey` | `string` | No | Override the default Firebase API key |
| `appId` | `string` | No | Override the default Firebase app ID |
| `retry` | `RetryConfig` | No | Automatic retry with exponential backoff for transient failures (429, 503, network errors) |
| `tokenCachePath` | `string \| boolean` | No | Persist auth tokens across sessions. `true` caches to `~/.thermoworks/.token-cache.json`, a string sets a custom path; omit or `false` to disable |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getUser()` | `Promise<User>` | Get the authenticated user record |
| `getAccount()` | `Promise<Account>` | Get the full account (user + preferences) |
| `getDevices(filter?)` | `Promise<Device[]>` | List devices, with optional filtering |
| `getDevice(serial)` | `Promise<Device>` | Get a single device by serial number |
| `getDeviceChannel(serial, channel)` | `Promise<DeviceChannel>` | Get one channel reading; `channel` is 1-indexed |
| `getAllDeviceChannels(serial)` | `Promise<DeviceChannel[]>` | Get all device channels until the first missing channel |
| `getAverageTemperature(serial)` | `Promise<{ value: number; units: string } \| null>` | Average temperature across readable temperature channels |
| `setAlarm(serial, channel, config)` | `Promise<void>` | Set high/low alarm thresholds on a device channel |
| `getEvents(filter?)` | `Promise<DeviceEvent[]>` | Get device events with optional filtering |
| `getDeviceEvents(serial, limit?)` | `Promise<DeviceEvent[]>` | Convenience - events for a single device |
| `clearEvents(serial)` | `Promise<ActionResult>` | Clear all events for a device |
| `getArchives(serial, options?)` | `Promise<Archive[]>` | List session archives for a device |
| `getArchive(serial, archiveId)` | `Promise<Archive>` | Get a single archive session |
| `getCalibration(serial)` | `Promise<CalibrationRecord[]>` | Get calibration records for a device |
| `getFirmwareInfo(deviceType)` | `Promise<FirmwareInfo>` | Get latest firmware info for a device type |
| `getTemperatureGuide()` | `Promise<TemperatureGuide>` | Get the cooking temperature guide |
| `getHistory(serial)` | `Promise<DeviceHistory>` | Retrieve full historical temperature time-series data |
| `search(query, options)` | `Promise<SearchResult>` | Search across devices and data |
| `startSession(serial, label?)` | `Promise<ActionResult>` | Start a monitoring session on a device |
| `endSession(serial)` | `Promise<ActionResult>` | End an active monitoring session |
| `clearSession(serial)` | `Promise<ActionResult>` | Clear session data for a device |
| `resetMinMax(serial, channel)` | `Promise<ActionResult>` | Reset min/max readings for a device channel |
| `getDataUsage()` | `Promise<DataUsage>` | Get total data storage usage for the account |
| `getDataUsageByDevice()` | `Promise<DeviceDataUsage[]>` | Get per-device data storage usage |
| `getBillingPlan()` | `Promise<BillingPlan \| null>` | Get the billing plan for the account |
| `getInvites()` | `Promise<AccountInvite[]>` | Get pending invitations for the account |
| `removeUser(userId)` | `Promise<ActionResult>` | Remove a user from the account |
| `getNotificationSettings()` | `Promise<NotificationSettings>` | Get the user's notification preferences |
| `updateNotificationSettings(settings)` | `Promise<void>` | Update notification preferences (read-merge-write) |
| `updateDeviceState(serial, state)` | `Promise<ActionResult>` | Update device state/settings via Cloud Function |
| `renameDevice(serial, name)` | `Promise<ActionResult>` | Rename a device |
| `factoryReset(serial)` | `Promise<ActionResult>` | Factory reset a device |
| `shareDevice(serial)` | `Promise<ShareResult>` | Share a device's live state via a public link |
| `shareArchive(serial, archiveId)` | `Promise<ShareResult>` | Share an archive via a public link |
| `getDeviceGroups()` | `Promise<DeviceGroup[]>` | Get device groups for the authenticated user |
| `createDeviceGroup(name, devices)` | `Promise<DeviceGroup>` | Create a device group from a list of serials |
| `addDeviceToGroup(groupId, serial)` | `Promise<void>` | Add a device to an existing group |
| `removeDeviceFromGroup(groupId, serial)` | `Promise<void>` | Remove a device from a group |
| `deleteDeviceGroup(groupId)` | `Promise<void>` | Delete a device group |
| `getFanState(serial)` | `Promise<FanSettings \| null>` | Get fan/blower controller state (null if no fan) |
| `setFanTarget(serial, targetTemp)` | `Promise<ActionResult>` | Set the fan controller target temperature |
| `setFanEnabled(serial, enabled)` | `Promise<ActionResult>` | Enable or disable the fan controller |
| `subscribe(serial, callback, options?)` | `Subscription` | Poll a device and invoke `callback` on each channel change; returns a handle with `unsubscribe()` |
| `close()` | `void` | Release the underlying authenticated session |

### Filtering Devices

```typescript
const smokers = await client.getDevices({ type: "smoke" });
const specific = await client.getDevices({ serial: ["ABC123", "DEF456"] });
const active = await client.getDevices({ activeWithinMinutes: 15 });
const online = await client.getDevices({ status: "online" });
```

### Error Handling

```typescript
import { AuthError, NotFoundError, NetworkError } from "thermoworks-sdk";

try {
  await client.getDevice("INVALID");
} catch (err) {
  if (err instanceof AuthError) {
    // Invalid credentials or expired token
  } else if (err instanceof NotFoundError) {
    // Device or channel does not exist
  } else if (err instanceof NetworkError) {
    // HTTP or network failure (check err.statusCode)
  }
}
```

## Examples

See [SDK Usage Examples & Cookbook](../../docs/sdk-examples.md) for complete, runnable TypeScript examples covering:

- Basic device monitoring
- Temperature alerting
- Data logging to CSV
- Session management
- Multi-device dashboards
- Archive export
- Firmware version checking
- Real-time subscriptions
- Error handling patterns

## Requirements

- Node.js `>= 18`

## License

MIT
