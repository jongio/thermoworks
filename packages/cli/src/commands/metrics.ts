import { createServer, type Server } from "node:http";

import { type Device, type DeviceChannel, ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import type { OutputOptions } from "../output.js";
import type { DeviceWithChannels } from "./watch.js";

/** Parsed arguments for the metrics command. */
export interface MetricsArgs {
	host: string;
	port: number;
	device?: string;
	interval: number;
}

/** Default listen port for the metrics endpoint (matches Prometheus exporter conventions). */
export const DEFAULT_METRICS_PORT = 9464;

/** Parse metrics command arguments from remaining argv tokens. */
export function parseMetricsArgs(args: string[]): MetricsArgs {
	let host = "127.0.0.1";
	let port = DEFAULT_METRICS_PORT;
	let device: string | undefined;
	let interval = 10;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const next = args[i + 1];
		if (arg === "--host" && next !== undefined) {
			host = next;
			i++;
		} else if (arg === "--port" && next !== undefined) {
			i++;
			const parsed = Number(next);
			if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
				console.error("Error: --port must be an integer between 1 and 65535");
				process.exit(1);
			}
			port = parsed;
		} else if (arg === "--device" && next !== undefined) {
			device = next;
			i++;
		} else if (arg === "--interval" && next !== undefined) {
			i++;
			const parsed = Number(next);
			if (Number.isNaN(parsed) || parsed < 1) {
				console.error("Error: --interval must be a positive number (>= 1)");
				process.exit(1);
			}
			interval = parsed;
		}
	}

	return { host, port, device, interval };
}

/** A point-in-time view of what the exporter should publish. */
export interface MetricsSnapshot {
	up: boolean;
	scrapeErrors: number;
	devices: DeviceWithChannels[];
}

