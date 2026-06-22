import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock vscode ─────────────────────────────────────────────────────────────

const mockStatusBarItem = {
	text: "",
	tooltip: "" as unknown,
	command: "",
	backgroundColor: undefined as unknown,
	color: undefined as unknown,
	show: vi.fn(),
	hide: vi.fn(),
	dispose: vi.fn(),
};

let configValues: Record<string, unknown> = {};

vi.mock("vscode", () => ({
	window: {
		createStatusBarItem: vi.fn(() => mockStatusBarItem),
		showInputBox: vi.fn(),
		showErrorMessage: vi.fn(),
		showInformationMessage: vi.fn(),
	},
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn((key: string, defaultValue: unknown) => configValues[key] ?? defaultValue),
		})),
		onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
	},
	StatusBarAlignment: { Right: 2, Left: 1 },
	ThemeColor: class {
		constructor(public id: string) {}
	},
	MarkdownString: class {
		constructor(public value: string) {}
	},
}));

// ─── Mock thermoworks-sdk with a mutable channel store ───────────────────────

let channelStore: Record<string, Array<{ value: number; units: string; label: string }>> = {};
let failNextDevices = 0;

vi.mock("thermoworks-sdk", () => ({
	ThermoworksCloud: class {
		close = vi.fn();
	},
	escalateAlarm: vi.fn((_current: string, next: string) => next || "none"),
	getChannelsAlarmState: vi.fn(() => "none"),
}));

vi.mock("../src/config", () => ({
	loadConfig: vi.fn().mockResolvedValue({
		devices: [{ serial: "AAA", label: "Smoker", channels: [1] }],
		refreshSeconds: 15,
	}),
}));

import { TemperatureStatusBar } from "../src/status-bar";

function createMockCredentialStore() {
	return {
		getCredentials: vi.fn().mockResolvedValue({ email: "a@b.com", password: "pass" }),
		storeCredentials: vi.fn(),
		deleteCredentials: vi.fn(),
	};
}

function createMockClientManager() {
	const client = {
		getDevices: vi.fn(() => {
			if (failNextDevices > 0) {
				failNextDevices--;
				return Promise.reject(new Error("transient blip"));
			}
			return Promise.resolve([{ serial: "AAA" }]);
		}),
		getAllDeviceChannels: vi.fn((serial: string) => Promise.resolve(channelStore[serial] ?? [])),
		close: vi.fn(),
	};
	return { getClient: vi.fn(() => client), close: vi.fn() };
}

describe("TemperatureStatusBar - live streaming", () => {
	let statusBar: TemperatureStatusBar;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		mockStatusBarItem.text = "";
		configValues = { statusBarMode: "single", refreshInterval: 15 };
		channelStore = { AAA: [{ value: 225, units: "F", label: "Pit" }] };
		failNextDevices = 0;
		statusBar = new TemperatureStatusBar(
			createMockCredentialStore() as never,
			createMockClientManager() as never,
			{ subscriptions: { push: vi.fn() } } as never,
		);
	});

	afterEach(() => {
		statusBar.dispose();
		vi.useRealTimers();
	});

	it("renders the initial reading after start", async () => {
		await statusBar.start();
		expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");
	});

	it("updates the status bar when the live stream reports a new reading", async () => {
		await statusBar.start();
		expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");

		// Temperature climbs; the stream's next poll should re-render.
		channelStore = { AAA: [{ value: 240, units: "F", label: "Pit" }] };
		await vi.advanceTimersByTimeAsync(15_000);

		expect(mockStatusBarItem.text).toBe("$(flame) Smoker:240\u00B0F");
	});

	it("stops streaming after dispose", async () => {
		await statusBar.start();
		statusBar.dispose();

		channelStore = { AAA: [{ value: 300, units: "F", label: "Pit" }] };
		await vi.advanceTimersByTimeAsync(60_000);

		// Text remains at the last value rendered before dispose.
		expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");
	});

	it("pauses live updates during demo mode", async () => {
		await statusBar.start();
		statusBar.simulateAlarm("high");

		channelStore = { AAA: [{ value: 250, units: "F", label: "Pit" }] };
		await vi.advanceTimersByTimeAsync(30_000);

		// The live reading (250) is never streamed into the status bar during a demo.
		expect(mockStatusBarItem.text).not.toContain("250");
	});

	it("auto-retries after a transient bootstrap failure", async () => {
		failNextDevices = 1;
		await statusBar.start();
		// Initial bootstrap failed -> error placeholder, no readings yet.
		expect(mockStatusBarItem.text).toBe("$(flame) --");

		// The scheduled retry recovers once the API responds.
		await vi.advanceTimersByTimeAsync(15_000);
		expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");
	});
});
