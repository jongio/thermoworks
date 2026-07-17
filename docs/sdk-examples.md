# SDK Usage Examples & Cookbook

Real-world TypeScript examples demonstrating the `thermoworks-sdk` package. Each example is standalone and runnable with Node.js >= 18.

> **Prerequisites:** Install the SDK with `npm install thermoworks-sdk` and set your credentials as environment variables:
>
> ```bash
> export THERMOWORKS_EMAIL="your-email@example.com"
> export THERMOWORKS_PASSWORD="your-password"
> ```

---

## 1. Basic Device Monitoring

Authenticate, list all devices, and print current temperatures.

```typescript
import { ThermoworksCloud, formatTimeAgo } from "thermoworks-sdk";

async function main() {
  const client = new ThermoworksCloud({
    email: process.env.THERMOWORKS_EMAIL!,
    password: process.env.THERMOWORKS_PASSWORD!,
    tokenCachePath: true, // cache tokens to ~/.thermoworks/.token-cache.json
  });

  try {
    const devices = await client.getDevices();

    if (devices.length === 0) {
      console.log("No devices found on this account.");
      return;
    }

    for (const device of devices) {
      const name = device.label ?? device.serial;
      const status = device.status ?? "unknown";
      const lastSeen = formatTimeAgo(device.lastSeen);

      console.log(`${name} (${device.type}) - ${status} - last seen ${lastSeen}`);

      const avg = await client.getAverageTemperature(device.serial);
      if (avg) {
        console.log(`  Average: ${avg.value}°${avg.units}`);
      }
    }
  } finally {
    client.close();
  }
}

main();
```

---

## 2. Temperature Alerting

Monitor channels for alarm conditions and log alerts when thresholds are crossed.

```typescript
import {
  ThermoworksCloud,
  getChannelAlarmState,
  getChannelsAlarmState,
  type DeviceChannel,
  type AlarmState,
} from "thermoworks-sdk";

async function checkAlarms() {
  const client = new ThermoworksCloud({
    email: process.env.THERMOWORKS_EMAIL!,
    password: process.env.THERMOWORKS_PASSWORD!,
  });

  try {
    const devices = await client.getDevices({ status: "online" });

    for (const device of devices) {
      const channels = await client.getAllDeviceChannels(device.serial);
      const overallState: AlarmState = getChannelsAlarmState(channels);

      if (overallState !== "none") {
        console.warn(`⚠️  ALARM on ${device.label ?? device.serial}: ${overallState}`);

        for (const ch of channels) {
          const state = getChannelAlarmState(ch);
          if (state !== "none") {
            console.warn(
              `   Channel ${ch.number} (${ch.label}): ${ch.value}°${ch.units} - ${state} alarm`,
            );
          }
        }

        // Send alert (replace with your notification service)
        await sendAlert(device.label ?? device.serial, overallState, channels);
      }
    }
  } finally {
    client.close();
  }
}

async function sendAlert(deviceName: string, state: AlarmState, channels: DeviceChannel[]) {
  const alarming = channels.filter((ch) => getChannelAlarmState(ch) !== "none");
  const summary = alarming
    .map((ch) => `${ch.label ?? `Ch${ch.number}`}: ${ch.value}°${ch.units}`)
    .join(", ");

  // Replace with actual notification (email, SMS, webhook, etc.)
  console.log(`[ALERT] ${deviceName} - ${state} alarm - ${summary}`);
}

checkAlarms();
```

---

## 3. Data Logging to CSV

Fetch channel readings from all devices and append them to a CSV file for historical tracking.

```typescript
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { ThermoworksCloud } from "thermoworks-sdk";

const CSV_PATH = "./temperature-log.csv";

async function logReadings() {
  const client = new ThermoworksCloud({
    email: process.env.THERMOWORKS_EMAIL!,
    password: process.env.THERMOWORKS_PASSWORD!,
    tokenCachePath: true,
  });

  try {
    // Write CSV header if file doesn't exist
    if (!existsSync(CSV_PATH)) {
      writeFileSync(CSV_PATH, "timestamp,device,channel,label,value,units\n");
    }

    const timestamp = new Date().toISOString();
    const devices = await client.getDevices({ status: "online" });

    for (const device of devices) {
      const channels = await client.getAllDeviceChannels(device.serial);

      for (const ch of channels) {
        if (ch.value == null) continue;

        const row = [
          timestamp,
          device.label ?? device.serial,
          ch.number ?? "?",
          ch.label ?? "",
          ch.value,
          ch.units ?? "F",
        ].join(",");

        appendFileSync(CSV_PATH, `${row}\n`);
      }
    }

    console.log(`Logged readings at ${timestamp} to ${CSV_PATH}`);
  } finally {
    client.close();
  }
}

logReadings();
```

