import type { DataUsage, DeviceDataUsage } from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/**
 * Show account data storage usage, or per-device breakdown with --by-device.
 */
export async function dataUsage(args: string[], options: OutputOptions): Promise<void> {
	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		if (args.includes("--by-device")) {
			await showByDevice(client, options);
		} else {
			await showTotal(client, options);
		}
	} finally {
		client.close();
	}
}

/** Display total account data usage. */
async function showTotal(client: ThermoworksCloud, options: OutputOptions): Promise<void> {
	const usage: DataUsage = await client.getDataUsage();

	if (options.json) {
		outputJson(usage);
		return;
	}

	console.log(`Account data usage: ${usage.formattedSize}`);
}

/** Display per-device data usage sorted by size descending. */
async function showByDevice(client: ThermoworksCloud, options: OutputOptions): Promise<void> {
	const devices: DeviceDataUsage[] = await client.getDataUsageByDevice();

	if (devices.length === 0) {
		if (options.json) {
			outputJson([]);
			return;
		}
		console.log("No device data usage.");
		return;
	}

	// Sort by bytes descending
	const sorted = [...devices].sort((a, b) => b.bytes - a.bytes);

	if (options.json) {
		outputJson(sorted);
		return;
	}

	// Calculate column widths for aligned output
	const idWidth = Math.max(...sorted.map((d) => d.deviceId.length));

	for (const d of sorted) {
		console.log(`${d.deviceId.padEnd(idWidth)}  ${d.formattedSize}`);
	}
}
