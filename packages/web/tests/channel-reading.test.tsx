import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { DeviceChannel } from "thermoworks-sdk";
import { describe, expect, it, vi } from "vitest";
import { ChannelReading } from "../src/components/ChannelReading.tsx";
import { TemperatureUnitProvider } from "../src/context/TemperatureUnitContext.tsx";
import type { ThermoworksWebClient } from "../src/lib/api.ts";

function makeChannel(overrides: Partial<DeviceChannel> = {}): DeviceChannel {
	return {
		value: 225,
		units: "F",
		label: "Pit",
		status: "ok",
		type: "temperature",
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
		alarmHigh: null,
		alarmLow: null,
		minimum: null,
		maximum: null,
		...overrides,
	};
}

function makeClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		resetMinMax: vi.fn().mockResolvedValue({ success: true }),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

function renderChannel(ui: ReactNode) {
	return render(<TemperatureUnitProvider>{ui}</TemperatureUnitProvider>);
}

describe("ChannelReading", () => {
	it("resets min/max readings when client and serial are available", async () => {
		const client = makeClient();
		const onReset = vi.fn();

		renderChannel(
			<ChannelReading
				channel={makeChannel()}
				client={client}
				serial="TW-001"
				onAlarmSaved={onReset}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /reset min\/max/i }));
		fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

		await waitFor(() => {
			expect(client.resetMinMax).toHaveBeenCalledWith("TW-001", 1);
		});
		expect(onReset).toHaveBeenCalledOnce();
	});

	it("hides reset min/max when client or serial is missing", () => {
		renderChannel(<ChannelReading channel={makeChannel()} />);

		expect(screen.queryByRole("button", { name: /reset min\/max/i })).not.toBeInTheDocument();
	});
});
