import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type DeviceChannel, ThermoworksCloud } from "thermoworks-sdk";

import {
	type DeviceEntry,
	getConfigPath,
	loadConfig,
	readCache,
	saveConfig,
	type ThermoworksCliConfig,
	writeCache,
} from "../config.js";
import { getCredentials } from "../credentials.js";
import { prompt, promptCheckbox } from "../prompt.js";

const COPILOT_DIR = join(homedir(), ".copilot");
const SETTINGS_PATH = join(COPILOT_DIR, "settings.json");

export async function copilotSetup(dev: boolean): Promise<void> {
	console.log("ThermoWorks Copilot Statusline Setup\n");
	// 1. Check credentials
	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	// 2. Fetch devices and channels
	process.stdout.write("Fetching devices and channels... ");
	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	interface ChannelInfo {
		number: number;
		label: string;
		temp: string;
	}
	interface DeviceInfo {
		serial: string;
		label: string;
		channels: ChannelInfo[];
		avgTemp: string;
	}

	let deviceInfos: DeviceInfo[];
	try {
		const devices = await client.getDevices();
		if (devices.length === 0) {
			console.log("\nNo devices found on your account.");
			client.close();
			process.exit(1);
		}

		deviceInfos = [];
		for (const d of devices) {
			const label = d.label || d.serial;
			const allChannels = await client.getAllDeviceChannels(d.serial);
			const tempChannels = allChannels.filter(
				(ch): ch is DeviceChannel & { value: number; units: string } =>
					ch.value != null && ch.units != null && ch.units !== "H",
			);

			const channels: ChannelInfo[] = tempChannels.map((ch) => {
				const originalIndex = allChannels.indexOf(ch) + 1;
				return {
					number: originalIndex,
					label: ch.label || `Channel ${originalIndex}`,
					temp: `${Math.round(ch.value)}\u00B0${ch.units}`,
				};
			});

			let avgTemp = "no reading";
			if (tempChannels.length > 0) {
				const sum = tempChannels.reduce((acc, ch) => acc + ch.value, 0);
				const avg = Math.round(sum / tempChannels.length);
				avgTemp = `${avg}\u00B0${tempChannels[0]?.units}`;
			}

			deviceInfos.push({ serial: d.serial, label, channels, avgTemp });
		}
		console.log(`found ${devices.length}.\n`);
	} catch (err: unknown) {
		console.log("failed.");
		const message = err instanceof Error ? err.message : "Unknown error";
		console.error(`Error: ${message}`);
		client.close();
		process.exit(1);
	}
	client.close();

	// 3. Multi-select devices
	const deviceLabels = deviceInfos.map((d) => `${d.label} (${d.serial}) - ${d.avgTemp}`);
	const selectedDeviceIndices = await promptCheckbox("Select devices:", deviceLabels);

	// 4. Per-device channel selection (only for multi-channel devices)
	const selectedDevices: DeviceEntry[] = [];
	for (const di of selectedDeviceIndices) {
		const info = deviceInfos[di];
		if (!info) continue;

		if (info.channels.length <= 1) {
			selectedDevices.push({ serial: info.serial, label: info.label, channels: "avg" });
			continue;
		}

		console.log(`\n${info.label} has ${info.channels.length} channels:`);
		const channelChoices = [
			`Average (${info.avgTemp})`,
			...info.channels.map((ch) => `${ch.label} - ${ch.temp}`),
		];
		const channelIndices = await promptCheckbox(`  ${info.label} channels:`, channelChoices);

		if (channelIndices.includes(0)) {
			selectedDevices.push({ serial: info.serial, label: info.label, channels: "avg" });
		} else {
			selectedDevices.push({
				serial: info.serial,
				label: info.label,
				channels: channelIndices
					.map((i) => info.channels[i - 1]?.number)
					.filter((n): n is number => n != null),
			});
		}
	}

	const config: ThermoworksCliConfig = {
		devices: selectedDevices,
		refreshSeconds: 30,
	};

	// 5. Save config
	await saveConfig(config);
	console.log(`\nConfig saved to ${getConfigPath()}`);

	// 6. Configure statusline
	const answer = await prompt("Configure Copilot CLI statusline? (Y/n) ");
	if (answer.toLowerCase() === "n") {
		console.log(
			"Skipped statusline. You can run commands manually with: thermoworks copilot status",
		);
		return;
	}

	const { fileURLToPath } = await import("node:url");
	const { dirname } = await import("node:path");
	const cliDir = dirname(dirname(fileURLToPath(import.meta.url)));
	const localEntry = join(cliDir, "dist", "index.js");

	let command: string;
	if (dev) {
		command = `node "${localEntry}" copilot status`;
	} else {
		const isGlobalInstall = cliDir.includes("node_modules");
		command = isGlobalInstall
			? "npx --yes thermoworks copilot status"
			: `node "${localEntry}" copilot status`;
	}

	const statusLineConfig = { type: "command", command, _managedBy: "thermoworks" };

	try {
		await mkdir(COPILOT_DIR, { recursive: true });

		let settings: Record<string, unknown> = {};
		try {
			const raw = await readFile(SETTINGS_PATH, "utf8");
			const parsed = JSON.parse(raw) as Record<string, unknown>;
			settings = parsed;
		} catch (err: unknown) {
			// Only proceed if file doesn't exist; don't clobber corrupt files
			if (err instanceof SyntaxError) {
				console.error("Error: ~/.copilot/settings.json contains invalid JSON. Fix it manually.");
				return;
			}
		}

		// Warn if overwriting a statusLine not managed by us
		const existing = settings.statusLine as Record<string, unknown> | undefined;
		if (existing && existing._managedBy !== "thermoworks") {
			const overwrite = await prompt("A statusline is already configured. Overwrite? (y/N) ");
			if (overwrite.toLowerCase() !== "y") {
				console.log("Skipped. Run the command manually: thermoworks copilot status");
				return;
			}
		}

		settings.statusLine = statusLineConfig;
		await writeFile(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
		console.log(`Statusline configured in ${SETTINGS_PATH}`);
	} catch {
		console.log("\nCouldn't auto-configure. Add manually to ~/.copilot/settings.json:");
		console.log(`  ${JSON.stringify({ statusLine: statusLineConfig })}`);
	}

	const names = selectedDevices.map((d) => d.label).join(", ");
	console.log(`\nDone! Showing ${names}.${dev ? " (dev mode)" : ""}`);
	console.log("Temperatures update each time you send a prompt or get a response in Copilot CLI.");
}

export async function copilotSetupDemo(): Promise<void> {
	console.log("ThermoWorks Copilot Statusline Demo Setup\n");
	console.log("This configures the statusline to show fake data cycling through alarm states.");
	console.log("No credentials or devices required.\n");

	const { fileURLToPath } = await import("node:url");
	const { dirname } = await import("node:path");
	const cliDir = dirname(dirname(fileURLToPath(import.meta.url)));
	const localEntry = join(cliDir, "dist", "index.js");

	const command = `node "${localEntry}" copilot status --demo`;
	const statusLineConfig = { type: "command", command, _managedBy: "thermoworks-demo" };

	try {
		await mkdir(COPILOT_DIR, { recursive: true });

		let settings: Record<string, unknown> = {};
		try {
			const raw = await readFile(SETTINGS_PATH, "utf8");
			settings = JSON.parse(raw) as Record<string, unknown>;
		} catch (err: unknown) {
			if (err instanceof SyntaxError) {
				console.error("Error: ~/.copilot/settings.json contains invalid JSON. Fix it manually.");
				return;
			}
		}

		settings.statusLine = statusLineConfig;
		await writeFile(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
		console.log(`Statusline configured in ${SETTINGS_PATH}`);
		console.log(
			`\nCycle: normal → normal → HIGH alarm → HIGH alarm → LOW alarm → LOW alarm → repeat`,
		);
		console.log("Each Copilot CLI prompt/response will advance to the next state.");
	} catch {
		console.log("\nCouldn't auto-configure. Add manually to ~/.copilot/settings.json:");
		console.log(`  ${JSON.stringify({ statusLine: statusLineConfig })}`);
	}
}

export async function copilotStatus(): Promise<void> {
	const creds = await getCredentials();
	if (!creds) {
		return;
	}

	const config = await loadConfig();

	// Check cache first
	const cached = await readCache(config.refreshSeconds * 1000);
	if (cached) {
		console.log(cached);
		return;
	}

	if (config.devices.length === 0) {
		return;
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		// Fetch all devices in one query (required by Firestore security rules
		// before individual channel reads are permitted).
		const allDevices = await client.getDevices();

		const parts: string[] = [];

		for (const deviceConfig of config.devices) {
			const device = allDevices.find((d) => d.serial === deviceConfig.serial);
			if (!device) continue;

			const allChannels = await client.getAllDeviceChannels(device.serial);
			const tempChannels = allChannels.filter(
				(ch) => ch.value != null && ch.units != null && ch.units !== "H",
			);

			if (deviceConfig.channels === "avg") {
				if (tempChannels.length > 0) {
					const sum = tempChannels.reduce((acc, ch) => acc + (ch.value ?? 0), 0);
					const avg = Math.round(sum / tempChannels.length);
					const units = tempChannels[0]?.units;
					const alarmStyle = getChannelAlarmStyle(tempChannels);
					parts.push(wrapAnsi(`${deviceConfig.label}:${avg}\u00B0${units}`, alarmStyle));
				}
			} else if (deviceConfig.channels.length === 1) {
				// Single channel — no channel label needed
				const chIdx = deviceConfig.channels[0];
				const ch = chIdx != null ? allChannels[chIdx - 1] : undefined;
				if (ch?.value != null && ch.units != null) {
					const alarmStyle = getChannelAlarmStyle([ch]);
					parts.push(
						wrapAnsi(`${deviceConfig.label}:${Math.round(ch.value)}\u00B0${ch.units}`, alarmStyle),
					);
				}
			} else {
				// Multiple channels — include channel label
				for (const chNum of deviceConfig.channels) {
					const ch = allChannels[chNum - 1];
					if (ch?.value != null && ch.units != null) {
						const chLabel = ch.label || `Ch${chNum}`;
						const alarmStyle = getChannelAlarmStyle([ch]);
						parts.push(
							wrapAnsi(
								`${deviceConfig.label}:${chLabel}:${Math.round(ch.value)}\u00B0${ch.units}`,
								alarmStyle,
							),
						);
					}
				}
			}
		}

		const output = parts.length > 0 ? `\u{1F525} ${parts.join(" \u00B7 ")}` : "";

		if (output) {
			await writeCache(output);
			console.log(output);
		}
	} catch {
		// Silent failure for statusline
	} finally {
		client.close();
	}
}

// ─── Alarm styling helpers ───────────────────────────────────────────────────

type AlarmStyle = "none" | "low" | "high";

const ANSI_RESET = "\x1b[0m";
const ANSI_RED = "\x1b[91m"; // bright red
const ANSI_BLUE = "\x1b[94m"; // bright blue

function getChannelAlarmStyle(channels: DeviceChannel[]): AlarmStyle {
	for (const ch of channels) {
		if (ch.alarmHigh?.alarming) return "high";
	}
	for (const ch of channels) {
		if (ch.alarmLow?.alarming) return "low";
	}
	return "none";
}

function wrapAnsi(text: string, style: AlarmStyle): string {
	switch (style) {
		case "high":
			return `${ANSI_RED}${text}${ANSI_RESET}`;
		case "low":
			return `${ANSI_BLUE}${text}${ANSI_RESET}`;
		default:
			return text;
	}
}

// ─── Demo mode ───────────────────────────────────────────────────────────────

const DEMO_STATE_PATH = join(homedir(), ".thermoworks", ".demo-state");
const DEMO_CYCLE: AlarmStyle[] = ["none", "none", "high", "high", "low", "low"];

interface DemoScenario {
	label: string;
	channels: { label: string; value: number; units: string }[];
}

const DEMO_SCENARIOS: Record<AlarmStyle, DemoScenario[]> = {
	none: [
		{
			label: "Smoker",
			channels: [
				{ label: "Pit", value: 225, units: "F" },
				{ label: "Meat", value: 165, units: "F" },
			],
		},
		{ label: "Fridge", channels: [{ label: "Internal", value: 38, units: "F" }] },
	],
	high: [
		{
			label: "Smoker",
			channels: [
				{ label: "Pit", value: 285, units: "F" },
				{ label: "Meat", value: 205, units: "F" },
			],
		},
		{ label: "Fridge", channels: [{ label: "Internal", value: 38, units: "F" }] },
	],
	low: [
		{
			label: "Smoker",
			channels: [
				{ label: "Pit", value: 180, units: "F" },
				{ label: "Meat", value: 120, units: "F" },
			],
		},
		{ label: "Fridge", channels: [{ label: "Internal", value: 28, units: "F" }] },
	],
};

export async function nextDemoState(): Promise<AlarmStyle> {
	let idx = 0;
	try {
		const raw = await readFile(DEMO_STATE_PATH, "utf8");
		const parsed = Number.parseInt(raw.trim(), 10);
		idx = Number.isNaN(parsed) ? 0 : (parsed + 1) % DEMO_CYCLE.length;
	} catch {
		idx = 0;
	}
	await mkdir(join(homedir(), ".thermoworks"), { recursive: true });
	await writeFile(DEMO_STATE_PATH, String(idx), "utf8");
	return DEMO_CYCLE[idx] ?? "none";
}

export async function copilotStatusDemo(mode: AlarmStyle): Promise<void> {
	const devices = DEMO_SCENARIOS[mode];
	const parts: string[] = [];

	for (const device of devices) {
		for (const ch of device.channels) {
			const text = `${device.label}:${ch.label}:${ch.value}\u00B0${ch.units}`;
			parts.push(wrapAnsi(text, mode));
		}
	}

	const output = `\u{1F525} ${parts.join(" \u00B7 ")}`;
	console.log(output);
}

export async function copilotRemove(): Promise<void> {
	try {
		const raw = await readFile(SETTINGS_PATH, "utf8");
		const settings = JSON.parse(raw) as Record<string, unknown>;
		const existing = settings.statusLine as Record<string, unknown> | undefined;

		if (!existing) {
			console.log("No statusline configuration found.");
			return;
		}

		if (existing._managedBy !== "thermoworks" && existing._managedBy !== "thermoworks-demo") {
			console.log("Statusline is not managed by thermoworks. Not removing.");
			return;
		}

		delete settings.statusLine;
		await writeFile(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
		console.log("Statusline configuration removed.");
	} catch {
		console.log("No settings file found. Nothing to remove.");
	}
}
