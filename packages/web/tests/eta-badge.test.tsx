import { render, screen } from "@testing-library/react";
import type { Alarm, DeviceChannel } from "thermoworks-sdk";
import { describe, expect, it } from "vitest";
import { EtaBadge } from "../src/components/EtaBadge.tsx";

function makeAlarm(overrides?: Partial<Alarm>): Alarm {
	return {
		enabled: true,
		alarming: false,
		muted: null,
		value: 225,
		units: "F",
		lastNotified: null,
		...overrides,
	};
}

function makeChannel(overrides?: Partial<DeviceChannel>): DeviceChannel {
	return {
		value: 180,
		units: "F",
		label: "Probe 1",
		status: "online",
		type: "temperature",
		number: "1",
		enabled: true,
		color: null,
		lastSeen: new Date(),
		lastTelemetrySaved: null,
		lastEventId: null,
		showAvgTemp: null,
		estimatedAlarmStatus: null,
		rateOfChange: 1.5,
		rateOfChangeUnit: "/min",
		alarmHigh: makeAlarm(),
		alarmLow: null,
		minimum: null,
		maximum: null,
		...overrides,
	};
}

describe("EtaBadge", () => {
	it("renders ETA when rate and target are available", () => {
		// 45 degrees at 1.5 deg/min = 30 min
		render(<EtaBadge channel={makeChannel()} />);
		expect(screen.getByRole("status")).toHaveTextContent("~30 min");
	});

	it("does not render when rateOfChange is null", () => {
		render(<EtaBadge channel={makeChannel({ rateOfChange: null })} />);
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("does not render when high alarm is not set", () => {
		render(<EtaBadge channel={makeChannel({ alarmHigh: null })} />);
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("does not render when high alarm is disabled", () => {
		render(<EtaBadge channel={makeChannel({ alarmHigh: makeAlarm({ enabled: false }) })} />);
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("does not render when current value is null", () => {
		render(<EtaBadge channel={makeChannel({ value: null })} />);
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("does not render when rate is zero (stalled)", () => {
		render(<EtaBadge channel={makeChannel({ rateOfChange: 0 })} />);
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("does not render when rate is negative (cooling)", () => {
		render(<EtaBadge channel={makeChannel({ rateOfChange: -0.5 })} />);
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("does not render when already at target", () => {
		render(<EtaBadge channel={makeChannel({ value: 225 })} />);
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("formats hours and minutes for longer estimates", () => {
		// 200 degrees at 2 deg/min = 100 min = 1 hr 40 min
		render(
			<EtaBadge
				channel={makeChannel({ value: 25, alarmHigh: makeAlarm({ value: 225 }), rateOfChange: 2 })}
			/>,
		);
		expect(screen.getByRole("status")).toHaveTextContent("~1 hr 40 min");
	});

	it("formats exact hours without minutes", () => {
		// 120 degrees at 2 deg/min = 60 min = 1 hr
		render(
			<EtaBadge
				channel={makeChannel({ value: 105, alarmHigh: makeAlarm({ value: 225 }), rateOfChange: 2 })}
			/>,
		);
		expect(screen.getByRole("status")).toHaveTextContent("~1 hr");
	});

	it("shows green styling when almost done (under 15 min)", () => {
		// 10 degrees at 1 deg/min = 10 min
		render(<EtaBadge channel={makeChannel({ value: 215, rateOfChange: 1 })} />);
		const badge = screen.getByRole("status");
		expect(badge).toHaveTextContent("~10 min");
		expect(badge.className).toContain("bg-green-100");
	});

	it("shows amber styling when actively tracking (over 15 min)", () => {
		render(<EtaBadge channel={makeChannel()} />);
		const badge = screen.getByRole("status");
		expect(badge.className).toContain("bg-amber-100");
	});

	it("renders large variant with size=lg", () => {
		render(<EtaBadge channel={makeChannel()} size="lg" />);
		const badge = screen.getByRole("status");
		expect(badge).toHaveTextContent("~30 min remaining");
		expect(badge.className).toContain("rounded-lg");
	});

	it("has accessible aria-label", () => {
		render(<EtaBadge channel={makeChannel()} />);
		const badge = screen.getByRole("status");
		expect(badge).toHaveAttribute("aria-label", "Estimated time remaining: ~30 min");
	});
});
