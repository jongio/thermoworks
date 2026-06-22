import { randomBytes } from "node:crypto";
import type {
	Archive,
	ArchiveChannel,
	ChannelUpdate,
	DeviceHistory,
	Subscription,
	ThermoworksCloud,
} from "thermoworks-sdk";
import * as vscode from "vscode";
import type {
	ChartInbound,
	ChartPayload,
	ChartPoint,
	ChartSeries,
	ChartThresholds,
} from "./chart-protocol";
import type { ClientManager } from "./client-manager";
import type { CredentialStore } from "./credentials";
import { getDemoChartPayload, getDemoLiveSeriesId, isDemoSerial } from "./demo-data";

/** Fallback line color when the API doesn't provide one. */
export const FALLBACK_COLOR = "#4fc3f7";

function isUsableColor(color: string | null | undefined): color is string {
	return !!color && color !== "none" && color !== "transparent";
}

/**
 * Pick alarm thresholds plus a representative color/units from an archive.
 * Prefers the requested channel, then the first channel with an enabled alarm,
 * then the first channel.
 */
export function pickThresholds(
	archive: Archive | null,
	channelNumber?: string,
): { thresholds: ChartThresholds; color: string; units: string } {
	const channels = archive?.channels ?? [];
	const match = channelNumber ? channels.find((c) => c.number === channelNumber) : undefined;
	const withAlarm = channels.find((c) => c.alarmHigh?.enabled || c.alarmLow?.enabled);
	const ch = match ?? withAlarm ?? channels[0];

	const thresholds: ChartThresholds = {
		high: ch?.alarmHigh?.enabled ? (ch.alarmHigh.value ?? null) : null,
		low: ch?.alarmLow?.enabled ? (ch.alarmLow.value ?? null) : null,
	};
	return {
		thresholds,
		color: isUsableColor(ch?.color) ? ch.color : FALLBACK_COLOR,
		units: ch?.units ?? "F",
	};
}

/** Convert full-session BigQuery history into a single chart series. */
export function historyToSeries(
	history: DeviceHistory,
	color: string,
	fallbackUnits: string,
): ChartSeries | null {
	const points = history.readings
		.map((r) => ({ t: Date.parse(r.timestamp), y: r.value }))
		.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.y))
		.sort((a, b) => a.t - b.t);

	if (points.length === 0) return null;

	const units = history.readings.find((r) => r.units)?.units ?? fallbackUnits;
	return { id: "history", label: "Session history", color, units, points };
}

/** Convert an archive's per-channel recent readings into chart series (fallback view). */
export function archiveToSeries(archive: Archive, channelNumber?: string): ChartSeries[] {
	const channels = archive.channels ?? [];
	const filtered = channelNumber
		? channels.filter((c) => c.number === channelNumber)
		: channels.filter((c) => c.recentReadings.length > 0);

	return filtered
		.map((ch: ArchiveChannel, i: number): ChartSeries => {
			const points = [...ch.recentReadings]
				.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
				.map((r) => ({ t: r.timestamp.getTime(), y: r.value }));
			return {
				id: `ch${ch.number ?? i}`,
				label: ch.label ?? `Ch ${ch.number ?? i}`,
				color: isUsableColor(ch.color) ? ch.color : FALLBACK_COLOR,
				units: ch.units ?? "F",
				points,
			};
		})
		.filter((s) => s.points.length > 0);
}

/**
 * Build the chart payload, preferring full-session history (BigQuery) and falling back to
 * the most recent archive's per-channel snapshot when history is unavailable.
 * Exported for unit testing.
 */
export function buildChartPayload(
	deviceLabel: string,
	history: DeviceHistory | null,
	archive: Archive | null,
	channelNumber?: string,
): ChartPayload {
	const { thresholds, color, units } = pickThresholds(archive, channelNumber);

	const historySeries = history ? historyToSeries(history, color, units) : null;
	if (historySeries) {
		return {
			deviceLabel,
			units: historySeries.units,
			source: "history",
			series: [historySeries],
			thresholds,
		};
	}

	const series = archive ? archiveToSeries(archive, channelNumber) : [];
	return {
		deviceLabel,
		units: series[0]?.units ?? units,
		source: "archive",
		series,
		thresholds,
	};
}

const PANEL_COLUMN = vscode.ViewColumn.Beside;

/** Options for {@link ChartPanel.show}. */
export interface ChartOptions {
	/** Restrict the chart to a single channel number. */
	channelNumber?: string;
	/** Chart a specific past session (archive) instead of the current session. */
	archiveId?: string;
	/** Label used for the past-session panel title. */
	archiveLabel?: string;
}

