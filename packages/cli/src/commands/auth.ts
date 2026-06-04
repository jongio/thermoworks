import { ThermoworksCloud } from "thermoworks-sdk";

import { deleteCredentials, getCredentials, getStoredEmail, storeCredentials } from "../credentials.js";
import { prompt, promptPassword } from "../prompt.js";

export async function authLogin(): Promise<void> {
	console.log("ThermoWorks Cloud Login\n");

	const email = await prompt("Email: ");
	if (!email) {
		console.error("Email is required.");
		process.exit(1);
	}

	const password = await promptPassword("Password: ");
	if (!password) {
		console.error("Password is required.");
		process.exit(1);
	}

	process.stdout.write("Verifying credentials... ");
	try {
		const client = new ThermoworksCloud({ email, password });
		await client.getUser();
		client.close();
	} catch (err: unknown) {
		console.log("\u2717");
		const message = err instanceof Error && err.name === "AuthError" ? err.message : "Connection failed";
		console.error(`\nError: ${message}`);
		process.exit(1);
	}
	console.log("\u2713");

	await storeCredentials(email, password);
	console.log("Credentials saved to system keychain.");
}

export async function authLogout(): Promise<void> {
	const deleted = await deleteCredentials();
	if (deleted) {
		console.log("Credentials removed from system keychain.");
	} else {
		console.log("No credentials found in system keychain.");
	}
}

export async function authStatus(): Promise<void> {
	const creds = await getCredentials();
	if (creds) {
		console.log(`Logged in as ${creds.email}`);
	} else {
		const email = await getStoredEmail();
		if (email) {
			console.log(`Stored email: ${email} (password missing)`);
		} else {
			console.log("Not logged in. Run: thermoworks auth login");
		}
	}
}
