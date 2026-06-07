import { describe, expect, it } from "vitest";
import {
	type AlarmState,
	escalateAlarm,
	getChannelAlarmState,
	getChannelsAlarmState,
} from "../src/alarm.js";
import type { DeviceChannel } from "../src/types.js";

function makeChannel(overrides?: Partial<DeviceChannel>): DeviceChannel {
	return {
		value: null,
		units: null,
		label: null,
		status: null,
		type: null,
		number: null,
		enabled: null,
		color: null,
		lastSeen: null,
		lastTelemetrySaved: null,
		lastEventId: null,
		showAvgTemp: null,
		estimatedAlarmStatus: null,
		rateOfChange: null,
		rateOfChangeUnit: null,
		alarmHigh: null,
		alarmLow: null,
		minimum: null,
		maximum: null,
		...overrides,
	};
}

describe("getChannelAlarmState", () => {
	it("returns 'high' when alarmHigh is alarming", () => {
		const ch = makeChannel({
			alarmHigh: {
				enabled: true,
				alarming: true,
				muted: null,
				value: 100,
				units: "F",
				lastNotified: null,
			},
		});
		expect(getChannelAlarmState(ch)).toBe("high");
	});

	it("returns 'low' when alarmLow is alarming", () => {
		const ch = makeChannel({
			alarmLow: {
				enabled: true,
				alarming: true,
				muted: null,
				value: 32,
				units: "F",
				lastNotified: null,
			},
		});
		expect(getChannelAlarmState(ch)).toBe("low");
	});

	it("returns 'high' when both alarms are alarming (high takes priority)", () => {
		const ch = makeChannel({
			alarmHigh: {
				enabled: true,
				alarming: true,
				muted: null,
				value: 100,
				units: "F",
				lastNotified: null,
			},
			alarmLow: {
				enabled: true,
				alarming: true,
				muted: null,
				value: 32,
				units: "F",
				lastNotified: null,
			},
		});
		expect(getChannelAlarmState(ch)).toBe("high");
	});

	it("returns 'none' when no alarms are active", () => {
		const ch = makeChannel();
		expect(getChannelAlarmState(ch)).toBe("none");
	});

	it("returns 'none' when alarms exist but are not alarming", () => {
		const ch = makeChannel({
			alarmHigh: {
				enabled: true,
				alarming: false,
				muted: null,
				value: 100,
				units: "F",
				lastNotified: null,
			},
			alarmLow: {
				enabled: true,
				alarming: false,
				muted: null,
				value: 32,
				units: "F",
				lastNotified: null,
			},
		});
		expect(getChannelAlarmState(ch)).toBe("none");
	});
});

describe("getChannelsAlarmState", () => {
	it("returns 'high' if any channel has high alarm", () => {
		const channels = [
			makeChannel(),
			makeChannel({
				alarmHigh: {
					enabled: true,
					alarming: true,
					muted: null,
					value: 200,
					units: "F",
					lastNotified: null,
				},
			}),
		];
		expect(getChannelsAlarmState(channels)).toBe("high");
	});

	it("returns 'low' if any channel has low alarm and none has high", () => {
		const channels = [
			makeChannel(),
			makeChannel({
				alarmLow: {
					enabled: true,
					alarming: true,
					muted: null,
					value: 0,
					units: "F",
					lastNotified: null,
				},
			}),
		];
		expect(getChannelsAlarmState(channels)).toBe("low");
	});

	it("returns 'high' over 'low' when both exist across channels", () => {
		const channels = [
			makeChannel({
				alarmLow: {
					enabled: true,
					alarming: true,
					muted: null,
					value: 0,
					units: "F",
					lastNotified: null,
				},
			}),
			makeChannel({
				alarmHigh: {
					enabled: true,
					alarming: true,
					muted: null,
					value: 200,
					units: "F",
					lastNotified: null,
				},
			}),
		];
		expect(getChannelsAlarmState(channels)).toBe("high");
	});

	it("returns 'none' when no channels have alarms", () => {
		expect(getChannelsAlarmState([makeChannel(), makeChannel()])).toBe("none");
	});

	it("returns 'none' for an empty array", () => {
		expect(getChannelsAlarmState([])).toBe("none");
	});
});

describe("escalateAlarm", () => {
	it("returns 'high' when current is high", () => {
		expect(escalateAlarm("high", "none")).toBe("high");
		expect(escalateAlarm("high", "low")).toBe("high");
		expect(escalateAlarm("high", "high")).toBe("high");
	});

	it("returns 'high' when incoming is high", () => {
		expect(escalateAlarm("none", "high")).toBe("high");
		expect(escalateAlarm("low", "high")).toBe("high");
	});

	it("returns 'low' when either is low and neither is high", () => {
		expect(escalateAlarm("low", "none")).toBe("low");
		expect(escalateAlarm("none", "low")).toBe("low");
		expect(escalateAlarm("low", "low")).toBe("low");
	});

	it("returns 'none' when both are none", () => {
		expect(escalateAlarm("none", "none")).toBe("none");
	});

	it("is commutative for all combinations", () => {
		const states: AlarmState[] = ["none", "low", "high"];
		for (const a of states) {
			for (const b of states) {
				expect(escalateAlarm(a, b)).toBe(escalateAlarm(b, a));
			}
		}
	});
});
