#!/usr/bin/env node
/**
 * Post-release smoke test for the published `thermoworks-sdk` package.
 *
 * Imports the package (main entry + the `thermoworks-sdk/testing` subpath) and
 * exercises a no-network path via the offline `FakeThermoworksCloud` fixtures.
 * Meant to run in a clean directory where `thermoworks-sdk` has been installed
 * from npm, to catch broken publishes (missing files, wrong `exports` map,
 * unresolved subpath types/entries).
 *
 * Usage: run with `thermoworks-sdk` installed in the resolution path. Exits
 * non-zero on failure.
 */
let failures = 0;

function assert(condition, message) {
	if (condition) {
		console.log(`ok    ${message}`);
	} else {
		console.error(`FAIL  ${message}`);
		failures++;
	}
}

try {
	const sdk = await import("thermoworks-sdk");
	assert(typeof sdk.ThermoworksCloud === "function", "main entry exports ThermoworksCloud");
	assert(typeof sdk.getChannelAlarmState === "function", "main entry exports getChannelAlarmState");

	const testing = await import("thermoworks-sdk/testing");
	assert(
		typeof testing.FakeThermoworksCloud === "function",
		"testing subpath exports FakeThermoworksCloud",
	);
	assert(Array.isArray(testing.FIXTURE_DEVICES), "testing subpath exports FIXTURE_DEVICES");

	// Exercise a no-network path end to end.
	const client = new testing.FakeThermoworksCloud();
	const devices = await client.getDevices();
	assert(Array.isArray(devices) && devices.length > 0, "FakeThermoworksCloud.getDevices() returns devices");

	const first = devices[0];
	const channels = await client.getAllDeviceChannels(first.serial);
	assert(Array.isArray(channels) && channels.length > 0, "getAllDeviceChannels() returns channels");
} catch (err) {
	console.error(`FAIL  SDK import/exercise threw: ${err instanceof Error ? err.stack : err}`);
	failures++;
}

if (failures > 0) {
	console.error(`\n${failures} SDK smoke check(s) failed.`);
	process.exit(1);
}
console.log("\nAll SDK smoke checks passed.");
