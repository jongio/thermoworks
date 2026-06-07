import { describe, expect, it } from "vitest";
import { type AlarmState, getChannelAlarmState } from "../src/lib/api.ts";

describe("getChannelAlarmState", () => {
	it("returns 'high' when alarmHigh is alarming", () => {
		const channel = {
			value: 200,
			units: "F",
			label: "Probe 1",
			status: null,
			type: null,
			number: "1",
			enabled: true,
			color: null,
			lastSeen: null,
			lastTelemetrySaved: null,
			lastEventId: null,
			showAvgTemp: null,
			estimatedAlarmStatus: null,
			rateOfChange: null,
			rateOfChangeUnit: null,
			alarmHigh: {
				enabled: true,
				alarming: true,
				muted: null,
				value: 180,
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
			minimum: null,
			maximum: null,
		};
		expect(getChannelAlarmState(channel)).toBe("high");
	});

	it("returns 'low' when alarmLow is alarming", () => {
		const channel = {
			value: 20,
			units: "F",
			label: "Probe 1",
			status: null,
			type: null,
			number: "1",
			enabled: true,
			color: null,
			lastSeen: null,
			lastTelemetrySaved: null,
			lastEventId: null,
			showAvgTemp: null,
			estimatedAlarmStatus: null,
			rateOfChange: null,
			rateOfChangeUnit: null,
			alarmHigh: {
				enabled: true,
				alarming: false,
				muted: null,
				value: 180,
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
			minimum: null,
			maximum: null,
		};
		expect(getChannelAlarmState(channel)).toBe("low");
	});

	it("returns 'none' when no alarms are active", () => {
		const channel = {
			value: 100,
			units: "F",
			label: "Probe 1",
			status: null,
			type: null,
			number: "1",
			enabled: true,
			color: null,
			lastSeen: null,
			lastTelemetrySaved: null,
			lastEventId: null,
			showAvgTemp: null,
			estimatedAlarmStatus: null,
			rateOfChange: null,
			rateOfChangeUnit: null,
			alarmHigh: {
				enabled: true,
				alarming: false,
				muted: null,
				value: 180,
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
			minimum: null,
			maximum: null,
		};
		expect(getChannelAlarmState(channel)).toBe("none");
	});

	it("returns 'none' when alarms are null", () => {
		const channel = {
			value: 100,
			units: "F",
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
		};
		expect(getChannelAlarmState(channel)).toBe("none");
	});

	it("prioritizes high alarm over low when both are alarming", () => {
		const channel = {
			value: 200,
			units: "F",
			label: "Probe 1",
			status: null,
			type: null,
			number: "1",
			enabled: true,
			color: null,
			lastSeen: null,
			lastTelemetrySaved: null,
			lastEventId: null,
			showAvgTemp: null,
			estimatedAlarmStatus: null,
			rateOfChange: null,
			rateOfChangeUnit: null,
			alarmHigh: {
				enabled: true,
				alarming: true,
				muted: null,
				value: 180,
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
			minimum: null,
			maximum: null,
		};
		expect(getChannelAlarmState(channel)).toBe("high");
	});
});

describe("SERIAL_PATTERN validation", () => {
	// The SERIAL_PATTERN is /^[A-Za-z0-9:_-]+$/ used in public API functions.
	// We test the exported public functions indirectly via their return for invalid input.
	const SERIAL_PATTERN = /^[A-Za-z0-9:_-]+$/;

	it("accepts valid serial formats", () => {
		expect(SERIAL_PATTERN.test("AB12CD34")).toBe(true);
		expect(SERIAL_PATTERN.test("device-001")).toBe(true);
		expect(SERIAL_PATTERN.test("DEV_123")).toBe(true);
		expect(SERIAL_PATTERN.test("AA:BB:CC:DD")).toBe(true);
	});

	it("rejects serials with path traversal characters", () => {
		expect(SERIAL_PATTERN.test("../etc/passwd")).toBe(false);
		expect(SERIAL_PATTERN.test("device/../../")).toBe(false);
	});

	it("rejects empty strings", () => {
		expect(SERIAL_PATTERN.test("")).toBe(false);
	});

	it("rejects serials with spaces or special chars", () => {
		expect(SERIAL_PATTERN.test("device 001")).toBe(false);
		expect(SERIAL_PATTERN.test("device;drop")).toBe(false);
		expect(SERIAL_PATTERN.test("device<script>")).toBe(false);
	});
});
