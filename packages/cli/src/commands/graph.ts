import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import type { OutputOptions } from "../output.js";

const DEFAULT_WIDTH = 60;
const DEFAULT_HEIGHT = 12;
const MIN_WIDTH = 10;
const MIN_HEIGHT = 3;

/** Options for the pure chart renderer. */
export interface ChartOptions {
	width?: number;
	height?: number;
}

function finite(values: number[]): number[] {
	return values.filter((v) => Number.isFinite(v));
}

/** Reduce a series to at most `width` columns by averaging contiguous buckets. */
export function downsample(values: number[], width: number): number[] {
	if (values.length <= width) return values;
	const columns: number[] = [];
	for (let c = 0; c < width; c++) {
		const start = Math.floor((c * values.length) / width);
		const end = Math.floor(((c + 1) * values.length) / width);
		const slice = values.slice(start, Math.max(end, start + 1));
		const sum = slice.reduce((a, b) => a + b, 0);
		columns.push(sum / slice.length);
	}
	return columns;
}

function formatLabel(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Render a series of numbers as a multi-row line chart. Pure and network-free.
 *
 * The Y axis shows temperature labels interpolated between the series min and
 * max. Each column is one sampled point. Empty, single-point, and flat series
 * are all handled without dividing by zero.
 */
export function renderChart(rawValues: number[], options: ChartOptions = {}): string {
	const width = Math.max(MIN_WIDTH, Math.floor(options.width ?? DEFAULT_WIDTH));
	const height = Math.max(MIN_HEIGHT, Math.floor(options.height ?? DEFAULT_HEIGHT));

	const values = finite(rawValues);
	if (values.length === 0) {
		return "(no readings to chart)\n";
	}

	const columns = downsample(values, width);
	const min = Math.min(...columns);
	const max = Math.max(...columns);
	const range = max - min;

	// Row 0 is the top (max). Map each column value to a row.
	const levelOf = (v: number): number => {
		if (range === 0) return Math.floor((height - 1) / 2);
		return Math.round(((v - min) / range) * (height - 1));
	};

	const rows: string[][] = Array.from({ length: height }, () => Array(columns.length).fill(" "));
	columns.forEach((v, col) => {
		const level = levelOf(v);
		const row = height - 1 - level;
		const cell = rows[row];
		if (cell) cell[col] = "*";
	});

	// Y-axis labels interpolated from max (top) to min (bottom).
	const labels: string[] = [];
	for (let r = 0; r < height; r++) {
		const value = range === 0 ? max : max - (r / (height - 1)) * range;
		labels.push(formatLabel(value));
	}
	const labelWidth = Math.max(...labels.map((l) => l.length));

	const lines = rows.map((cells, r) => {
		const label = (labels[r] ?? "").padStart(labelWidth);
		return `${label} \u2524${cells.join("")}`;
	});

	const axis = `${" ".repeat(labelWidth)} \u2514${"\u2500".repeat(columns.length)}`;
	lines.push(axis);
	return `${lines.join("\n")}\n`;
}

/** Parsed options for the graph command. */
export interface GraphOptions {
	serial: string;
	archive?: string;
	channel?: string;
	width: number;
	height: number;
}

/** Parse `graph SERIAL [--archive ID] [--channel N] [--width N] [--height N]`. */
export function parseGraphArgs(args: string[]): GraphOptions | null {
	const serial = args[0];
	if (!serial || serial.startsWith("--")) return null;

	let archive: string | undefined;
	let channel: string | undefined;
	let width = DEFAULT_WIDTH;
	let height = DEFAULT_HEIGHT;

	for (let i = 1; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;
		switch (arg) {
			case "--archive":
				archive = args[++i];
				if (!archive) {
					console.error("--archive requires an id");
					process.exit(1);
				}
				break;
			case "--channel":
				channel = args[++i];
				if (!channel) {
					console.error("--channel requires a channel number");
					process.exit(1);
				}
				break;
			case "--width": {
				const n = Number(args[++i]);
				if (!Number.isInteger(n) || n < MIN_WIDTH) {
					console.error(`--width must be an integer >= ${MIN_WIDTH}`);
					process.exit(1);
				}
				width = n;
				break;
			}
			case "--height": {
				const n = Number(args[++i]);
				if (!Number.isInteger(n) || n < MIN_HEIGHT) {
					console.error(`--height must be an integer >= ${MIN_HEIGHT}`);
					process.exit(1);
				}
				height = n;
				break;
			}
			default:
				if (arg.startsWith("--")) {
					console.error(`Unknown option: ${arg}`);
					process.exit(1);
				}
		}
	}

	return { serial, archive, channel, width, height };
}

function formatTime(value: string | Date): string {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return String(value);
	return date.toLocaleString();
}

/** The graph command handler. */
export async function graph(args: string[], _options: OutputOptions): Promise<void> {
	const opts = parseGraphArgs(args);
	if (!opts) {
		console.error(
			"Usage: thermoworks graph <SERIAL> [--archive ID] [--channel N] [--width N] [--height N]",
		);
		process.exit(1);
	}

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		let values: number[];
		let units = "";
		let title: string;
		let range = "";

		if (opts.archive) {
			const archive = await client.getArchive(opts.serial, opts.archive);
			const channels = archive.channels ?? [];
			const chosen = opts.channel
				? channels.find((c) => c.number === opts.channel)
				: channels.find((c) => c.recentReadings.length > 0);
			if (!chosen) {
				console.error(
					opts.channel
						? `No channel "${opts.channel}" in archive ${opts.archive}.`
						: `Archive ${opts.archive} has no channel readings to chart.`,
				);
				process.exit(1);
			}
			const readings = chosen.recentReadings;
			values = readings.map((r) => r.value);
			units = chosen.units ?? "";
			const label = chosen.label || `Ch ${chosen.number ?? "?"}`;
			title = `${archive.label || archive.id} - ${label}`;
			const first = readings[0];
			const last = readings[readings.length - 1];
			if (first && last)
				range = `${formatTime(first.timestamp)}  to  ${formatTime(last.timestamp)}`;
		} else {
			const data = await client.getHistory(opts.serial);
			const readings = data.readings;
			values = readings.map((r) => r.value);
			units = readings[0]?.units ?? "";
			title = `${data.deviceId} - recent history`;
			const first = readings[0];
			const last = readings[readings.length - 1];
			if (first && last)
				range = `${formatTime(first.timestamp)}  to  ${formatTime(last.timestamp)}`;
		}

		if (values.length === 0) {
			console.log(`No readings to chart for ${opts.serial}.`);
			return;
		}

		const unitSuffix = units ? ` (\u00B0${units})` : "";
		console.log(`${title}${unitSuffix}`);
		if (range) console.log(range);
		console.log("");
		process.stdout.write(renderChart(values, { width: opts.width, height: opts.height }));
	} finally {
		client.close();
	}
}
