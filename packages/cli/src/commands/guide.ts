import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

export async function guide(
	filter: string | undefined,
	options: OutputOptions = { json: false },
): Promise<void> {
	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const data = await client.getTemperatureGuide();
		let categories = data.categories;

		if (filter) {
			const needle = filter.toLowerCase();
			categories = categories.filter((c) => c.label.toLowerCase().includes(needle));
		}

		if (options.json) {
			outputJson(categories);
			return;
		}

		if (categories.length === 0) {
			if (filter) {
				console.log(`No categories matching "${filter}".`);
			} else {
				console.log("No temperature guide categories found.");
			}
			return;
		}

		for (const cat of categories) {
			console.log(`${cat.icon}  ${cat.label}`);

			if (cat.pullWarning) {
				console.log(`   ⚠ Pull: ${cat.pullWarning}`);
			}
			if (cat.warning) {
				console.log(`   ⚠ ${cat.warning}`);
			}
		}
	} finally {
		client.close();
	}
}
