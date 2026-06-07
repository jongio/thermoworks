import type { Archive, TemperatureReading } from "thermoworks-sdk";
import * as vscode from "vscode";
import type { ClientManager } from "./client-manager";
import type { CredentialStore } from "./credentials";

/** Data point sent to the webview for chart rendering. */
export interface ChartDataPoint {
	timestamp: string;
	value: number;
}

/** Series configuration sent to the webview. */
export interface ChartSeries {
	label: string;
	color: string;
	data: ChartDataPoint[];
	units: string;
}

/** Alarm thresholds sent to the webview for reference lines. */
export interface ChartAlarms {
	high: number | null;
	low: number | null;
}

/** Full payload posted to the webview. */
export interface ChartPayload {
	deviceLabel: string;
	series: ChartSeries[];
	alarms: ChartAlarms;
}

/**
 * Format archive channel data into chart-ready series.
 * Exported for unit testing.
 */
export function formatChartData(
	archive: Archive,
	channelNumber?: string,
): { series: ChartSeries[]; alarms: ChartAlarms } {
	const channels = archive.channels ?? [];
	const filtered = channelNumber
		? channels.filter((ch) => ch.number === channelNumber)
		: channels.filter((ch) => ch.recentReadings.length > 0);

	const series: ChartSeries[] = filtered.map((ch) => ({
		label: ch.label ?? `Ch ${ch.number ?? "?"}`,
		color: ch.color ?? "#4fc3f7",
		units: ch.units ?? "F",
		data: formatReadings(ch.recentReadings),
	}));

	// Alarm thresholds from the first matching channel (or first with alarms)
	const alarmSource = filtered[0];
	const alarms: ChartAlarms = {
		high: alarmSource?.alarmHigh?.enabled ? (alarmSource.alarmHigh.value ?? null) : null,
		low: alarmSource?.alarmLow?.enabled ? (alarmSource.alarmLow.value ?? null) : null,
	};

	return { series, alarms };
}

/**
 * Convert TemperatureReading[] to ChartDataPoint[] sorted by time.
 * Exported for unit testing.
 */
export function formatReadings(readings: TemperatureReading[]): ChartDataPoint[] {
	return [...readings]
		.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
		.map((r) => ({
			timestamp: r.timestamp.toISOString(),
			value: r.value,
		}));
}

const PANEL_COLUMN = vscode.ViewColumn.Beside;

/**
 * Manages a VS Code WebviewPanel displaying a temperature history chart.
 * Only one panel exists per device serial at a time.
 */
export class ChartPanel {
	private static panels = new Map<string, ChartPanel>();

	private readonly panel: vscode.WebviewPanel;
	private readonly serial: string;
	private disposed = false;

	private constructor(panel: vscode.WebviewPanel, serial: string) {
		this.panel = panel;
		this.serial = serial;

		this.panel.onDidDispose(() => {
			this.disposed = true;
			ChartPanel.panels.delete(this.serial);
		});
	}

	/**
	 * Show a temperature chart for a device.
	 * Reuses existing panel if already open for that serial.
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

		panel.webview.html = getWebviewHtml(panel.webview);
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
				this.postError("Not signed in. Please sign in first.");
				return;
			}

			const client = clientManager.getClient(creds);
			const archives = await client.getArchives(this.serial, { limit: 1 });

			if (archives.length === 0) {
				this.postError("No archived data available for this device.");
				return;
			}

			const archive = archives[0];
			const { series, alarms } = formatChartData(archive, channelNumber);

			if (series.length === 0 || series.every((s) => s.data.length === 0)) {
				this.postError("No temperature readings found in the most recent archive.");
				return;
			}

			const payload: ChartPayload = {
				deviceLabel: archive.deviceLabel ?? archive.label ?? this.serial,
				series,
				alarms,
			};

			this.panel.webview.postMessage({ type: "chart-data", payload });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to load chart data";
			this.postError(message);
		}
	}

	private postError(message: string): void {
		this.panel.webview.postMessage({ type: "error", message });
	}

	/** Clear all tracked panels (for testing). */
	static reset(): void {
		ChartPanel.panels.clear();
	}
}

/**
 * Generate the webview HTML with Chart.js loaded via CSP-safe nonce.
 */