/**
 * Manages a VS Code WebviewPanel displaying a temperature chart rendered with a bundled
 * React + recharts app. One panel exists per target (a device's current session, or a
 * specific past session).
 */
export class ChartPanel {
	private static panels = new Map<string, ChartPanel>();

	private readonly panel: vscode.WebviewPanel;
	private readonly serial: string;
	private readonly panelKey: string;
	private disposed = false;
	private webviewReady = false;
	private pending: ChartInbound[] = [];
	private subscription: Subscription | undefined;
	private demoTimer: ReturnType<typeof setInterval> | undefined;
	private liveSource: "history" | "archive" = "history";
	private liveSeriesIds = new Set<string>();
	private liveChannel: number | null = null;

	private constructor(panel: vscode.WebviewPanel, serial: string, panelKey: string) {
		this.panel = panel;
		this.serial = serial;
		this.panelKey = panelKey;

		this.panel.webview.onDidReceiveMessage((message: { type?: string }) => {
			if (message?.type === "ready") {
				this.webviewReady = true;
				for (const msg of this.pending) {
					this.panel.webview.postMessage(msg);
				}
				this.pending = [];
			}
		});

		this.panel.onDidDispose(() => {
			this.disposed = true;
			this.stopLiveTail();
			ChartPanel.panels.delete(this.panelKey);
		});
	}

	/**
	 * Show a temperature chart for a device's current session, or for a specific past
	 * session when `opts.archiveId` is set. Reuses an existing panel for the same target.
	 */
	static async show(
		serial: string,
		credentialStore: CredentialStore,
		clientManager: ClientManager,
		extensionUri: vscode.Uri,
		opts: ChartOptions = {},
	): Promise<void> {
		const panelKey = opts.archiveId ? `${serial}::${opts.archiveId}` : serial;
		const existing = ChartPanel.panels.get(panelKey);
		if (existing && !existing.disposed) {
			existing.panel.reveal(PANEL_COLUMN);
			await existing.loadData(credentialStore, clientManager, opts);
			return;
		}

		const title = opts.archiveLabel ? `Session: ${opts.archiveLabel}` : `Temperature - ${serial}`;
		const panel = vscode.window.createWebviewPanel("thermoworksChart", title, PANEL_COLUMN, {
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [extensionUri],
		});

		const instance = new ChartPanel(panel, serial, panelKey);
		ChartPanel.panels.set(panelKey, instance);

		panel.webview.html = getWebviewHtml(panel.webview, extensionUri);
		await instance.loadData(credentialStore, clientManager, opts);
	}

	private async loadData(
		credentialStore: CredentialStore,
		clientManager: ClientManager,
		opts: ChartOptions,
	): Promise<void> {
		try {
			if (isDemoSerial(this.serial)) {
				this.loadDemoData(opts.archiveId != null);
				return;
			}

			const creds = await credentialStore.getCredentials();
			if (!creds) {
				this.post({ type: "error", message: "Not signed in. Please sign in first." });
				return;
			}

			const client = clientManager.getClient(creds);

			if (opts.archiveId) {
				await this.loadArchive(client, opts.archiveId, opts.channelNumber);
				return;
			}

			const [historyResult, archivesResult] = await Promise.allSettled([
				client.getHistory(this.serial),
				client.getArchives(this.serial, { limit: 1 }),
			]);

			const history =
				historyResult.status === "fulfilled" && historyResult.value.readings.length > 0
					? historyResult.value
					: null;
			const archive =
				archivesResult.status === "fulfilled" && archivesResult.value.length > 0
					? archivesResult.value[0]
					: null;

			if (!history && !archive) {
				this.post({ type: "error", message: "No temperature history available for this device." });
				return;
			}

			const deviceLabel = archive?.deviceLabel ?? archive?.label ?? this.serial;
			const payload = buildChartPayload(deviceLabel, history, archive ?? null, opts.channelNumber);

			if (payload.series.length === 0 || payload.series.every((s) => s.points.length === 0)) {
				this.post({ type: "error", message: "No temperature readings found for this device." });
				return;
			}

			this.post({ type: "chart-data", payload });
			this.startLiveTail(client, payload, opts.channelNumber);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to load chart data";
			this.post({ type: "error", message });
		}
	}

	/** Load and render a specific past session (archive). Past sessions are static — no live tail. */
	private async loadArchive(
		client: ThermoworksCloud,
		archiveId: string,
		channelNumber?: string,
	): Promise<void> {
		const archive = await client.getArchive(this.serial, archiveId);
		const deviceLabel = archive.deviceLabel ?? archive.label ?? this.serial;
		const payload = buildChartPayload(deviceLabel, null, archive, channelNumber);

		if (payload.series.length === 0 || payload.series.every((s) => s.points.length === 0)) {
			this.post({ type: "error", message: "No readings recorded for this session." });
			return;
		}

		this.post({ type: "chart-data", payload });
	}

