import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
	CREDENTIAL_ACCOUNT,
	CREDENTIAL_SERVICE,
	resolveTokenCachePath,
	ThermoworksCloud,
} from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

type CheckStatus = "pass" | "fail" | "warn";

interface CheckResult {
	name: string;
	status: CheckStatus;
	message: string;
	suggestion?: string;
}

const COLORS = {
	pass: "\x1b[32m",
	fail: "\x1b[31m",
	warn: "\x1b[33m",
	reset: "\x1b[0m",
};

const ICONS = {
	pass: "\u2713",
	fail: "\u2717",
	warn: "!",
};

function printResult(result: CheckResult): void {
	const color = COLORS[result.status];
	const icon = ICONS[result.status];
	console.log(`${color}${icon}${COLORS.reset} ${result.name}: ${result.message}`);
	if (result.suggestion) {
		console.log(`  \u2192 ${result.suggestion}`);
	}
}

async function checkKeychainAccess(): Promise<CheckResult> {
	try {
		const keytar = await import("@github/keytar");
		const kt = keytar.default;
		const blob = await kt.getPassword(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT);
		if (blob) {
			return {
				name: "Keychain access",
				status: "pass",
				message: `Credentials found (service: ${CREDENTIAL_SERVICE}, account: ${CREDENTIAL_ACCOUNT})`,
			};
		}
		return {
			name: "Keychain access",
			status: "warn",
			message: "Keychain accessible but no credentials stored",
			suggestion: "Run: thermoworks auth login",
		};
	} catch {
		return {
			name: "Keychain access",
			status: "fail",
			message: "Cannot load @github/keytar",
			suggestion: "Ensure @github/keytar is installed and native modules are built",
		};
	}
}