---

## 4. Session Management

Start a named cooking session, monitor it with real-time polling, and end it when done.

```typescript
import { ThermoworksCloud } from "thermoworks-sdk";

async function manageCookSession(serial: string, sessionLabel: string) {
  const client = new ThermoworksCloud({
    email: process.env.THERMOWORKS_EMAIL!,
    password: process.env.THERMOWORKS_PASSWORD!,
  });

  try {
    // Start a named session
    const startResult = await client.startSession(serial, sessionLabel);
    if (!startResult.success) {
      console.error(`Failed to start session: ${startResult.error}`);
      return;
    }
    console.log(`Session "${sessionLabel}" started on ${serial}`);

    // Set up high-temp alarm for done notification
    await client.setAlarm(serial, 1, {
      high: { value: 203, units: "F", enabled: true },
    });
    console.log("High alarm set at 203°F on channel 1");

    // Subscribe to real-time updates
    const sub = client.subscribe(
      serial,
      (update) => {
        console.log(
          `  [${new Date().toLocaleTimeString()}] Ch${update.channel}: ${update.value}°${update.units}`,
        );
      },
      { intervalMs: 10_000, onError: (err) => console.error("Poll error:", err.message) },
    );

    // Monitor for a set duration (e.g., wait for user input in a real app)
    console.log("Monitoring... press Ctrl+C to end session");
    await new Promise((resolve) => {
      process.on("SIGINT", resolve);
    });

    // Clean up
    sub.unsubscribe();

    const endResult = await client.endSession(serial);
    if (endResult.success) {
      console.log(`\nSession "${sessionLabel}" ended.`);
    }
  } finally {
    client.close();
  }
}

const serial = process.argv[2];
const label = process.argv[3] ?? "Brisket Cook";

if (!serial) {
  console.error("Usage: npx tsx session-manager.ts <device-serial> [session-label]");
  process.exit(1);
}

manageCookSession(serial, label);
```

---

## 5. Multi-Device Dashboard

Fetch all devices and their channels in parallel for a real-time dashboard view.

```typescript
import { ThermoworksCloud, formatTimeAgo, type Device, type DeviceChannel } from "thermoworks-sdk";

interface DeviceSnapshot {
  device: Device;
  channels: DeviceChannel[];
}

async function buildDashboard() {
  const client = new ThermoworksCloud({
    email: process.env.THERMOWORKS_EMAIL!,
    password: process.env.THERMOWORKS_PASSWORD!,
    tokenCachePath: true,
  });

  try {
    const devices = await client.getDevices();

    // Fetch all channels in parallel
    const snapshots: DeviceSnapshot[] = await Promise.all(
      devices.map(async (device) => ({
        device,
        channels: await client.getAllDeviceChannels(device.serial),
      })),
    );

    // Render dashboard
    console.log("═══════════════════════════════════════════════════════");
    console.log(" ThermoWorks Device Dashboard");
    console.log("═══════════════════════════════════════════════════════");

    for (const { device, channels } of snapshots) {
      const name = device.label ?? device.serial;
      const status = device.status === "online" ? "🟢" : "⚪";
      const battery = device.battery != null ? `${device.battery}%` : "n/a";
      const lastSeen = formatTimeAgo(device.lastSeen);

      console.log(`\n${status} ${name} (${device.type ?? "unknown"})`);
      console.log(`  Battery: ${battery} | Last seen: ${lastSeen}`);

      if (channels.length === 0) {
        console.log("  No channels available");
        continue;
      }

      for (const ch of channels) {
        const label = ch.label ?? `Channel ${ch.number}`;
        const temp = ch.value != null ? `${ch.value}°${ch.units}` : "---";
        const alarmIcon =
          ch.alarmHigh?.alarming ? " 🔴 HIGH" : ch.alarmLow?.alarming ? " 🟡 LOW" : "";
        console.log(`  ${label}: ${temp}${alarmIcon}`);
      }
    }

    console.log("\n═══════════════════════════════════════════════════════");
    console.log(`  ${devices.length} device(s) | ${new Date().toLocaleString()}`);
  } finally {
    client.close();
  }
}

buildDashboard();
```