	/** Render a synthetic chart for a demo device; the current session also animates a live tail. */
	private loadDemoData(isArchive: boolean): void {
		const payload = getDemoChartPayload(this.serial);
		if (!payload) {
			this.post({ type: "error", message: "No demo data for this device." });
			return;
		}
		this.post({ type: "chart-data", payload });
		if (!isArchive) {
			this.startDemoLiveTail(payload);
		}
	}

	/** Simulate a live tail in demo mode by drifting the primary channel over time. */
	private startDemoLiveTail(payload: ChartPayload): void {
		this.stopLiveTail();
		const seriesId = getDemoLiveSeriesId(this.serial);
		if (!seriesId) return;
		const series = payload.series.find((s) => s.id === seriesId);
		let value = series?.points.at(-1)?.y ?? 200;

		this.post({ type: "live-status", streaming: true });
		this.demoTimer = setInterval(() => {
			value = Math.round((value + (Math.random() - 0.4) * 2) * 10) / 10;
			this.post({ type: "live-point", seriesId, point: { t: Date.now(), y: value } });
		}, 2_000);
	}

	/**
	 * Subscribe to live channel updates and stream them to the webview as the cook
	 * continues. Updates are mapped onto the appropriate series for the active view.
	 */
	private startLiveTail(
		client: ThermoworksCloud,
		payload: ChartPayload,
		channelNumber?: string,
	): void {
		this.stopLiveTail();
		this.liveSource = payload.source;
		this.liveSeriesIds = new Set(payload.series.map((s) => s.id));
		const parsed = channelNumber ? Number.parseInt(channelNumber, 10) : Number.NaN;
		this.liveChannel = Number.isNaN(parsed) ? null : parsed;

		try {
			this.subscription = client.subscribe(this.serial, (update) => this.onLiveUpdate(update), {
				intervalMs: getLiveIntervalMs(),
				onError: () => this.post({ type: "live-status", streaming: false }),
			});
			this.post({ type: "live-status", streaming: true });
		} catch {
			// Streaming is best-effort; the static chart still renders if it can't start.
			this.post({ type: "live-status", streaming: false });
		}
	}

	/** Map a live channel update onto the correct series and push it to the webview. */
	private onLiveUpdate(update: ChannelUpdate): void {
		if (update.value == null) return;
		const parsedTime = update.timestamp ? Date.parse(update.timestamp) : Number.NaN;
		const point: ChartPoint = {
			t: Number.isNaN(parsedTime) ? Date.now() : parsedTime,
			y: update.value,
		};

		if (this.liveSource === "history") {
			// The combined history line tracks a single channel; lock onto the first seen.
			if (this.liveChannel == null) this.liveChannel = update.channel;
			if (update.channel !== this.liveChannel) return;
			this.post({ type: "live-point", seriesId: "history", point });
			return;
		}

		const seriesId = `ch${update.channel}`;
		if (this.liveSeriesIds.has(seriesId)) {
			this.post({ type: "live-point", seriesId, point });
		}
	}

	/** Stop the live subscription and any demo animation. */
	private stopLiveTail(): void {
		if (this.subscription) {
			this.subscription.unsubscribe();
			this.subscription = undefined;
		}
		if (this.demoTimer) {
			clearInterval(this.demoTimer);
			this.demoTimer = undefined;
		}
	}

	/** Send a message to the webview, queueing until it signals readiness. */
	private post(message: ChartInbound): void {
		if (this.webviewReady) {
			this.panel.webview.postMessage(message);
		} else {
			this.pending.push(message);
		}
	}

	/** Clear all tracked panels (for testing). */
	static reset(): void {
		ChartPanel.panels.clear();
	}
}

/** Build the webview HTML that loads the bundled React/recharts app under a strict CSP. */
function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	const nonce = getNonce();
	const scriptUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, "dist", "webview", "webview.js"),
	);
	const styleUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, "dist", "webview", "webview.css"),
	);
	const csp = [
		"default-src 'none'",
		`img-src ${webview.cspSource} data:`,
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`font-src ${webview.cspSource}`,
		`script-src 'nonce-${nonce}'`,
	].join("; ");

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="${csp}">
	<link rel="stylesheet" href="${styleUri}">
	<title>Temperature Chart</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
	return randomBytes(24).toString("base64url");
}

/** Live polling interval (ms) derived from the refresh-interval setting. */
function getLiveIntervalMs(): number {
	const seconds = vscode.workspace
		.getConfiguration("thermoworks")
		.get<number>("refreshInterval", 60);
	return Math.max(seconds, 15) * 1000;
}
