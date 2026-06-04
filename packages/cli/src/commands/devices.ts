import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";

export async function devices(): Promise<void> {
	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const deviceList = await client.getDevices();

		if (deviceList.length === 0) {
			console.log("No devices found.");
			return;
		}

		console.log(`Found ${deviceList.length} device${deviceList.length > 1 ? "s" : ""}:\n`);

		for (const device of deviceList) {
			const name = device.label || device.serial;
			const parts: string[] = [name];

			if (device.type) parts.push(`(${device.type})`);
			if (device.status) parts.push(`[${device.status}]`);
			if (device.battery != null) parts.push(`🔋 ${device.battery}%`);
			if (device.lastSeen) {
				const ago = getTimeAgo(device.lastSeen);
				parts.push(`last seen ${ago}`);
			}

			console.log(`  ${parts.join("  ")}`);
		}
	} finally {
		client.close();
	}
}

function getTimeAgo(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}
