import type { Archive, ArchiveChannel, TemperatureReading } from "thermoworks-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── VS Code mock ────────────────────────────────────────────────────────────

const { mockCreateWebviewPanel, mockPostMessage, mockShowErrorMessage } = vi.hoisted(() => ({
	mockCreateWebviewPanel: vi.fn(),
	mockPostMessage: vi.fn(),
	mockShowErrorMessage: vi.fn(),
}));

vi.mock("vscode", () => ({
	ViewColumn: { Beside: 2 },
	Uri: { parse: vi.fn((s: string) => ({ toString: () => s })) },
	window: {
		createWebviewPanel: mockCreateWebviewPanel,
		showErrorMessage: mockShowErrorMessage,
	},
	commands: { executeCommand: vi.fn() },
	workspace: { getConfiguration: vi.fn(() => ({ get: () => 60 })) },
}));

// ─── SDK mock ────────────────────────────────────────────────────────────────

const { mockGetArchives } = vi.hoisted(() => ({
	mockGetArchives: vi.fn(),
}));

vi.mock("thermoworks-sdk", () => ({
	ThermoworksCloud: class {
		getArchives = mockGetArchives;
		close = vi.fn();
	},
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { ChartPanel, formatChartData, formatReadings } from "../src/chart-panel";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeReading(value: number, minutesAgo: number): TemperatureReading {
	return {
		value,
		timestamp: new Date(Date.now() - minutesAgo * 60_000),
		units: "F",
	};
}

function makeArchiveChannel(overrides: Partial<ArchiveChannel> = {}): ArchiveChannel {
	return {
		number: "1",
		label: "Pit",
		units: "F",
		value: 225,
		status: "normal",
		enabled: true,
		color: "#FF6B35",
		type: "temperature",
		alarmHigh: {
			enabled: true,
			alarming: false,
			muted: false,
			value: 275,
			units: "F",
			lastNotified: null,
		},
		alarmLow: {
			enabled: true,
			alarming: false,
			muted: false,
			value: 200,
			units: "F",
			lastNotified: null,
		},
		minimum: null,
		maximum: null,
		recentReadings: [makeReading(220, 10), makeReading(225, 5), makeReading(230, 1)],
		...overrides,
	};
}

function makeArchive(overrides: Partial<Archive> = {}): Archive {
	return {
		id: "archive-001",
		start: new Date(Date.now() - 3600_000),
		end: new Date(),
		count: 100,
		type: "session",
		label: "Sunday Brisket",
		deviceLabel: "Backyard Smoker",
		notes: null,
		createdOn: new Date(),
		public: false,
		publicLink: null,
		filename: null,
		channels: [makeArchiveChannel()],
		...overrides,
	};
}

// ─── Tests: formatReadings ───────────────────────────────────────────────────

describe("formatReadings", () => {
	it("returns empty array for no readings", () => {
		expect(formatReadings([])).toEqual([]);
	});

	it("sorts readings by timestamp ascending", () => {
		const readings = [makeReading(100, 1), makeReading(200, 10), makeReading(150, 5)];
		const result = formatReadings(readings);

		expect(result).toHaveLength(3);
		// Oldest first (10 min ago), newest last (1 min ago)
		expect(result[0].value).toBe(200);
		expect(result[1].value).toBe(150);
		expect(result[2].value).toBe(100);
	});

	it("converts timestamps to ISO strings", () => {
		const readings = [makeReading(100, 5)];
		const result = formatReadings(readings);

		expect(result[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("preserves all values", () => {
		const readings = [makeReading(72.5, 3)];
		const result = formatReadings(readings);

		expect(result[0].value).toBe(72.5);
	});
});

// ─── Tests: formatChartData ──────────────────────────────────────────────────

describe("formatChartData", () => {
	it("returns series for all channels with readings", () => {
		const ch1 = makeArchiveChannel({ number: "1", label: "Pit", color: "#FF0000" });
		const ch2 = makeArchiveChannel({ number: "2", label: "Meat", color: "#00FF00" });
		const archive = makeArchive({ channels: [ch1, ch2] });

		const { series } = formatChartData(archive);

		expect(series).toHaveLength(2);
		expect(series[0].label).toBe("Pit");
		expect(series[0].color).toBe("#FF0000");
		expect(series[1].label).toBe("Meat");
		expect(series[1].color).toBe("#00FF00");
	});

	it("filters to specific channel when channelNumber provided", () => {
		const ch1 = makeArchiveChannel({ number: "1", label: "Pit" });
		const ch2 = makeArchiveChannel({ number: "2", label: "Meat" });
		const archive = makeArchive({ channels: [ch1, ch2] });

		const { series } = formatChartData(archive, "2");

		expect(series).toHaveLength(1);
		expect(series[0].label).toBe("Meat");
	});

	it("excludes channels with no readings", () => {
		const ch1 = makeArchiveChannel({ number: "1", recentReadings: [] });
		const ch2 = makeArchiveChannel({ number: "2", label: "Active" });
		const archive = makeArchive({ channels: [ch1, ch2] });

		const { series } = formatChartData(archive);

		expect(series).toHaveLength(1);
		expect(series[0].label).toBe("Active");
	});

	it("extracts alarm thresholds from first channel", () => {
		const ch = makeArchiveChannel({
			alarmHigh: {
				enabled: true,
				alarming: false,
				muted: false,
				value: 300,
				units: "F",
				lastNotified: null,
			},
			alarmLow: {
				enabled: true,
				alarming: false,
				muted: false,
				value: 180,
				units: "F",
				lastNotified: null,
			},
		});
		const archive = makeArchive({ channels: [ch] });

		const { alarms } = formatChartData(archive);

		expect(alarms.high).toBe(300);
		expect(alarms.low).toBe(180);
	});

	it("returns null alarms when disabled", () => {
		const ch = makeArchiveChannel({
			alarmHigh: {
				enabled: false,
				alarming: false,
				muted: false,
				value: 300,
				units: "F",
				lastNotified: null,
			},
			alarmLow: {
				enabled: false,
				alarming: false,
				muted: false,
				value: 180,
				units: "F",
				lastNotified: null,
			},
		});
		const archive = makeArchive({ channels: [ch] });

		const { alarms } = formatChartData(archive);

		expect(alarms.high).toBeNull();
		expect(alarms.low).toBeNull();
	});

	it("returns null alarms when no alarm config present", () => {
		const ch = makeArchiveChannel({ alarmHigh: null, alarmLow: null });
		const archive = makeArchive({ channels: [ch] });

		const { alarms } = formatChartData(archive);

		expect(alarms.high).toBeNull();
		expect(alarms.low).toBeNull();
	});

	it("handles archive with null channels", () => {
		const archive = makeArchive({ channels: null });

		const { series, alarms } = formatChartData(archive);

		expect(series).toHaveLength(0);
		expect(alarms.high).toBeNull();
		expect(alarms.low).toBeNull();
	});

	it("uses fallback label when channel label is null", () => {
		const ch = makeArchiveChannel({ label: null, number: "3" });
		const archive = makeArchive({ channels: [ch] });

		const { series } = formatChartData(archive);

		expect(series[0].label).toBe("Ch 3");
	});

	it("uses fallback color when channel color is null", () => {
		const ch = makeArchiveChannel({ color: null });
		const archive = makeArchive({ channels: [ch] });

		const { series } = formatChartData(archive);

		expect(series[0].color).toBe("#4fc3f7");
	});

	it("uses fallback units when channel units is null", () => {
		const ch = makeArchiveChannel({ units: null });
		const archive = makeArchive({ channels: [ch] });

		const { series } = formatChartData(archive);

		expect(series[0].units).toBe("F");
	});
});

// ─── Tests: ChartPanel.show ──────────────────────────────────────────────────

describe("ChartPanel.show", () => {
	const mockWebview = {
		html: "",
		postMessage: mockPostMessage,
		cspSource: "https://test.vscode-cdn.net",
	};

	const mockPanel = {
		webview: mockWebview,
		reveal: vi.fn(),
		onDidDispose: vi.fn(),
		dispose: vi.fn(),
	};

	const mockCredentialStore = {
		getCredentials: vi.fn(),
		storeCredentials: vi.fn(),
		deleteCredentials: vi.fn(),
	};

	const mockClientManager = {
		getClient: vi.fn(),
		close: vi.fn(),
	};

	const mockExtensionUri = { toString: () => "file:///ext" } as any;

	beforeEach(() => {
		vi.clearAllMocks();
		ChartPanel.reset();
		mockCreateWebviewPanel.mockReturnValue(mockPanel);
		mockPanel.onDidDispose.mockImplementation(() => {});
	});

	it("creates a webview panel with correct config", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetArchives.mockResolvedValue([makeArchive()]);
		mockClientManager.getClient.mockReturnValue({ getArchives: mockGetArchives });

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as any,
			mockClientManager as any,
			mockExtensionUri,
		);

		expect(mockCreateWebviewPanel).toHaveBeenCalledWith(
			"thermoworksChart",
			"Temperature - SERIAL-1",
			2,
			expect.objectContaining({
				enableScripts: true,
				retainContextWhenHidden: true,
			}),
		);
	});

	it("posts chart data on successful load", async () => {
		const archive = makeArchive();
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetArchives.mockResolvedValue([archive]);
		mockClientManager.getClient.mockReturnValue({ getArchives: mockGetArchives });

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as any,
			mockClientManager as any,
			mockExtensionUri,
		);

		expect(mockPostMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "chart-data",
				payload: expect.objectContaining({
					deviceLabel: "Backyard Smoker",
					series: expect.arrayContaining([expect.objectContaining({ label: "Pit" })]),
				}),
			}),
		);
	});

	it("posts error when not signed in", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue(null);

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as any,
			mockClientManager as any,
			mockExtensionUri,
		);

		expect(mockPostMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "error",
				message: "Not signed in. Please sign in first.",
			}),
		);
	});

	it("posts error when no archives available", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetArchives.mockResolvedValue([]);
		mockClientManager.getClient.mockReturnValue({ getArchives: mockGetArchives });

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as any,
			mockClientManager as any,
			mockExtensionUri,
		);

		expect(mockPostMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "error",
				message: "No archived data available for this device.",
			}),
		);
	});

	it("posts error when archive has no readings", async () => {
		const archive = makeArchive({ channels: [makeArchiveChannel({ recentReadings: [] })] });
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetArchives.mockResolvedValue([archive]);
		mockClientManager.getClient.mockReturnValue({ getArchives: mockGetArchives });

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as any,
			mockClientManager as any,
			mockExtensionUri,
		);

		expect(mockPostMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "error",
				message: "No temperature readings found in the most recent archive.",
			}),
		);
	});

	it("posts error when SDK throws", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetArchives.mockRejectedValue(new Error("Network timeout"));
		mockClientManager.getClient.mockReturnValue({ getArchives: mockGetArchives });

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as any,
			mockClientManager as any,
			mockExtensionUri,
		);

		expect(mockPostMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "error",
				message: "Network timeout",
			}),
		);
	});

	it("reveals existing panel instead of creating a new one", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetArchives.mockResolvedValue([makeArchive()]);
		mockClientManager.getClient.mockReturnValue({ getArchives: mockGetArchives });

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as any,
			mockClientManager as any,
			mockExtensionUri,
		);
		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as any,
			mockClientManager as any,
			mockExtensionUri,
		);

		// Only one panel created
		expect(mockCreateWebviewPanel).toHaveBeenCalledTimes(1);
		expect(mockPanel.reveal).toHaveBeenCalledTimes(1);
	});

	it("sets webview HTML with Chart.js script", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetArchives.mockResolvedValue([makeArchive()]);
		mockClientManager.getClient.mockReturnValue({ getArchives: mockGetArchives });

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as any,
			mockClientManager as any,
			mockExtensionUri,
		);

		expect(mockWebview.html).toContain("chart.js");
		expect(mockWebview.html).toContain("chart.umd.min.js");
		expect(mockWebview.html).toContain("Content-Security-Policy");
		expect(mockWebview.html).toContain("cdn.jsdelivr.net");
	});

	it("includes alarm thresholds in chart payload", async () => {
		const ch = makeArchiveChannel({
			alarmHigh: {
				enabled: true,
				alarming: false,
				muted: false,
				value: 275,
				units: "F",
				lastNotified: null,
			},
			alarmLow: {
				enabled: true,
				alarming: false,
				muted: false,
				value: 200,
				units: "F",
				lastNotified: null,
			},
		});
		const archive = makeArchive({ channels: [ch] });
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetArchives.mockResolvedValue([archive]);
		mockClientManager.getClient.mockReturnValue({ getArchives: mockGetArchives });

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as any,
			mockClientManager as any,
			mockExtensionUri,
		);

		expect(mockPostMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "chart-data",
				payload: expect.objectContaining({
					alarms: { high: 275, low: 200 },
				}),
			}),
		);
	});
});
