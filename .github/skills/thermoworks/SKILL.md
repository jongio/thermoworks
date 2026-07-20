---
name: thermoworks
description: >-
  Access live temperatures, alarm states, and session history from ThermoWorks
  Cloud devices (Smoke, Signals, Node, RFX). Use the SDK in your own apps or
  the CLI for terminal workflows.
  TRIGGERS: thermoworks, temperature, smoker, bbq, thermometer, probe, alarm,
  thermoworks cloud, smoke signals, device temperature, copilot statusline.
author: Jon Gallant
version: 0.3.0
license: MIT
---

# ThermoWorks

Read live temperatures, monitor alarms, and access cooking session history
from ThermoWorks Cloud devices. Two integration paths: the `thermoworks-sdk`
package for embedding in your own apps, or the `thermoworks` CLI for terminal
and Copilot statusline use.

## When to activate

- User wants to read device temperatures or alarm states
- User is building something that consumes ThermoWorks data
- User wants to set up the CLI or Copilot statusline
- User mentions thermoworks, smoker temps, probe readings, or cooking alerts

## Read live temperatures

```ts
import { ThermoworksCloud } from "thermoworks-sdk";

const client = new ThermoworksCloud({
  email: process.env.THERMOWORKS_EMAIL!,
  password: process.env.THERMOWORKS_PASSWORD!,
});

// List all devices
const devices = await client.getDevices();

// Read a specific channel (1-indexed)
const channel = await client.getDeviceChannel(device.serial, 1);
console.log(`${channel.label}: ${channel.value}°${channel.units}`);

// Average across all temp channels (excludes humidity)
const avg = await client.getAverageTemperature(device.serial);

client.close();
```

Install with `npm install thermoworks-sdk` (requires Node.js >= 18).

## Monitor alarms

Each channel can have high and low temperature alarms. Use the alarm helpers
to check state without inspecting raw fields:

```ts
import {
  getChannelAlarmState,
  getChannelsAlarmState,
  escalateAlarm,
} from "thermoworks-sdk";

// Single channel: returns "none" | "low" | "high"
const state = getChannelAlarmState(channel);

// Worst state across all channels of a device
const channels = await client.getAllDeviceChannels(serial);
const worst = getChannelsAlarmState(channels);

// Merge states (keeps the more severe)
const merged = escalateAlarm(stateA, stateB);
```

A channel's `alarmHigh` fires when temperature exceeds the threshold.
`alarmLow` fires when it drops below. Each alarm has `enabled`, `alarming`,
`muted`, `value` (threshold), and `units` fields.

## Filter devices

```ts
const onlineSmokers = await client.getDevices({
  type: "smoke",
  status: "online",
  activeWithinMinutes: 30,
});
```

Filter by `serial`, `type`, `label`, `status`, or `activeWithinMinutes`.

## Access session history

```ts
const archives = await client.getArchives(serial, { limit: 10 });
for (const archive of archives) {
  console.log(`${archive.label}: ${archive.start} - ${archive.end}`);
  for (const ch of archive.channels ?? []) {
    for (const reading of ch.recentReadings) {
      console.log(`  ${reading.timestamp}: ${reading.value}°${reading.units}`);
    }
  }
}
```

## Handle errors

```ts
import { AuthError, NotFoundError, NetworkError } from "thermoworks-sdk";

try {
  const device = await client.getDevice(serial);
} catch (err) {
  if (err instanceof AuthError) {
    // Bad credentials - err.reason has detail (e.g. "INVALID_PASSWORD")
  } else if (err instanceof NotFoundError) {
    // Device serial doesn't exist
  } else if (err instanceof NetworkError) {
    // HTTP failure - err.statusCode may be set
  }
}
```

## CLI quick reference

```bash
npm install -g thermoworks

thermoworks auth login          # Authenticate (stored in system keychain)
thermoworks auth logout         # Remove credentials
thermoworks auth status         # Check auth state
thermoworks devices             # List connected devices
thermoworks copilot setup       # Configure Copilot CLI statusline
thermoworks copilot status      # Print temperature for statusline
thermoworks copilot remove      # Remove statusline config
thermoworks demo high|low|normal  # Preview alarm display
```

The statusline config lives at `~/.thermoworks/config.json` and
maps device serials + channels to display labels.

## Key types

See [references/types.md](references/types.md) for the core type definitions: `Device`,
`DeviceChannel`, `Alarm`, `AlarmState`, `Archive`, and error classes.