function getWebviewHtml(webview: vscode.Webview): string {
	const nonce = getNonce();
	const cspSource = webview.cspSource;

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; style-src 'nonce-${nonce}' ${cspSource}; font-src ${cspSource};">
	<title>Temperature Chart</title>
	<style nonce="${nonce}">
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
			background: var(--vscode-editor-background, #1e1e1e);
			color: var(--vscode-editor-foreground, #d4d4d4);
			padding: 16px;
			height: 100vh;
			display: flex;
			flex-direction: column;
		}
		h1 {
			font-size: 14px;
			font-weight: 600;
			margin-bottom: 12px;
			color: var(--vscode-foreground, #cccccc);
		}
		.chart-container {
			flex: 1;
			position: relative;
			min-height: 300px;
		}
		.message {
			display: flex;
			align-items: center;
			justify-content: center;
			height: 100%;
			font-size: 13px;
			color: var(--vscode-descriptionForeground, #999);
		}
		.error {
			color: var(--vscode-errorForeground, #f48771);
		}
		.loading {
			color: var(--vscode-descriptionForeground, #999);
		}
	</style>
</head>
<body>
	<h1 id="title">Loading temperature data...</h1>
	<div class="chart-container">
		<canvas id="chart"></canvas>
		<div id="message" class="message loading">Loading...</div>
	</div>

	<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
	<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3/dist/chartjs-adapter-date-fns.bundle.min.js"></script>
	<script nonce="${nonce}">
		(function() {
			const vscode = acquireVsCodeApi();
			const canvas = document.getElementById('chart');
			const messageEl = document.getElementById('message');
			const titleEl = document.getElementById('title');
			let chartInstance = null;

			function showMessage(text, isError) {
				canvas.style.display = 'none';
				messageEl.style.display = 'flex';
				messageEl.className = 'message ' + (isError ? 'error' : 'loading');
				messageEl.textContent = text;
			}

			function renderChart(payload) {
				messageEl.style.display = 'none';
				canvas.style.display = 'block';
				titleEl.textContent = payload.deviceLabel;

				const datasets = payload.series.map(function(s) {
					return {
						label: s.label + ' (\u00B0' + s.units + ')',
						data: s.data.map(function(d) {
							return { x: new Date(d.timestamp), y: d.value };
						}),
						borderColor: s.color,
						backgroundColor: s.color + '33',
						borderWidth: 2,
						pointRadius: 1.5,
						pointHoverRadius: 4,
						tension: 0.3,
						fill: false,
					};
				});

				// Add alarm threshold lines
				if (payload.alarms.high != null && datasets.length > 0) {
					var first = datasets[0].data;
					datasets.push({
						label: 'High Alarm',
						data: first.length > 0
							? [{ x: first[0].x, y: payload.alarms.high }, { x: first[first.length - 1].x, y: payload.alarms.high }]
							: [],
						borderColor: '#ff5252',
						borderWidth: 1.5,
						borderDash: [6, 3],
						pointRadius: 0,
						fill: false,
					});
				}
				if (payload.alarms.low != null && datasets.length > 0) {
					var first = datasets[0].data;
					datasets.push({
						label: 'Low Alarm',
						data: first.length > 0
							? [{ x: first[0].x, y: payload.alarms.low }, { x: first[first.length - 1].x, y: payload.alarms.low }]
							: [],
						borderColor: '#448aff',
						borderWidth: 1.5,
						borderDash: [6, 3],
						pointRadius: 0,
						fill: false,
					});
				}

				if (chartInstance) {
					chartInstance.destroy();
				}

				var gridColor = getComputedStyle(document.body)
					.getPropertyValue('--vscode-editorWidget-border') || 'rgba(255,255,255,0.1)';
				var textColor = getComputedStyle(document.body)
					.getPropertyValue('--vscode-editor-foreground') || '#d4d4d4';

				chartInstance = new Chart(canvas, {
					type: 'line',
					data: { datasets: datasets },
					options: {
						responsive: true,
						maintainAspectRatio: false,
						interaction: { mode: 'index', intersect: false },
						scales: {
							x: {
								type: 'time',
								time: { tooltipFormat: 'PPpp' },
								grid: { color: gridColor },
								ticks: { color: textColor, maxTicksLimit: 8 },
							},
							y: {
								grid: { color: gridColor },
								ticks: { color: textColor },
								title: {
									display: true,
									text: 'Temperature',
									color: textColor,
								},
							},
						},
						plugins: {
							legend: {
								labels: { color: textColor, boxWidth: 12 },
							},
							tooltip: {
								backgroundColor: 'rgba(30,30,30,0.95)',
								titleColor: '#fff',
								bodyColor: '#ccc',
							},
						},
					},
				});
			}

			window.addEventListener('message', function(event) {
				var msg = event.data;
				if (msg.type === 'chart-data') {
					renderChart(msg.payload);
				} else if (msg.type === 'error') {
					showMessage(msg.message, true);
				}
			});
		})();
	</script>
</body>
</html>`;
}

function getNonce(): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let nonce = "";
	for (let i = 0; i < 32; i++) {
		nonce += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return nonce;
}
