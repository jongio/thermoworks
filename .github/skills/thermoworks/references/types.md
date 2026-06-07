# Key Types

Types you'll use most when working with ThermoWorks data.

## Device

```ts
interface Device {
  serial: string;              // unique identifier
  label: string | null;        // user-assigned name
  type: string | null;         // "node", "smoke", "signals", etc.
  status: string | null;       // "online" or "offline"
  battery: number | null;      // percentage
  firmware: string | null;
  lastSeen: Date | null;
  fan: FanSettings | null;     // BBQ fan controller (if connected)
}
```

## DeviceChannel

```ts
interface DeviceChannel {
  value: number | null;        // current temperature reading
  units: string | null;        // "F", "C", or "H" (humidity)
  label: string | null;        // probe label
  enabled: boolean | null;
  alarmHigh: Alarm | null;
  alarmLow: Alarm | null;
  rateOfChange: number | null; // degrees per minute
  minimum: MinMaxReading | null;
  maximum: MinMaxReading | null;
}
```

## Alarm and AlarmState

```ts
interface Alarm {
  enabled: boolean;
  alarming: boolean;           // currently firing
  muted: boolean | null;
  value: number | null;        // threshold temperature
  units: string | null;
}

type AlarmState = "none" | "low" | "high";
```

## Error classes

```ts
class AuthError extends Error { reason: string; }
class NotFoundError extends Error {}
class NetworkError extends Error { statusCode: number | null; }
```

## DeviceFilter

```ts
interface DeviceFilter {
  serial?: string | string[];
  type?: string | string[];
  status?: string | string[];
  activeWithinMinutes?: number;
}
```
