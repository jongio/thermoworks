import type { FirmwareInfo } from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/** Firmware status for a single device. */
interface FirmwareStatus {
	serial: string;
	label: string;
	type: string;
	current: string;
	latest: string;
	updateAvailable: boolean;
}

/**
 * Show firmware status for all devices (or a specific device via --device flag).
 * Compares installed firmware against the latest available per device type.
 */
export async function firmware(
	options: OutputOptions = { json: false },
	deviceFilter?: string,
): Promise<void> {
	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		let deviceList = await client.getDevices();

		if (deviceFilter) {
			deviceList = deviceList.filter((d) => d.serial === deviceFilter);
			if (deviceList.length === 0) {
				console.error(`No device found with serial: ${deviceFilter}`);
				process.exit(1);
			}
		}

		// Only check devices that have both a type and firmware version
		const checkable = deviceList.filter((d) => d.type && d.firmware);

		if (checkable.length === 0) {
			if (options.json) {
				outputJson([]);
				return;
			}
			console.log("No devices with firmware information found.");
			return;
		}

		// Fetch latest firmware per unique device type (parallel)
		const uniqueTypes = [...new Set(checkable.map((d) => d.type as string))];
		const firmwareMap = new Map<string, FirmwareInfo>();
		const results_fw = await Promise.allSettled(
			uniqueTypes.map(async (type) => {
				const info = await client.getFirmwareInfo(type);
				return { type, info };
			}),
		);
		for (const result of results_fw) {
			if (result.status === "fulfilled") {
				firmwareMap.set(result.value.type, result.value.info);
			}
		}

		const results: FirmwareStatus[] = [];
		for (const device of checkable) {
			const type = device.type as string;
			const latest = firmwareMap.get(type);
			if (!latest) continue;

			const current = device.firmware as string;
			results.push({
				serial: device.serial,
				label: device.label || device.serial,
				type,
				current,
				latest: latest.version,
				updateAvailable: current !== latest.version,
			});
		}

		if (options.json) {
			outputJson(results);
			return;
		}

		if (results.length === 0) {
			console.log("No firmware information available.");
			return;
		}

		// Calculate column widths for aligned output
		const labelWidth = Math.max(...results.map((r) => `${r.label} (${r.type})`.length));

		for (const r of results) {
			const name = `${r.label} (${r.type})`.padEnd(labelWidth);
			const versions = `firmware: ${r.current}  latest: ${r.latest}`;
			const status = r.updateAvailable
				? "\x1b[33m\u26a0\ufe0f  UPDATE AVAILABLE\x1b[0m"
				: "\x1b[32m\u2713  UP TO DATE\x1b[0m";
			console.log(`${name}  ${versions}  ${status}`);
		}
	} finally {
		client.close();
	}
}
