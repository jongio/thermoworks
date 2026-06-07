import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock vscode ─────────────────────────────────────────────────────────────

const mockStatusBarItem = {
	text: "",
	tooltip: "",
	command: "",
	backgroundColor: undefined as unknown,
	color: undefined as unknown,
	show: vi.fn(),
	hide: vi.fn(),
	dispose: vi.fn(),
};

let configValues: Record<string, unknown> = {};
let configChangeHandler: ((e: { affectsConfiguration: (key: string) => boolean }) => void) | null =
	null;

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
		onDidChangeConfiguration: vi.fn((handler: typeof configChangeHandler) => {
			configChangeHandler = handler;
			return { dispose: vi.fn() };
		}),
	},
	StatusBarAlignment: { Right: 2, Left: 1 },
	ThemeColor: class {
		constructor(public id: string) {}
	},
	MarkdownString: class {
		value: string;
		constructor(value: string) {
			this.value = value;
		}
	},
}));

// ─── Mock thermoworks-sdk ────────────────────────────────────────────────────

vi.mock("thermoworks-sdk", () => ({
	ThermoworksCloud: class {
		close = vi.fn();
		getUser = vi.fn().mockResolvedValue({});
		getDevices = vi.fn().mockResolvedValue([]);
		getAllDeviceChannels = vi.fn().mockResolvedValue([]);
	},
	escalateAlarm: vi.fn((_current: string, next: string) => next || "none"),
	getChannelsAlarmState: vi.fn(() => "none"),
}));

// ─── Mock config ─────────────────────────────────────────────────────────────