/** Escape a Prometheus label value per the text exposition format. */
export function escapeLabelValue(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function formatLabels(labels: Record<string, string | null | undefined>): string {
	const parts = Object.entries(labels)
		.filter(([, v]) => v != null && v !== "")
		.map(([k, v]) => `${k}="${escapeLabelValue(String(v))}"`);
	return parts.length > 0 ? `{${parts.join(",")}}` : "";
}

interface Sample {
	labels: Record<string, string | null | undefined>;
	value: number;
}

interface Metric {
	name: string;
	help: string;
	type: "gauge" | "counter";
	samples: Sample[];
}

function renderMetric(metric: Metric): string[] {
	const lines = [`# HELP ${metric.name} ${metric.help}`, `# TYPE ${metric.name} ${metric.type}`];
	for (const sample of metric.samples) {
		lines.push(`${metric.name}${formatLabels(sample.labels)} ${sample.value}`);
	}
	return lines;
}

function activeChannels(channels: DeviceChannel[]): DeviceChannel[] {
	return channels.filter((ch) => ch.enabled !== false);
}

function channelLabels(device: Device, channel: DeviceChannel): Record<string, string | null> {
	return {
		serial: device.serial,
		device: device.label || device.serial,
		channel: channel.number,
		label: channel.label,
		unit: channel.units,
	};
}

/**
 * Render a metrics snapshot as Prometheus text exposition format (version 0.0.4).
 * Pure and deterministic so it can be unit tested without a running server.
 */
export function renderMetrics(snapshot: MetricsSnapshot): string {
	const temperature: Sample[] = [];
	const minimum: Sample[] = [];
	const maximum: Sample[] = [];
	const alarmHigh: Sample[] = [];
	const alarmLow: Sample[] = [];
	const battery: Sample[] = [];

	for (const { device, channels } of snapshot.devices) {
		if (device.battery != null) {
			battery.push({
				labels: { serial: device.serial, device: device.label || device.serial },
				value: device.battery,
			});
		}

		for (const channel of activeChannels(channels)) {
			const labels = channelLabels(device, channel);
			if (channel.value != null) {
				temperature.push({ labels, value: channel.value });
			}
			if (channel.minimum?.value != null) {
				minimum.push({ labels, value: channel.minimum.value });
			}
			if (channel.maximum?.value != null) {
				maximum.push({ labels, value: channel.maximum.value });
			}
			if (channel.alarmHigh?.enabled) {
				alarmHigh.push({ labels, value: channel.alarmHigh.alarming ? 1 : 0 });
			}
			if (channel.alarmLow?.enabled) {
				alarmLow.push({ labels, value: channel.alarmLow.alarming ? 1 : 0 });
			}
		}
	}

	const metrics: Metric[] = [
		{
			name: "thermoworks_up",
			help: "Whether the last poll of ThermoWorks Cloud succeeded (1) or failed (0).",
			type: "gauge",
			samples: [{ labels: {}, value: snapshot.up ? 1 : 0 }],
		},
		{
			name: "thermoworks_scrape_errors_total",
			help: "Total number of failed polls since the exporter started.",
			type: "counter",
			samples: [{ labels: {}, value: snapshot.scrapeErrors }],
		},
		{
			name: "thermoworks_channel_temperature",
			help: "Current channel temperature or humidity reading.",
			type: "gauge",
			samples: temperature,
		},
		{
			name: "thermoworks_channel_minimum",
			help: "Minimum channel reading recorded this session.",
			type: "gauge",
			samples: minimum,
		},
		{
			name: "thermoworks_channel_maximum",
			help: "Maximum channel reading recorded this session.",
			type: "gauge",
			samples: maximum,
		},
		{
			name: "thermoworks_channel_alarm_high",
			help: "High alarm state for a channel (1 alarming, 0 clear). Present only when the high alarm is enabled.",
			type: "gauge",
			samples: alarmHigh,
		},
		{
			name: "thermoworks_channel_alarm_low",
			help: "Low alarm state for a channel (1 alarming, 0 clear). Present only when the low alarm is enabled.",
			type: "gauge",
			samples: alarmLow,
		},
		{
			name: "thermoworks_device_battery_percent",
			help: "Device battery level as a percentage.",
			type: "gauge",
			samples: battery,
		},
	];

	const lines = metrics.flatMap(renderMetric);
	return `${lines.join("\n")}\n`;
}

/**
 * Create the metrics HTTP server. `getSnapshot` is called on each request so
 * the server always serves the latest polled data. Exported for testing.
 */
export function createMetricsServer(getSnapshot: () => MetricsSnapshot): Server {
	return createServer((req, res) => {
		if (req.url === "/metrics") {
			res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
			res.end(renderMetrics(getSnapshot()));
			return;
		}
		if (req.url === "/" || req.url === "") {
			res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
			res.end("ThermoWorks metrics exporter. Scrape /metrics for Prometheus data.\n");
			return;
		}
		res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
		res.end("Not found\n");
	});
}

/**
 * Start a metrics exporter: poll device temperatures on an interval and serve
 * the latest snapshot as Prometheus text on `/metrics`. Runs until SIGINT
 * (handled by the global handler in index.ts).
 */
export async function metrics(args: string[], _options: OutputOptions): Promise<void> {
	const { host, port, device: deviceFilter, interval } = parseMetricsArgs(args);

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });
	process.on("exit", () => {
		client.close();
	});

	const snapshot: MetricsSnapshot = { up: false, scrapeErrors: 0, devices: [] };

	async function poll(): Promise<void> {
		try {
			let deviceList = await client.getDevices();
			if (deviceFilter) {
				deviceList = deviceList.filter((d) => d.serial === deviceFilter);
			}
			snapshot.devices = await Promise.all(
				deviceList.map(async (device) => ({
					device,
					channels: await client.getAllDeviceChannels(device.serial),
				})),
			);
			snapshot.up = true;
		} catch (err) {
			snapshot.up = false;
			snapshot.scrapeErrors += 1;
			console.error(`Poll failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	await poll();
	const timer = setInterval(poll, interval * 1000);
	process.on("exit", () => clearInterval(timer));

	const server = createMetricsServer(() => snapshot);

	server.listen(port, host, () => {
		console.log(`ThermoWorks metrics exporter listening on http://${host}:${port}/metrics`);
		console.log(`Polling every ${interval}s (Ctrl+C to exit)`);
	});
}