function checkEnvVars(): CheckResult {
	const hasEmail = !!process.env.THERMOWORKS_EMAIL;
	const hasPassword = !!process.env.THERMOWORKS_PASSWORD;

	if (hasEmail && hasPassword) {
		return {
			name: "Env vars",
			status: "pass",
			message: "THERMOWORKS_EMAIL=yes, THERMOWORKS_PASSWORD=yes",
		};
	}
	if (!hasEmail && !hasPassword) {
		return {
			name: "Env vars",
			status: "warn",
			message: "THERMOWORKS_EMAIL=no, THERMOWORKS_PASSWORD=no",
			suggestion: "Set env vars for CI/headless usage, or use keychain via: thermoworks auth login",
		};
	}
	return {
		name: "Env vars",
		status: "warn",
		message: `THERMOWORKS_EMAIL=${hasEmail ? "yes" : "no"}, THERMOWORKS_PASSWORD=${hasPassword ? "yes" : "no"}`,
		suggestion: "Both THERMOWORKS_EMAIL and THERMOWORKS_PASSWORD must be set together",
	};
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function checkCredentialValidity(): Promise<CheckResult> {
	const creds = await getCredentials();
	if (!creds) {
		return {
			name: "Credential validity",
			status: "fail",
			message: "No credentials available (keychain or env)",
			suggestion: "Run: thermoworks auth login",
		};
	}
	if (!creds.email || !creds.password) {
		return {
			name: "Credential validity",
			status: "fail",
			message: "Credentials exist but email or password is empty",
			suggestion: "Re-run: thermoworks auth login",
		};
	}
	if (!EMAIL_PATTERN.test(creds.email)) {
		return {
			name: "Credential validity",
			status: "warn",
			message: "Email format looks invalid",
			suggestion: "Re-run: thermoworks auth login with a valid email address",
		};
	}
	return {
		name: "Credential validity",
		status: "pass",
		message: "Email and password present, email format valid",
	};
}

async function checkNetworkConnectivity(): Promise<CheckResult> {
	try {
		const response = await fetch("https://identitytoolkit.googleapis.com/", {
			method: "HEAD",
			signal: AbortSignal.timeout(10_000),
		});
		// Any response (even 4xx) means the host is reachable
		return {
			name: "Network connectivity",
			status: "pass",
			message: `identitytoolkit.googleapis.com reachable (HTTP ${response.status})`,
		};
	} catch (err) {
		const detail = err instanceof Error ? err.message : "unknown error";
		return {
			name: "Network connectivity",
			status: "fail",
			message: `Cannot reach identitytoolkit.googleapis.com: ${detail}`,
			suggestion: "Check your internet connection, DNS, and firewall/proxy settings",
		};
	}
}

async function checkAuthTest(): Promise<CheckResult> {
	const creds = await getCredentials();
	if (!creds) {
		return {
			name: "Auth test",
			status: "fail",
			message: "Skipped (no credentials available)",
			suggestion: "Run: thermoworks auth login",
		};
	}

	try {
		const client = new ThermoworksCloud({ email: creds.email, password: creds.password });
		await client.getUser();
		client.close();
		return {
			name: "Auth test",
			status: "pass",
			message: "Authentication successful",
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : "unknown error";
		return {
			name: "Auth test",
			status: "fail",
			message: `Authentication failed: ${message}`,
			suggestion: "Verify your credentials with: thermoworks auth login",
		};
	}
}

async function checkApiReachability(): Promise<CheckResult> {
	try {
		const response = await fetch("https://firestore.googleapis.com/", {
			method: "HEAD",
			signal: AbortSignal.timeout(10_000),
		});
		return {
			name: "API reachability",
			status: "pass",
			message: `firestore.googleapis.com reachable (HTTP ${response.status})`,
		};
	} catch (err) {
		const detail = err instanceof Error ? err.message : "unknown error";
		return {
			name: "API reachability",
			status: "fail",
			message: `Cannot reach firestore.googleapis.com: ${detail}`,
			suggestion: "Check your internet connection and firewall settings",
		};
	}
}

async function checkDeviceFetch(): Promise<CheckResult> {
	const creds = await getCredentials();
	if (!creds) {
		return {
			name: "Device fetch",
			status: "fail",
			message: "Skipped (no credentials available)",
			suggestion: "Run: thermoworks auth login",
		};
	}

	try {
		const client = new ThermoworksCloud({ email: creds.email, password: creds.password });
		const devices = await client.getDevices();
		client.close();
		return {
			name: "Device fetch",
			status: "pass",
			message: `Retrieved ${devices.length} device${devices.length === 1 ? "" : "s"}`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : "unknown error";
		return {
			name: "Device fetch",
			status: "fail",
			message: `Device fetch failed: ${message}`,
			suggestion: "Check auth and API connectivity above",
		};
	}
}

async function checkTokenCache(): Promise<CheckResult> {
	const cachePath = resolveTokenCachePath();
	try {
		await access(cachePath);
		const raw = await readFile(cachePath, "utf8");
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			!("expiresAt" in parsed) ||
			typeof (parsed as { expiresAt: unknown }).expiresAt !== "string"
		) {
			return {
				name: "Token cache",
				status: "warn",
				message: `File exists at ${cachePath} but has invalid format`,
				suggestion: "Run: thermoworks auth login to regenerate",
			};
		}
		const expiresAt = new Date((parsed as { expiresAt: string }).expiresAt);
		if (Number.isNaN(expiresAt.getTime())) {
			return {
				name: "Token cache",
				status: "warn",
				message: "Token cache has unparseable expiry date",
				suggestion: "Run: thermoworks auth login to regenerate",
			};
		}
		if (expiresAt.getTime() < Date.now()) {
			return {
				name: "Token cache",
				status: "warn",
				message: `Token expired at ${expiresAt.toISOString()}`,
				suggestion: "Token will auto-refresh on next API call, or re-login to regenerate",
			};
		}
		return {
			name: "Token cache",
			status: "pass",
			message: `Valid, expires ${expiresAt.toISOString()}`,
		};
	} catch (err) {
		if (err instanceof SyntaxError) {
			return {
				name: "Token cache",
				status: "warn",
				message: `File at ${cachePath} is not valid JSON`,
				suggestion: "Run: thermoworks auth login to regenerate",
			};
		}
		return {
			name: "Token cache",
			status: "warn",
			message: "No token cache file found (tokens may be stored in keychain)",
			suggestion: "This is normal if keychain is working",
		};
	}
}

async function checkConfigFile(): Promise<CheckResult> {
	const configPath = join(homedir(), ".thermoworks", "config.json");
	try {
		await access(configPath);
		const raw = await readFile(configPath, "utf8");
		JSON.parse(raw);
		return {
			name: "Config file",
			status: "pass",
			message: `${configPath} exists and is valid JSON`,
		};
	} catch (err) {
		if (err instanceof SyntaxError) {
			return {
				name: "Config file",
				status: "fail",
				message: `${configPath} exists but is not valid JSON`,
				suggestion: "Fix or delete the file, then run: thermoworks copilot setup",
			};
		}
		return {
			name: "Config file",
			status: "warn",
			message: "No config file found",
			suggestion: "Run: thermoworks copilot setup (only needed for statusline features)",
		};
	}
}

export async function doctor(options: OutputOptions): Promise<void> {
	const results: CheckResult[] = [];

	if (!options.json) {
		console.log("ThermoWorks Doctor\n");
		console.log("Running diagnostics...\n");
	}

	// Run checks in sequence (some depend on prior state)
	const checks = [
		checkKeychainAccess,
		checkEnvVars,
		checkCredentialValidity,
		checkNetworkConnectivity,
		checkAuthTest,
		checkApiReachability,
		checkDeviceFetch,
		checkTokenCache,
		checkConfigFile,
	];

	for (const check of checks) {
		const result = await check();
		results.push(result);
		if (!options.json) {
			printResult(result);
		}
	}

	if (options.json) {
		outputJson(results);
		return;
	}

	// Summary
	const failures = results.filter((r) => r.status === "fail").length;
	const warnings = results.filter((r) => r.status === "warn").length;
	const passes = results.filter((r) => r.status === "pass").length;
	console.log("");
	if (failures === 0 && warnings === 0) {
		console.log(`${COLORS.pass}All ${passes} checks passed.${COLORS.reset}`);
	} else {
		const parts: string[] = [];
		if (passes > 0) parts.push(`${passes} passed`);
		if (warnings > 0) parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
		if (failures > 0) parts.push(`${failures} failed`);
		console.log(parts.join(", "));
	}
}