vi.mock("../src/config", () => ({
	loadConfig: vi.fn().mockResolvedValue({
		devices: [
			{ serial: "AAA", label: "Smoker", channels: [1] },
			{ serial: "BBB", label: "Fridge", channels: [1] },
			{ serial: "CCC", label: "Oven", channels: [1] },
		],
		refreshSeconds: 30,
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
			getDevices: vi.fn().mockResolvedValue([
				{ serial: "AAA", name: "Smoker" },
				{ serial: "BBB", name: "Fridge" },
				{ serial: "CCC", name: "Oven" },
			]),
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

function createMockContext() {
	return {
		subscriptions: { push: vi.fn() },
	} as any;
}

function fireConfigChange(keys: string[]) {
	configChangeHandler?.({
		affectsConfiguration: (key: string) => keys.includes(key),
	});
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("TemperatureStatusBar - Multi-device cycling", () => {
	let statusBar: TemperatureStatusBar;
	let credStore: ReturnType<typeof createMockCredentialStore>;
	let clientManager: ReturnType<typeof createMockClientManager>;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();

		mockStatusBarItem.text = "";
		mockStatusBarItem.tooltip = "";
		mockStatusBarItem.command = "";
		mockStatusBarItem.backgroundColor = undefined;
		mockStatusBarItem.color = undefined;

		configValues = {};

		credStore = createMockCredentialStore();
		clientManager = createMockClientManager();
		statusBar = new TemperatureStatusBar(
			credStore as any,
			clientManager as any,
			createMockContext(),
		);
	});

	afterEach(() => {
		statusBar.dispose();
		vi.useRealTimers();
	});

	describe("single mode (default)", () => {
		it("shows only the first device after refresh", async () => {
			configValues = { statusBarMode: "single", cycleInterval: 5 };
			await statusBar.start();

			expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");
		});

		it("click advances to next device in single mode", async () => {
			configValues = { statusBarMode: "single", cycleInterval: 5 };
			await statusBar.start();

			statusBar.cycleNext();
			expect(mockStatusBarItem.text).toBe("$(flame) Fridge:38\u00B0F");
			statusBar.cycleNext();
			expect(mockStatusBarItem.text).toBe("$(flame) Oven:350\u00B0F");
			statusBar.cycleNext();
			// Wraps around to first
			expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");
		});
	});

	describe("cycle mode", () => {
		it("shows the first device initially", async () => {
			configValues = { statusBarMode: "cycle", cycleInterval: 5 };
			await statusBar.start();

			expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");
		});

		it("rotates to next device on timer tick", async () => {
			configValues = { statusBarMode: "cycle", cycleInterval: 5 };
			await statusBar.start();

			expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");

			vi.advanceTimersByTime(5000);
			expect(mockStatusBarItem.text).toBe("$(flame) Fridge:38\u00B0F");

			vi.advanceTimersByTime(5000);
			expect(mockStatusBarItem.text).toBe("$(flame) Oven:350\u00B0F");

			// Wraps around
			vi.advanceTimersByTime(5000);
			expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");
		});

		it("click advances immediately", async () => {
			configValues = { statusBarMode: "cycle", cycleInterval: 5 };
			await statusBar.start();

			statusBar.cycleNext();
			expect(mockStatusBarItem.text).toBe("$(flame) Fridge:38\u00B0F");

			statusBar.cycleNext();
			expect(mockStatusBarItem.text).toBe("$(flame) Oven:350\u00B0F");
		});

		it("respects custom cycle interval", async () => {
			configValues = { statusBarMode: "cycle", cycleInterval: 2 };
			await statusBar.start();

			vi.advanceTimersByTime(2000);
			expect(mockStatusBarItem.text).toBe("$(flame) Fridge:38\u00B0F");
		});

		it("enforces minimum cycle interval of 1 second", async () => {
			configValues = { statusBarMode: "cycle", cycleInterval: 0.1 };
			await statusBar.start();

			// At 500ms it should NOT have cycled (min is 1000ms)
			vi.advanceTimersByTime(500);
			expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");

			// At 1000ms it should cycle
			vi.advanceTimersByTime(500);
			expect(mockStatusBarItem.text).toBe("$(flame) Fridge:38\u00B0F");
		});
	});

	describe("all mode", () => {
		it("shows all devices joined by middle dot", async () => {
			configValues = { statusBarMode: "all", cycleInterval: 5 };
			await statusBar.start();

			expect(mockStatusBarItem.text).toBe(
				"$(flame) Smoker:225\u00B0F \u00B7 Fridge:38\u00B0F \u00B7 Oven:350\u00B0F",
			);
		});

		it("still allows manual cycling via cycleNext", async () => {
			configValues = { statusBarMode: "all", cycleInterval: 5 };
			await statusBar.start();

			statusBar.cycleNext();
			// In all mode, cycleNext still advances the index but display shows all
			// so the visual output doesn't change (all parts always shown)
			expect(mockStatusBarItem.text).toBe(
				"$(flame) Smoker:225\u00B0F \u00B7 Fridge:38\u00B0F \u00B7 Oven:350\u00B0F",
			);
		});
	});

	describe("config change handling", () => {
		it("updates display when statusBarMode changes", async () => {
			configValues = { statusBarMode: "all", cycleInterval: 5 };
			await statusBar.start();
			expect(mockStatusBarItem.text).toContain("Fridge");

			// Switch to single
			configValues = { statusBarMode: "single", cycleInterval: 5 };
			fireConfigChange(["thermoworks.statusBarMode"]);
			expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");
		});

		it("restarts cycle timer when cycleInterval changes", async () => {
			configValues = { statusBarMode: "cycle", cycleInterval: 10 };
			await statusBar.start();

			// After 5 seconds with 10s interval, should NOT cycle
			vi.advanceTimersByTime(5000);
			expect(mockStatusBarItem.text).toBe("$(flame) Smoker:225\u00B0F");

			// Change interval to 3s
			configValues = { statusBarMode: "cycle", cycleInterval: 3 };
			fireConfigChange(["thermoworks.cycleInterval"]);

			// Now 3 seconds should trigger a cycle
			vi.advanceTimersByTime(3000);
			expect(mockStatusBarItem.text).toBe("$(flame) Fridge:38\u00B0F");
		});
	});

	describe("edge cases", () => {
		it("cycleNext does nothing with zero devices", async () => {
			const { loadConfig } = await import("../src/config");
			vi.mocked(loadConfig).mockResolvedValueOnce({ devices: [], refreshSeconds: 30 });

			configValues = { statusBarMode: "cycle", cycleInterval: 5 };
			await statusBar.start();

			// No devices -> cycleNext is a no-op
			statusBar.cycleNext();
			expect(mockStatusBarItem.text).toBe("$(flame) No devices");
		});

		it("cycleNext does nothing with exactly one device", async () => {
			const { loadConfig } = await import("../src/config");
			vi.mocked(loadConfig).mockResolvedValueOnce({
				devices: [{ serial: "AAA", label: "Smoker", channels: [1] }],
				refreshSeconds: 30,
			});

			configValues = { statusBarMode: "cycle", cycleInterval: 5 };
			await statusBar.start();

			const textBefore = mockStatusBarItem.text;
			statusBar.cycleNext();
			expect(mockStatusBarItem.text).toBe(textBefore);
		});

		it("does not start cycle timer when mode is single", async () => {
			configValues = { statusBarMode: "single", cycleInterval: 5 };
			await statusBar.start();

			const textAfterStart = mockStatusBarItem.text;
			vi.advanceTimersByTime(20_000);

			// The refresh timer fires at 60s (default), but cycle timer shouldn't auto-advance
			// Only the refresh timer (60s) would change things, not cycling at 5s
			expect(mockStatusBarItem.text).toBe(textAfterStart);
		});

		it("stops cycle timer on dispose", async () => {
			configValues = { statusBarMode: "cycle", cycleInterval: 5 };
			await statusBar.start();

			statusBar.dispose();
			const textAfterDispose = mockStatusBarItem.text;
			vi.advanceTimersByTime(10_000);
			expect(mockStatusBarItem.text).toBe(textAfterDispose);
		});

		it("status bar command is set to cycleNext", () => {
			expect(mockStatusBarItem.command).toBe("thermoworks.cycleNext");
		});
	});
});
