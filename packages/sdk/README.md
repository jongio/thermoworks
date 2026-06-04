# thermoworks-sdk

> **Disclaimer:** This project is not affiliated with, endorsed by, or connected to [ThermoWorks](https://www.thermoworks.com/) in any way. It is an unofficial, community-built tool created by ThermoWorks customers for personal use. This SDK interacts with an undocumented API and may break if ThermoWorks changes their backend.

Node.js SDK for [ThermoWorks Cloud](https://cloud.thermoworks.com/) — programmatic access to temperature data from ThermoWorks connected devices (Smoke, Signals, RFX, etc).

![ThermoWorks statusline in GitHub Copilot CLI](../../docs/images/statusline.png)

![ThermoWorks statusline with per-channel display](../../docs/images/statusline-channels.png)

## Install

```bash
npm install thermoworks-sdk
```

## Exports

The package exports:

- `ThermoworksCloud`
- `AuthError`
- `NetworkError`
- `NotFoundError`
- Type interfaces: `Alarm`, `Device`, `DeviceChannel`, `DeviceFilter`, `MinMaxReading`, `ThermoworksConfig`, and `User`

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
| `getDevices(filter?)` | `Promise<Device[]>` | List devices, with optional filtering |
| `getDevice(serial)` | `Promise<Device>` | Get a single device by serial number |
| `getDeviceChannel(serial, channel)` | `Promise<DeviceChannel>` | Get one channel reading; `channel` is 1-indexed |
| `getAllDeviceChannels(serial)` | `Promise<DeviceChannel[]>` | Get all device channels until the first missing channel |
| `getAverageTemperature(serial)` | `Promise<{ value: number; units: string } \| null>` | Average temperature across readable temperature channels |
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

## Requirements

- Node.js `>= 18`

## License

MIT
