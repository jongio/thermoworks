import { describe, expect, it } from "vitest";
import {
	FakeThermoworksCloud,
	FIXTURE_ARCHIVES,
	FIXTURE_CHANNELS,
	FIXTURE_DEVICES,
	FIXTURE_FIRMWARE_SCENARIOS,
	getFixtureAlarmState,
	getFixtureChannels,
	HIGH_ALARM_CHANNEL,
	LOW_ALARM_CHANNEL,
	makeArchive,
	makeArchiveChannel,
	makeChannel,
	makeDevice,
	OFFLINE_DEVICE,
} from "../src/testing/index.js";
import type { Archive, Device, DeviceChannel } from "../src/types.js";

describe("offline testing fixtures", () => {
	it("provides typed builders for devices, channels, and archives", () => {
		const device: Device = makeDevice({
			serial: "TEST-SIGNALS",
			label: "Test Signals",
			type: "signals",
		});
		const channel: DeviceChannel = makeChannel({
			label: "Pit",
			number: "1",
			value: 225,
		});
		const archive: Archive = makeArchive({
			channels: [
				makeArchiveChannel({
					label: channel.label,
					number: channel.number,
					value: channel.value,
				}),
			],
			deviceLabel: device.label,
			id: "typed-builder-archive",
		});

		expect(device.serial).toBe("TEST-SIGNALS");
		expect(channel.value).toBe(225);
		expect(archive.channels?.[0]?.label).toBe("Pit");
	});

	it("covers canonical devices, alarm states, archives, and firmware scenarios", () => {
		expect(FIXTURE_DEVICES.map((device) => device.type)).toEqual(
			expect.arrayContaining(["signals", "smoke", "node"]),
		);
		expect(OFFLINE_DEVICE.status).toBe("offline");
		expect(FIXTURE_ARCHIVES["DEMO-SIGNALS-4CH"]?.[0]?.channels?.length).toBeGreaterThan(0);
		expect(getFixtureAlarmState(HIGH_ALARM_CHANNEL)).toBe("high");
		expect(getFixtureAlarmState(LOW_ALARM_CHANNEL)).toBe("low");
		expect(FIXTURE_FIRMWARE_SCENARIOS["up-to-date"].installedVersion).toBe(
			FIXTURE_FIRMWARE_SCENARIOS["up-to-date"].latest.version,
		);
		expect(FIXTURE_FIRMWARE_SCENARIOS["update-available"].installedVersion).not.toBe(
			FIXTURE_FIRMWARE_SCENARIOS["update-available"].latest.version,
		);
	});

	it("exercises fake client behavior with realistic offline data", async () => {
		const client = new FakeThermoworksCloud();

		await expect(client.getDevices({ status: "offline" })).resolves.toEqual([OFFLINE_DEVICE]);
		await expect(client.getDevice("DEMO-SIGNALS-4CH")).resolves.toMatchObject({
			label: "Backyard Smoker",
		});
		await expect(client.getAllDeviceChannels("DEMO-SIGNALS-4CH")).resolves.toHaveLength(4);
		await expect(client.getAverageTemperature("DEMO-SIGNALS-4CH")).resolves.toMatchObject({
			units: "F",
		});
		await expect(client.getArchives("DEMO-SIGNALS-4CH", { limit: 1 })).resolves.toHaveLength(1);
		await expect(client.getFirmwareInfo("smoke")).resolves.toMatchObject({ version: "1.8.3" });

		client.close();
		expect(client.closed).toBe(true);
	});

	it("returns cloned channel scenarios so tests can mutate safely", () => {
		const high = getFixtureChannels("DEMO-SIGNALS-4CH", "high");
		const normal = FIXTURE_CHANNELS["DEMO-SIGNALS-4CH"].normal;

		expect(high[0]?.alarmHigh?.alarming).toBe(true);
		expect(normal[0]?.alarmHigh?.alarming).toBe(false);
		high[0] = makeChannel({ label: "Replacement", value: 1 });
		expect(getFixtureChannels("DEMO-SIGNALS-4CH", "high")[0]?.label).toBe("Pit");
	});
});
