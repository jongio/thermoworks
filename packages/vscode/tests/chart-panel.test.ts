import type { Archive, ArchiveChannel, DeviceHistory, TemperatureReading } from "thermoworks-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── VS Code mock ────────────────────────────────────────────────────────────

const { mockCreateWebviewPanel, mockPostMessage } = vi.hoisted(() => ({
	mockCreateWebviewPanel: vi.fn(),
	mockPostMessage: vi.fn(),
}));

vi.mock("vscode", () => ({
	ViewColumn: { Beside: 2 },
	Uri: {
		parse: vi.fn((s: string) => ({ toString: () => s })),
		joinPath: vi.fn((_base: unknown, ...parts: string[]) => ({
			toString: () => parts.join("/"),
		})),
	},
	window: {
		createWebviewPanel: mockCreateWebviewPanel,
	},
	workspace: {
		getConfiguration: vi.fn(() => ({ get: (_key: string, fallback: number) => fallback })),
	},
}));

// ─── SDK mock ────────────────────────────────────────────────────────────────

const { mockGetArchives, mockGetHistory, mockSubscribe, mockUnsubscribe } = vi.hoisted(() => {
	const unsub = vi.fn();
	return {
		mockGetArchives: vi.fn(),
		mockGetHistory: vi.fn(),
		mockUnsubscribe: unsub,
		mockSubscribe: vi.fn(() => ({ unsubscribe: unsub })),
	};
});

