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

**Credential helpers:**
- `parseCredentialBlob(blob)` — parse a JSON credential blob into `{ email, password }`
- `serializeCredentials(email, password)` — serialize credentials to JSON
- `resolveEnvCredentials()` — resolve credentials from `THERMOWORKS_EMAIL`/`THERMOWORKS_PASSWORD` env vars
- Constants: `CREDENTIAL_SERVICE`, `CREDENTIAL_ACCOUNT`, `LEGACY_ACCOUNT_EMAIL`, `LEGACY_ACCOUNT_PASSWORD`

**Config types:**
- `StatuslineConfig`, `DeviceEntry`, `DEFAULT_STATUSLINE_CONFIG`
- `isValidStatuslineConfig(raw)`, `isValidDeviceEntry(entry)` — validation helpers

**Type interfaces:**
- `Account`, `Alarm`, `Archive`, `CalibrationRecord`, `Credentials`, `Device`, `DeviceChannel`, `DeviceEvent`, `DeviceFilter`, `EventFilter`, `FirmwareInfo`, `MinMaxReading`, `TemperatureGuide`, `ThermoworksConfig`, `User`, and more

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

## API

### `new ThermoworksCloud(config)`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `email` | `string` | Yes | ThermoWorks Cloud email |
| `password` | `string` | Yes | ThermoWorks Cloud password |
| `apiKey` | `string` | No | Override the default Firebase API key |
| `appId` | `string` | No | Override the default Firebase app ID |

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
| `getTemperatureGuide()` | `Promise<TemperatureGuide>` | Get the USDA temperature guide |
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
| `getFanState(serial)` | `Promise<FanSettings \| null>` | Get fan/blower controller state (null if no fan) |
| `setFanTarget(serial, targetTemp)` | `Promise<ActionResult>` | Set the fan controller target temperature |
| `setFanEnabled(serial, enabled)` | `Promise<ActionResult>` | Enable or disable the fan controller |
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