---

## 6. Archive Export

List archived sessions for a device, fetch readings, and format them as a table.

```typescript
import { ThermoworksCloud, type Archive, type ArchiveChannel } from "thermoworks-sdk";

async function exportArchives(serial: string) {
  const client = new ThermoworksCloud({
    email: process.env.THERMOWORKS_EMAIL!,
    password: process.env.THERMOWORKS_PASSWORD!,
  });

  try {
    // List recent archives
    const archives = await client.getArchives(serial, { limit: 10 });

    if (archives.length === 0) {
      console.log(`No archives found for device ${serial}`);
      return;
    }

    console.log(`Found ${archives.length} archive(s) for ${serial}:\n`);

    for (const archive of archives) {
      printArchiveSummary(archive);

      // Fetch full archive details with readings
      const full = await client.getArchive(serial, archive.id);
      if (full.channels) {
        printReadingsTable(full.channels);
      }
      console.log("");
    }
  } finally {
    client.close();
  }
}

function printArchiveSummary(archive: Archive) {
  const start = archive.start?.toLocaleString() ?? "unknown";
  const end = archive.end?.toLocaleString() ?? "ongoing";
  const label = archive.label ?? "Unnamed session";
  const count = archive.count ?? 0;

  console.log(`── ${label} ──`);
  console.log(`   Period: ${start} → ${end}`);
  console.log(`   Readings: ${count}`);
  if (archive.notes) {
    console.log(`   Notes: ${archive.notes}`);
  }
}

function printReadingsTable(channels: ArchiveChannel[]) {
  console.log("\n   Channel        | Min     | Max     | Last    | Readings");
  console.log("   ───────────────┼─────────┼─────────┼─────────┼─────────");

  for (const ch of channels) {
    const label = (ch.label ?? `Ch ${ch.number}`).padEnd(14);
    const min = ch.minimum?.value != null ? `${ch.minimum.value}°${ch.units}` : "---";
    const max = ch.maximum?.value != null ? `${ch.maximum.value}°${ch.units}` : "---";
    const last = ch.value != null ? `${ch.value}°${ch.units}` : "---";
    const readings = ch.recentReadings.length;

    console.log(
      `   ${label} | ${min.padEnd(7)} | ${max.padEnd(7)} | ${last.padEnd(7)} | ${readings}`,
    );
  }
}

const serial = process.argv[2];
if (!serial) {
  console.error("Usage: npx tsx archive-export.ts <device-serial>");
  process.exit(1);
}

exportArchives(serial);
```

---

## 7. Firmware Version Checking

Compare the current firmware on each device against the latest available version.

```typescript
import { ThermoworksCloud, type Device, type FirmwareInfo } from "thermoworks-sdk";

async function checkFirmware() {
  const client = new ThermoworksCloud({
    email: process.env.THERMOWORKS_EMAIL!,
    password: process.env.THERMOWORKS_PASSWORD!,
    tokenCachePath: true,
  });

  try {
    const devices = await client.getDevices();

    // Group devices by type to minimize firmware info lookups
    const byType = new Map<string, Device[]>();
    for (const device of devices) {
      const type = device.type ?? "unknown";
      const group = byType.get(type) ?? [];
      group.push(device);
      byType.set(type, group);
    }

    console.log("Firmware Status Report");
    console.log("══════════════════════\n");

    let outdatedCount = 0;

    for (const [type, typeDevices] of byType) {
      let latest: FirmwareInfo | null = null;
      try {
        latest = await client.getFirmwareInfo(type);
      } catch {
        console.log(`  [${type}] Unable to fetch firmware info (unsupported type?)\n`);
        continue;
      }

      console.log(`  ${type} - latest: v${latest.version}`);

      for (const device of typeDevices) {
        const name = device.label ?? device.serial;
        const current = device.firmware ?? "unknown";
        const isUpToDate = current === latest.version;

        if (isUpToDate) {
          console.log(`    ✓ ${name}: v${current} (up to date)`);
        } else {
          console.log(`    ✗ ${name}: v${current} → v${latest.version} available`);
          outdatedCount++;
        }
      }
      console.log("");
    }

    console.log("──────────────────────");
    if (outdatedCount === 0) {
      console.log("All devices are running the latest firmware.");
    } else {
      console.log(
        `${outdatedCount} device(s) have firmware updates available.`,
      );
    }
  } finally {
    client.close();
  }
}

checkFirmware();
```

