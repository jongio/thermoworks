import { formatTimeAgo, ThermoworksCloud } from "thermoworks-sdk";

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
				const ago = formatTimeAgo(device.lastSeen);
				parts.push(`last seen ${ago}`);
			}

			console.log(`  ${parts.join("  ")}`);
		}
	} finally {
		client.close();
	}
}
