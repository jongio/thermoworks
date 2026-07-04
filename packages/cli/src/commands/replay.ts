import {
	archiveReadingToReplay,
	buildReplaySequence,
	historyReadingToReplay,
	nextReplayIndex,
	type ReplayFrame,
	type ReplayReading,
	ThermoworksCloud,
} from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import type { OutputOptions } from "../output.js";

const DEFAULT_SPEED = 60;

/** Parsed options for the replay command. */
export interface ReplayCommandOptions {
	serial: string;
	archive?: string;
	channel?: string;
	speed: number;
	loop: boolean;
}

/** Parse `replay SERIAL [--archive ID] [--channel N] [--speed N] [--loop]`. */
export function parseReplayArgs(args: string[]): ReplayCommandOptions | null {
	const serial = args[0];
	if (!serial || serial.startsWith("--")) return null;

	let archive: string | undefined;
	let channel: string | undefined;
	let speed = DEFAULT_SPEED;
	let loop = false;

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
			case "--speed": {
				const n = Number(args[++i]);
				if (!Number.isFinite(n) || n <= 0) {
					console.error("--speed must be a positive number");
					process.exit(1);
				}
				speed = n;
				break;
			}
			case "--loop":
				loop = true;
				break;
			default:
				if (arg.startsWith("--")) {
					console.error(`Unknown option: ${arg}`);
					process.exit(1);
				}
		}
	}

	return { serial, archive, channel, speed, loop };
}

/** Format a single frame as a streaming line. */
export function formatReplayFrame(frame: ReplayFrame, total: number): string {
	const clock = frame.timestamp.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	const position = `${frame.index + 1}/${total}`.padStart(`${total}/${total}`.length);
	const unit = frame.units ? `\u00B0${frame.units}` : "";
	return `[${position}]  ${clock}  ${frame.value}${unit}`;
}

const defaultSleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/** Injectable dependencies, used to make streaming deterministic in tests. */
export interface ReplayDeps {
	sleep?: (ms: number) => Promise<void>;
}

/** The replay command handler. Streams archived readings as a live cook. */
export async function replay(
	args: string[],
	_options: OutputOptions,
	deps: ReplayDeps = {},
): Promise<void> {
	const opts = parseReplayArgs(args);
	if (!opts) {
		console.error(
			"Usage: thermoworks replay <SERIAL> [--archive ID] [--channel N] [--speed N] [--loop]",
		);
		process.exit(1);
	}

	const sleep = deps.sleep ?? defaultSleep;

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		let readings: ReplayReading[];
		let title: string;

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
						: `Archive ${opts.archive} has no channel readings to replay.`,
				);
				process.exit(1);
			}
			readings = chosen.recentReadings.map(archiveReadingToReplay);
			const label = chosen.label || `Ch ${chosen.number ?? "?"}`;
			title = `Replaying ${archive.label || archive.id} - ${label}`;
		} else {
			const data = await client.getHistory(opts.serial);
			readings = data.readings.map(historyReadingToReplay);
			title = `Replaying recent history for ${data.deviceId}`;
		}

		const frames = buildReplaySequence(readings, { speed: opts.speed });
		if (frames.length === 0) {
			console.log(`No readings to replay for ${opts.serial}.`);
			return;
		}

		console.log(`${title} at ${opts.speed}x${opts.loop ? " (looping, Ctrl+C to stop)" : ""}`);

		let index: number | null = 0;
		while (index !== null) {
			const frame = frames[index];
			if (frame) {
				await sleep(frame.delayMs);
				console.log(formatReplayFrame(frame, frames.length));
			}
			index = nextReplayIndex(index, frames.length, opts.loop);
		}

		console.log("Replay complete.");
	} finally {
		client.close();
	}
}
