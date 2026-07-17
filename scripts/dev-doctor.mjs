#!/usr/bin/env node
// dev-doctor.mjs — Cross-platform dispatcher for contributor setup verification.
// Detects the current OS and runs the appropriate setup-verify script
// (setup-verify.ps1 on Windows, setup-verify.sh elsewhere).

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { platform } from "node:os";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const isWindows = platform() === "win32";

function findExecutable(names) {
	for (const name of names) {
		try {
			execFileSync(isWindows ? "where" : "which", [name], {
				stdio: "ignore",
			});
			return name;
		} catch {
			// not found, try next
		}
	}
	return null;
}

if (isWindows) {
	const script = join(scriptsDir, "setup-verify.ps1");
	if (!existsSync(script)) {
		console.error(`Missing: ${script}`);
		process.exit(1);
	}

	// Prefer pwsh (PowerShell 7+) over powershell (Windows PowerShell 5.1)
	const shell = findExecutable(["pwsh", "powershell"]);
	if (!shell) {
		console.error(
			"Neither pwsh nor powershell found. Install PowerShell: https://aka.ms/powershell",
		);
		process.exit(1);
	}

	try {
		execFileSync(
			shell,
			["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script],
			{ stdio: "inherit", cwd: join(scriptsDir, "..") },
		);
	} catch (err) {
		process.exit(err.status ?? 1);
	}
} else {
	const script = join(scriptsDir, "setup-verify.sh");
	if (!existsSync(script)) {
		console.error(`Missing: ${script}`);
		process.exit(1);
	}

	const shell = findExecutable(["bash", "sh"]);
	if (!shell) {
		console.error("Neither bash nor sh found.");
		process.exit(1);
	}

	try {
		execFileSync(shell, [script], {
			stdio: "inherit",
			cwd: join(scriptsDir, ".."),
		});
	} catch (err) {
		process.exit(err.status ?? 1);
	}
}
