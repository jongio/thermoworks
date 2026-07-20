#!/usr/bin/env node
/**
 * Post-release smoke test for the published `thermoworks` CLI.
 *
 * Runs offline (no auth, no network) commands against the *installed* binary
 * and asserts they exit cleanly and produce output. This is meant to run after
 * a release against the package pulled from npm, to catch:
 *   - broken installs (unresolved/unpublished dependencies, e.g. a missing
 *     bundled module),
 *   - binaries that crash on startup,
 *   - a `mcp start` server that fails to load (the MCP server is bundled into
 *     the CLI, so this exercises that bundle).
 *
 * Usage:
 *   thermoworks must be on PATH (global install), or set THERMOWORKS_BIN to a
 *   path/command. Exits non-zero if any check fails.
 */
import { spawn, spawnSync } from "node:child_process";

const BIN = process.env.THERMOWORKS_BIN ?? "thermoworks";
const useShell = process.platform === "win32";
let failures = 0;

/** Run a CLI command and assert exit code + optional output pattern. */
function check(args, { expect } = {}) {
	const label = `${BIN} ${args.join(" ")}`;
	const res = spawnSync(BIN, args, { encoding: "utf8", shell: useShell, timeout: 30_000 });
	const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
	if (res.error) {
		console.error(`FAIL  ${label}\n      spawn error: ${res.error.message}`);
		failures++;
		return;
	}
	if (res.status !== 0) {
		console.error(`FAIL  ${label}\n      exit ${res.status}\n${indent(out)}`);
		failures++;
		return;
	}
	if (expect && !expect.test(out)) {
		console.error(`FAIL  ${label}\n      output did not match ${expect}\n${indent(out)}`);
		failures++;
		return;
	}
	console.log(`ok    ${label}`);
}

function indent(text) {
	return text
		.split("\n")
		.slice(0, 8)
		.map((l) => `      ${l}`)
		.join("\n");
}

/**
 * Verify `thermoworks mcp start` loads and runs the bundled MCP server without a
 * missing-module or startup crash. Starts it, closes stdin, and gives it a
 * moment: a clean exit or a still-running server both pass; a module/require
 * error is a failure.
 */
function checkMcpStart() {
	return new Promise((resolve) => {
		const label = `${BIN} mcp start`;
		const child = spawn(BIN, ["mcp", "start"], { shell: useShell });
		let stderr = "";
		let settled = false;
		child.stderr.on("data", (d) => {
			stderr += d.toString();
		});
		child.on("error", (err) => {
			if (settled) return;
			settled = true;
			console.error(`FAIL  ${label}\n      spawn error: ${err.message}`);
			failures++;
			resolve();
		});
		const loadError =
			/Cannot find module|ERR_MODULE_NOT_FOUND|ERR_REQUIRE_ESM|SyntaxError|does not provide an export|ReferenceError|TypeError/;
		const finish = (reason) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (loadError.test(stderr)) {
				console.error(`FAIL  ${label}\n      server failed to load:\n${indent(stderr)}`);
				failures++;
			} else {
				console.log(`ok    ${label} (${reason})`);
			}
			if (child.exitCode === null) child.kill();
			resolve();
		};
		child.on("exit", (code) => {
			if (code && loadError.test(stderr)) return finish("exited");
			finish(`exited ${code ?? "signal"}`);
		});
		// The server waits on stdio; close stdin and let it settle, then treat a
		// still-running (loaded) server as success.
		child.stdin.end();
		const timer = setTimeout(() => finish("running"), 4000);
	});
}

console.log(`Smoke-testing CLI via "${BIN}"\n`);

check(["--version"], { expect: /\d+\.\d+\.\d+/ });
check(["--help"], { expect: /Usage|Commands/i });
check(["convert", "225f"], { expect: /107/ });
check(["doneness"], { expect: /\w/ });
check(["season", "--weight", "12"], { expect: /\w/ });
check(["demo", "high"], { expect: /\d/ });
check(["completion", "bash"], { expect: /thermoworks/ });

await checkMcpStart();

if (failures > 0) {
	console.error(`\n${failures} smoke check(s) failed.`);
	process.exit(1);
}
console.log("\nAll CLI smoke checks passed.");