---

## 8. Channel Labels

Assign custom display labels to channels and resolve them with a three-tier fallback (custom > cloud > "Ch N"):

```typescript
import {
  ThermoworksCloud,
  channelLabelKey,
  resolveChannelLabel,
  sanitizeLabel,
  type ChannelLabelMap,
} from "thermoworks-sdk";

// Build a label map (stored in ~/.thermoworks/config.json under "channelLabels")
const labels: ChannelLabelMap = {
  [channelLabelKey("ABC123", "1")]: "Brisket",
  [channelLabelKey("ABC123", "2")]: "Pit",
};

const client = new ThermoworksCloud({ email, password });
const devices = await client.getDevices();

for (const device of devices) {
  const channels = await client.getAllDeviceChannels(device.serial);
  for (const [i, ch] of channels.entries()) {
    // Resolves: custom label > cloud ch.label > "Ch N"
    const name = resolveChannelLabel(device.serial, ch, labels, i);
    console.log(`${name}: ${ch.value}°${ch.units}`);
  }
}

// Always sanitize user-provided labels before storing
const userInput = "My <script>Label\x1b[31m";
const safe = sanitizeLabel(userInput); // "My Label"

client.close();
```

---

## Additional Patterns

### Unit Conversion

Convert between Fahrenheit and Celsius using the built-in helpers:

```typescript
import { toCelsius, toFahrenheit } from "thermoworks-sdk";

const tempF = 225;
console.log(`${tempF}°F = ${toCelsius(tempF)}°C`);

const tempC = 100;
console.log(`${tempC}°C = ${toFahrenheit(tempC)}°F`);
```

### Real-Time Subscription

Poll a device for changes and react only when values actually update:

```typescript
import { ThermoworksCloud } from "thermoworks-sdk";

const client = new ThermoworksCloud({
  email: process.env.THERMOWORKS_EMAIL!,
  password: process.env.THERMOWORKS_PASSWORD!,
});

const sub = client.subscribe(
  "YOUR-SERIAL",
  (update) => {
    console.log(
      `[${update.timestamp}] Ch${update.channel}: ${update.value}°${update.units} (${update.status})`,
    );
  },
  {
    intervalMs: 10_000,
    onError: (err) => console.error("Subscription error:", err.message),
  },
);

// Stop after 5 minutes
setTimeout(() => {
  sub.unsubscribe();
  client.close();
}, 5 * 60 * 1000);
```

### Error Handling

Robust error handling with SDK-specific error types:

```typescript
import { ThermoworksCloud, AuthError, NotFoundError, NetworkError } from "thermoworks-sdk";

const client = new ThermoworksCloud({
  email: process.env.THERMOWORKS_EMAIL!,
  password: process.env.THERMOWORKS_PASSWORD!,
  retry: { maxRetries: 3, baseDelayMs: 1000 },
});

try {
  const device = await client.getDevice("SOME-SERIAL");
  console.log(`Found: ${device.label}`);
} catch (err) {
  if (err instanceof AuthError) {
    console.error(`Authentication failed: ${err.message} (reason: ${err.reason})`);
  } else if (err instanceof NotFoundError) {
    console.error("Device not found - check the serial number");
  } else if (err instanceof NetworkError) {
    console.error(`Network error: ${err.message}`);
  } else {
    throw err; // unexpected error, re-throw
  }
} finally {
  client.close();
}
```
