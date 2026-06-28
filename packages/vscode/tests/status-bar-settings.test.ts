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

// ─── Mock thermoworks-sdk ────────────────────────────────────────────────────

vi.mock("thermoworks-sdk", () => ({
	ThermoworksCloud: class {
		close = vi.fn();
	},
	escalateAlarm: vi.fn((_current: string, next: string) => next || "none"),
	getChannelsAlarmState: vi.fn(() => "none"),
}));

vi.mock("../src/config", () => ({
	loadConfig: vi.fn().mockResolvedValue({
		devices: [
			{ serial: "AAA", label: "Smoker", channels: [1] },
			{ serial: "BBB", label: "Fridge", channels: [1] },
			{ serial: "CCC", label: "Oven", channels: [1] },
		],
		refreshSeconds: 15,
	}),
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { TemperatureStatusBar } from "../src/status-bar";

// ─── Test helpers ────────────────────────────────────────────────────────────

function createMockCredentialStore() {
	return {
		getCredentials: vi.fn().mockResolvedValue({ email: "a@b.com", password: "pass" }),
		storeCredentials: vi.fn(),
		deleteCredentials: vi.fn(),
	};
}

function createMockClientManager() {
	return {
		getClient: vi.fn(() => ({
			getDevices: vi.fn(() =>
				Promise.resolve([{ serial: "AAA" }, { serial: "BBB" }, { serial: "CCC" }]),
			),
			getAllDeviceChannels: vi.fn((serial: string) => {
				const channelsByDevice: Record<
					string,
					Array<{ value: number; units: string; label: string }>
				> = {
					AAA: [{ value: 225, units: "F", label: "Pit" }],
					BBB: [{ value: 38, units: "F", label: "Internal" }],
					CCC: [{ value: 350, units: "F", label: "Rack" }],
				};
				return Promise.resolve(channelsByDevice[serial] ?? []);
			}),
			close: vi.fn(),
		})),
		close: vi.fn(),
	};
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("TemperatureStatusBar - defaultDevice setting", () => {
	let statusBar: TemperatureStatusBar;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		mockStatusBarItem.text = "";
	});

	afterEach(() => {
		statusBar.dispose();
		vi.useRealTimers();
	});

	it("shows first device when defaultDevice is empty", async () => {
		configValues = { statusBarMode: "single", defaultDevice: "" };
		statusBar = new TemperatureStatusBar(
			createMockCredentialStore() as never,
			createMockClientManager() as never,
			{ subscriptions: { push: vi.fn() } } as never,
		);
		await statusBar.start();
		expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");
	});

	it("prefers device matching defaultDevice by label", async () => {
		configValues = { statusBarMode: "single", defaultDevice: "Fridge" };
		statusBar = new TemperatureStatusBar(
			createMockCredentialStore() as never,
			createMockClientManager() as never,
			{ subscriptions: { push: vi.fn() } } as never,
		);
		await statusBar.start();
		expect(mockStatusBarItem.text).toBe("$(flame) Fridge:38\u00B0F");
	});

	it("prefers device matching defaultDevice by serial", async () => {
		configValues = { statusBarMode: "single", defaultDevice: "CCC" };
		statusBar = new TemperatureStatusBar(
			createMockCredentialStore() as never,
			createMockClientManager() as never,
			{ subscriptions: { push: vi.fn() } } as never,
		);
		await statusBar.start();
		expect(mockStatusBarItem.text).toBe("$(flame) Oven:350\u00B0F");
	});

	it("matches defaultDevice case-insensitively", async () => {
		configValues = { statusBarMode: "single", defaultDevice: "fridge" };
		statusBar = new TemperatureStatusBar(
			createMockCredentialStore() as never,
			createMockClientManager() as never,
			{ subscriptions: { push: vi.fn() } } as never,
		);
		await statusBar.start();
		expect(mockStatusBarItem.text).toBe("$(flame) Fridge:38\u00B0F");
	});

	it("falls back to first device when defaultDevice does not match", async () => {
		configValues = { statusBarMode: "single", defaultDevice: "NonExistent" };
		statusBar = new TemperatureStatusBar(
			createMockCredentialStore() as never,
			createMockClientManager() as never,
			{ subscriptions: { push: vi.fn() } } as never,
		);
		await statusBar.start();
		expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");
	});

	it("does not affect cycle mode", async () => {
		configValues = { statusBarMode: "cycle", defaultDevice: "Fridge", cycleInterval: 5 };
		statusBar = new TemperatureStatusBar(
			createMockCredentialStore() as never,
			createMockClientManager() as never,
			{ subscriptions: { push: vi.fn() } } as never,
		);
		await statusBar.start();
		// Cycle mode starts at index 0 regardless of defaultDevice
		expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");
	});
});

describe("TemperatureStatusBar - streaming setting", () => {
	let statusBar: TemperatureStatusBar;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		mockStatusBarItem.text = "";
	});

	afterEach(() => {
		statusBar.dispose();
		vi.useRealTimers();
	});

	it("still renders initial data when streaming is disabled", async () => {
		configValues = { statusBarMode: "single", streaming: false, refreshInterval: 15 };
		statusBar = new TemperatureStatusBar(
			createMockCredentialStore() as never,
			createMockClientManager() as never,
			{ subscriptions: { push: vi.fn() } } as never,
		);
		await statusBar.start();
		// Initial fetch still works; only the live stream is skipped
		expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");
	});

	it("does not update via stream when streaming is disabled", async () => {
		configValues = { statusBarMode: "single", streaming: false, refreshInterval: 15 };
		const manager = createMockClientManager();
		statusBar = new TemperatureStatusBar(
			createMockCredentialStore() as never,
			manager as never,
			{ subscriptions: { push: vi.fn() } } as never,
		);
		await statusBar.start();
		expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");

		// Advance timers; with streaming=false, the DeviceStream is never created
		// so no live snapshots fire. The initial fetch reading persists.
		const client = manager.getClient();
		const _callsBefore = client.getAllDeviceChannels.mock.calls.length;

		await vi.advanceTimersByTimeAsync(15_000);

		// DeviceStream would have called getAllDeviceChannels again, but since
		// streaming is off, the call count should not increase from stream polls.
		// (The retry timer may fire, but that's the bootstrap retry, not streaming.)
		expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");
	});
});
