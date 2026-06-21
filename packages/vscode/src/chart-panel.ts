import { randomBytes } from "node:crypto";
import type { Archive, ArchiveChannel, DeviceHistory } from "thermoworks-sdk";
import * as vscode from "vscode";
import type { ChartInbound, ChartPayload, ChartSeries, ChartThresholds } from "./chart-protocol";
import type { ClientManager } from "./client-manager";
import type { CredentialStore } from "./credentials";

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

/**
 * Manages a VS Code WebviewPanel displaying a temperature history chart rendered with
 * a bundled React + recharts app. Only one panel exists per device serial at a time.
 */
export class ChartPanel {
	private static panels = new Map<string, ChartPanel>();

	private readonly panel: vscode.WebviewPanel;
	private readonly serial: string;
	private disposed = false;
	private webviewReady = false;
	private pending: ChartInbound[] = [];

	private constructor(panel: vscode.WebviewPanel, serial: string) {
		this.panel = panel;
		this.serial = serial;

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
			ChartPanel.panels.delete(this.serial);
		});
	}

	/**
	 * Show a temperature chart for a device.
	 * Reuses an existing panel if one is already open for that serial.
	 */
	static async show(
		serial: string,
		credentialStore: CredentialStore,
		clientManager: ClientManager,
		extensionUri: vscode.Uri,
		channelNumber?: string,
	): Promise<void> {
		const existing = ChartPanel.panels.get(serial);
		if (existing && !existing.disposed) {
			existing.panel.reveal(PANEL_COLUMN);
			await existing.loadData(credentialStore, clientManager, channelNumber);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			"thermoworksChart",
			`Temperature - ${serial}`,
			PANEL_COLUMN,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri],
			},
		);

		const instance = new ChartPanel(panel, serial);
		ChartPanel.panels.set(serial, instance);

		panel.webview.html = getWebviewHtml(panel.webview, extensionUri);
		await instance.loadData(credentialStore, clientManager, channelNumber);
	}

	private async loadData(
		credentialStore: CredentialStore,
		clientManager: ClientManager,
		channelNumber?: string,
	): Promise<void> {
		try {
			const creds = await credentialStore.getCredentials();
			if (!creds) {
				this.post({ type: "error", message: "Not signed in. Please sign in first." });
				return;
			}

			const client = clientManager.getClient(creds);
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
			const payload = buildChartPayload(deviceLabel, history, archive ?? null, channelNumber);

			if (payload.series.length === 0 || payload.series.every((s) => s.points.length === 0)) {
				this.post({ type: "error", message: "No temperature readings found for this device." });
				return;
			}

			this.post({ type: "chart-data", payload });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to load chart data";
			this.post({ type: "error", message });
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
