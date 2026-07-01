// test/fake-sdk.mjs — stand-in for `thermoworks-sdk`, injected via
// THERMOWORKS_SDK_PATH so the smoke test can exercise live mode + sign-in with no
// network. Mirrors the real SDK surface the canvas uses: ThermoworksCloud with
// getDevices()/getAllDeviceChannels()/close(), plus the credential helpers and
// the CREDENTIAL_* constants used by the keychain probe.

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthError";
  }
}

export const CREDENTIAL_SERVICE = "thermoworks";
export const CREDENTIAL_ACCOUNT = "credentials";

export function resolveEnvCredentials() {
  const email = process.env.THERMOWORKS_EMAIL;
  const password = process.env.THERMOWORKS_PASSWORD;
  return email && password ? { email, password } : null;
}

export function parseCredentialBlob(blob) {
  try {
    const o = JSON.parse(blob);
    return o.email && o.password ? { email: o.email, password: o.password } : null;
  } catch {
    return null;
  }
}

// Two fake devices, so the device/session picker has something to switch between.
const DEVICES = [
  {
    serial: "ABC123",
    label: "Signals",
    type: "signals",
    status: "online",
    sessionLabel: "Sunday Brisket",
    sessionStart: new Date(Date.now() - 90 * 60000),
    channels: [
      { number: "1", label: "Pit", value: 250, units: "F", enabled: true, alarmHigh: null, alarmLow: null },
      { number: "2", label: "Brisket", value: 165, units: "F", enabled: true, alarmHigh: { alarming: false }, alarmLow: null },
    ],
  },
  {
    serial: "XYZ789",
    label: "Smoke",
    type: "smoke",
    status: "online",
    sessionLabel: "Chicken Thighs",
    sessionStart: new Date(Date.now() - 30 * 60000),
    channels: [
      { number: "1", label: "Grate", value: 375, units: "F", enabled: true, alarmHigh: null, alarmLow: null },
      { number: "2", label: "Thigh", value: 168, units: "F", enabled: true, alarmHigh: { alarming: true }, alarmLow: null },
    ],
  },
];

export class ThermoworksCloud {
  constructor(config) {
    this._ok = config?.email === "good@x.com" && config?.password === "secret";
  }
  async getDevices() {
    if (!this._ok) throw new AuthError("Invalid email or password");
    return DEVICES.map((d) => ({
      serial: d.serial,
      label: d.label,
      type: d.type,
      status: d.status,
      sessionLabel: d.sessionLabel,
      sessionStart: d.sessionStart,
    }));
  }
  async getAllDeviceChannels(serial) {
    const dev = DEVICES.find((d) => d.serial === serial);
    return dev ? dev.channels : [];
  }
  close() {}
}