vi.mock("thermoworks-sdk", () => ({
	ThermoworksCloud: class {
		getArchives = mockGetArchives;
		getHistory = mockGetHistory;
		subscribe = mockSubscribe;
		close = vi.fn();
	},
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import {
	archiveToSeries,
	buildChartPayload,
	ChartPanel,
	FALLBACK_COLOR,
	historyToSeries,
	pickThresholds,
} from "../src/chart-panel";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeReading(value: number, minutesAgo: number): TemperatureReading {
	return { value, timestamp: new Date(Date.now() - minutesAgo * 60_000), units: "F" };
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

function makeHistory(overrides: Partial<DeviceHistory> = {}): DeviceHistory {
	return {
		deviceId: "SERIAL-1",
		readings: [
			{ value: 200, timestamp: new Date(Date.now() - 30 * 60_000).toISOString(), units: "F" },
			{ value: 215, timestamp: new Date(Date.now() - 20 * 60_000).toISOString(), units: "F" },
			{ value: 225, timestamp: new Date(Date.now() - 10 * 60_000).toISOString(), units: "F" },
		],
		...overrides,
	};
}

// ─── Tests: pickThresholds ───────────────────────────────────────────────────

describe("pickThresholds", () => {
	it("extracts enabled high/low thresholds", () => {
		const { thresholds } = pickThresholds(makeArchive());
		expect(thresholds).toEqual({ high: 275, low: 200 });
	});

	it("returns null thresholds when alarms are disabled", () => {
		const ch = makeArchiveChannel({
			alarmHigh: {
				enabled: false,
				alarming: false,
				muted: false,
				value: 275,
				units: "F",
				lastNotified: null,
			},
			alarmLow: {
				enabled: false,
				alarming: false,
				muted: false,
				value: 200,
				units: "F",
				lastNotified: null,
			},
		});
		const { thresholds } = pickThresholds(makeArchive({ channels: [ch] }));
		expect(thresholds).toEqual({ high: null, low: null });
	});

	it("prefers the requested channel", () => {
		const ch1 = makeArchiveChannel({ number: "1", color: "#111111" });
		const ch2 = makeArchiveChannel({ number: "2", color: "#222222" });
		const { color } = pickThresholds(makeArchive({ channels: [ch1, ch2] }), "2");
		expect(color).toBe("#222222");
	});

	it("falls back to a default color for a null archive", () => {
		const { color, thresholds } = pickThresholds(null);
		expect(color).toBe(FALLBACK_COLOR);
		expect(thresholds).toEqual({ high: null, low: null });
	});
});

// ─── Tests: historyToSeries ──────────────────────────────────────────────────

describe("historyToSeries", () => {
	it("converts readings to a single sorted series", () => {
		const series = historyToSeries(makeHistory(), "#abc", "F");
		expect(series).not.toBeNull();
		expect(series?.id).toBe("history");
		expect(series?.points).toHaveLength(3);
		expect(series?.points[0]?.y).toBe(200);
		expect(series?.points[2]?.y).toBe(225);
	});

	it("returns null when there are no valid readings", () => {
		expect(historyToSeries(makeHistory({ readings: [] }), "#abc", "F")).toBeNull();
	});

	it("drops readings with unparseable timestamps", () => {
		const history = makeHistory({
			readings: [
				{ value: 100, timestamp: "not-a-date", units: "F" },
				{ value: 110, timestamp: new Date().toISOString(), units: "F" },
			],
		});
		expect(historyToSeries(history, "#abc", "F")?.points).toHaveLength(1);
	});
});

// ─── Tests: archiveToSeries ──────────────────────────────────────────────────

describe("archiveToSeries", () => {
	it("returns a series per channel with readings", () => {
		const ch1 = makeArchiveChannel({ number: "1", label: "Pit", color: "#FF0000" });
		const ch2 = makeArchiveChannel({ number: "2", label: "Meat", color: "#00FF00" });
		const series = archiveToSeries(makeArchive({ channels: [ch1, ch2] }));
		expect(series).toHaveLength(2);
		expect(series[0]?.label).toBe("Pit");
		expect(series[1]?.label).toBe("Meat");
	});

	it("filters to a specific channel when requested", () => {
		const ch1 = makeArchiveChannel({ number: "1", label: "Pit" });
		const ch2 = makeArchiveChannel({ number: "2", label: "Meat" });
		const series = archiveToSeries(makeArchive({ channels: [ch1, ch2] }), "2");
		expect(series).toHaveLength(1);
		expect(series[0]?.label).toBe("Meat");
	});

	it("excludes channels without readings", () => {
		const ch1 = makeArchiveChannel({ number: "1", recentReadings: [] });
		const ch2 = makeArchiveChannel({ number: "2", label: "Active" });
		const series = archiveToSeries(makeArchive({ channels: [ch1, ch2] }));
		expect(series).toHaveLength(1);
		expect(series[0]?.label).toBe("Active");
	});

	it("uses fallback label/color/units when null", () => {
		const ch = makeArchiveChannel({ number: "3", label: null, color: null, units: null });
		const series = archiveToSeries(makeArchive({ channels: [ch] }));
		expect(series[0]?.label).toBe("Ch 3");
		expect(series[0]?.color).toBe(FALLBACK_COLOR);
		expect(series[0]?.units).toBe("F");
	});

	it("handles a null channels array", () => {
		expect(archiveToSeries(makeArchive({ channels: null }))).toHaveLength(0);
	});
});

// ─── Tests: buildChartPayload ────────────────────────────────────────────────

describe("buildChartPayload", () => {
	it("prefers full-session history when available", () => {
		const payload = buildChartPayload("Smoker", makeHistory(), makeArchive());
		expect(payload.source).toBe("history");
		expect(payload.series).toHaveLength(1);
		expect(payload.series[0]?.id).toBe("history");
		expect(payload.thresholds).toEqual({ high: 275, low: 200 });
	});

	it("falls back to archive channels when history is null", () => {
		const payload = buildChartPayload("Smoker", null, makeArchive());
		expect(payload.source).toBe("archive");
		expect(payload.series[0]?.label).toBe("Pit");
	});

	it("returns an empty archive series when both inputs are empty", () => {
		const payload = buildChartPayload("Smoker", null, makeArchive({ channels: [] }));
		expect(payload.source).toBe("archive");
		expect(payload.series).toHaveLength(0);
	});
});

// ─── Tests: ChartPanel.show ──────────────────────────────────────────────────

describe("ChartPanel.show", () => {
	let messageHandler: ((msg: { type?: string }) => void) | undefined;
	let disposeHandler: (() => void) | undefined;

	const mockWebview = {
		html: "",
		postMessage: mockPostMessage,
		cspSource: "https://test.vscode-cdn.net",
		asWebviewUri: (uri: { toString(): string }) => ({
			toString: () => `webview:${uri.toString()}`,
		}),
		onDidReceiveMessage: (cb: (msg: { type?: string }) => void) => {
			messageHandler = cb;
			return { dispose: vi.fn() };
		},
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

	const mockExtensionUri = { toString: () => "file:///ext" } as never;

	/** Simulate the webview signalling it is ready so queued messages flush. */
	function signalReady(): void {
		messageHandler?.({ type: "ready" });
	}

	beforeEach(() => {
		vi.clearAllMocks();
		messageHandler = undefined;
		disposeHandler = undefined;
		mockWebview.html = "";
		ChartPanel.reset();
		mockCreateWebviewPanel.mockReturnValue(mockPanel);
		mockPanel.onDidDispose.mockImplementation((cb: () => void) => {
			disposeHandler = cb;
		});
		mockClientManager.getClient.mockReturnValue({
			getArchives: mockGetArchives,
			getHistory: mockGetHistory,
			subscribe: mockSubscribe,
		});
	});

	it("creates a webview panel with the correct config", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetHistory.mockResolvedValue(makeHistory());
		mockGetArchives.mockResolvedValue([makeArchive()]);

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as never,
			mockClientManager as never,
			mockExtensionUri,
		);

		expect(mockCreateWebviewPanel).toHaveBeenCalledWith(
			"thermoworksChart",
			"Temperature - SERIAL-1",
			2,
			expect.objectContaining({ enableScripts: true, retainContextWhenHidden: true }),
		);
	});

	it("posts full-session history chart data once the webview is ready", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetHistory.mockResolvedValue(makeHistory());
		mockGetArchives.mockResolvedValue([makeArchive()]);

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as never,
			mockClientManager as never,
			mockExtensionUri,
		);

		// Nothing posted until the webview signals readiness (handshake).
		expect(mockPostMessage).not.toHaveBeenCalled();
		signalReady();

		expect(mockPostMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "chart-data",
				payload: expect.objectContaining({
					deviceLabel: "Backyard Smoker",
					source: "history",
					thresholds: { high: 275, low: 200 },
				}),
			}),
		);
	});

	it("falls back to archive data when history is empty", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetHistory.mockResolvedValue(makeHistory({ readings: [] }));
		mockGetArchives.mockResolvedValue([makeArchive()]);

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as never,
			mockClientManager as never,
			mockExtensionUri,
		);
		signalReady();

		expect(mockPostMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "chart-data",
				payload: expect.objectContaining({ source: "archive" }),
			}),
		);
	});

	it("posts an error when not signed in", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue(null);

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as never,
			mockClientManager as never,
			mockExtensionUri,
		);
		signalReady();

		expect(mockPostMessage).toHaveBeenCalledWith(
			expect.objectContaining({ type: "error", message: "Not signed in. Please sign in first." }),
		);
	});

	it("posts an error when no history or archives exist", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetHistory.mockResolvedValue(makeHistory({ readings: [] }));
		mockGetArchives.mockResolvedValue([]);

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as never,
			mockClientManager as never,
			mockExtensionUri,
		);
		signalReady();

		expect(mockPostMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "error",
				message: "No temperature history available for this device.",
			}),
		);
	});

	it("posts an error when the SDK throws", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetHistory.mockRejectedValue(new Error("Network timeout"));
		mockGetArchives.mockRejectedValue(new Error("Network timeout"));

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as never,
			mockClientManager as never,
			mockExtensionUri,
		);
		signalReady();

		expect(mockPostMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "error",
				message: "No temperature history available for this device.",
			}),
		);
	});

	it("reveals an existing panel instead of creating a new one", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetHistory.mockResolvedValue(makeHistory());
		mockGetArchives.mockResolvedValue([makeArchive()]);

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as never,
			mockClientManager as never,
			mockExtensionUri,
		);
		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as never,
			mockClientManager as never,
			mockExtensionUri,
		);

		expect(mockCreateWebviewPanel).toHaveBeenCalledTimes(1);
		expect(mockPanel.reveal).toHaveBeenCalledTimes(1);
	});

	it("loads the bundled webview app under a strict CSP and no CDN", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetHistory.mockResolvedValue(makeHistory());
		mockGetArchives.mockResolvedValue([makeArchive()]);

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as never,
			mockClientManager as never,
			mockExtensionUri,
		);

		expect(mockWebview.html).toContain("webview.js");
		expect(mockWebview.html).toContain("webview.css");
		expect(mockWebview.html).toContain("Content-Security-Policy");
		expect(mockWebview.html).not.toContain("cdn.jsdelivr.net");
		expect(mockWebview.html).not.toContain("chart.js");
	});

	it("starts a live subscription and signals streaming after loading", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetHistory.mockResolvedValue(makeHistory());
		mockGetArchives.mockResolvedValue([makeArchive()]);

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as never,
			mockClientManager as never,
			mockExtensionUri,
		);
		signalReady();

		expect(mockSubscribe).toHaveBeenCalledWith(
			"SERIAL-1",
			expect.any(Function),
			expect.objectContaining({ intervalMs: expect.any(Number) }),
		);
		expect(mockPostMessage).toHaveBeenCalledWith({ type: "live-status", streaming: true });
	});

	it("streams live points onto the history series", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetHistory.mockResolvedValue(makeHistory());
		mockGetArchives.mockResolvedValue([makeArchive()]);

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as never,
			mockClientManager as never,
			mockExtensionUri,
		);
		signalReady();

		const onUpdate = mockSubscribe.mock.calls[0]?.[1] as (u: unknown) => void;
		onUpdate({
			serial: "SERIAL-1",
			channel: 1,
			value: 230,
			units: "F",
			status: "normal",
			timestamp: new Date().toISOString(),
		});

		expect(mockPostMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "live-point",
				seriesId: "history",
				point: expect.objectContaining({ y: 230 }),
			}),
		);
	});

	it("does not subscribe when not signed in", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue(null);

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as never,
			mockClientManager as never,
			mockExtensionUri,
		);
		signalReady();

		expect(mockSubscribe).not.toHaveBeenCalled();
	});

	it("unsubscribes when the panel is disposed", async () => {
		mockCredentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "pass" });
		mockGetHistory.mockResolvedValue(makeHistory());
		mockGetArchives.mockResolvedValue([makeArchive()]);

		await ChartPanel.show(
			"SERIAL-1",
			mockCredentialStore as never,
			mockClientManager as never,
			mockExtensionUri,
		);
		signalReady();
		disposeHandler?.();

		expect(mockUnsubscribe).toHaveBeenCalled();
	});
});
