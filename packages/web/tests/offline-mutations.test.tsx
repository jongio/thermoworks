import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "fake-indexeddb/auto";
import type { Device, DeviceChannel } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlarmConfig } from "../src/components/AlarmConfig.tsx";
import { OfflineBanner } from "../src/components/OfflineBanner.tsx";
import { SessionControls } from "../src/components/SessionControls.tsx";
import { OfflineCacheProvider } from "../src/context/OfflineCacheContext.tsx";
import type { ThermoworksWebClient } from "../src/lib/api.ts";
import {
	enqueueAlarmMutation,
	enqueueEndSessionMutation,
	enqueueStartSessionMutation,
	getOutboxSnapshot,
	replayQueuedMutations,
} from "../src/lib/offline-mutations.ts";

function setOnline(value: boolean): void {
	Object.defineProperty(window.navigator, "onLine", {
		value,
		configurable: true,
	});
}

function deleteThermoworksDb(): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase("thermoworks");
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
		request.onblocked = () => reject(new Error("IndexedDB delete blocked"));
	});
}

function makeClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		endSession: vi.fn().mockResolvedValue({ success: true }),
		getDevice: vi.fn().mockResolvedValue({ sessionStart: null }),
		getDeviceChannel: vi.fn().mockResolvedValue(null),
		setAlarm: vi.fn().mockResolvedValue(undefined),
		startSession: vi.fn().mockResolvedValue({ success: true }),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

describe("offline mutation outbox", () => {
	beforeEach(async () => {
		await deleteThermoworksDb();
		setOnline(true);
		vi.useRealTimers();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await deleteThermoworksDb();
	});

	it("queues alarm config and session start/stop actions performed while offline", async () => {
		setOnline(false);
		const client = makeClient();

		render(
			<AlarmConfig
				client={client}
				serial="TW-001"
				channelNumber={1}
				channelUnits="F"
				currentHighValue={100}
				currentHighEnabled={true}
				currentLowValue={40}
				currentLowEnabled={true}
				onClose={vi.fn()}
				onSaved={vi.fn()}
			/>,
		);
		fireEvent.change(screen.getByLabelText("High alarm temperature"), {
			target: { value: "225" },
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /save/i }));
		});

		render(
			<SessionControls client={client} serial="TW-001" sessionStart={null} sessionLabel={null} />,
		);
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /start session/i }));
		});

		render(
			<SessionControls
				client={client}
				serial="TW-002"
				sessionStart={new Date("2026-07-17T12:00:00Z")}
				sessionLabel={null}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /end/i }));
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
		});

		await waitFor(async () => {
			await expect(getOutboxSnapshot()).resolves.toEqual({ pendingCount: 3, conflictCount: 0 });
		});
		expect(client.setAlarm).not.toHaveBeenCalled();
		expect(client.startSession).not.toHaveBeenCalled();
		expect(client.endSession).not.toHaveBeenCalled();
		expect(screen.queryByText(/failed|network error|server error/i)).not.toBeInTheDocument();
	});

	it("replays queued mutations in original order on reconnect via the api layer", async () => {
		const calls: string[] = [];
		vi.spyOn(Date, "now")
			.mockReturnValueOnce(1000)
			.mockReturnValueOnce(1000)
			.mockReturnValueOnce(2000)
			.mockReturnValueOnce(2000);
		await enqueueStartSessionMutation({ serial: "TW-001", label: "Brisket", wasActive: false });
		await enqueueEndSessionMutation({ serial: "TW-001", wasActive: true });
		vi.restoreAllMocks();

		const client = makeClient({
			getDevice: vi
				.fn()
				.mockResolvedValueOnce({ sessionStart: null } as Device)
				.mockResolvedValueOnce({ sessionStart: new Date("2026-07-17T12:00:00Z") } as Device),
			startSession: vi.fn().mockImplementation(async () => {
				calls.push("start");
				return { success: true };
			}),
			endSession: vi.fn().mockImplementation(async () => {
				calls.push("end");
				return { success: true };
			}),
		});

		await expect(replayQueuedMutations(client)).resolves.toEqual({ replayed: 2, conflicts: 0 });
		expect(calls).toEqual(["start", "end"]);
		await expect(getOutboxSnapshot()).resolves.toEqual({ pendingCount: 0, conflictCount: 0 });
	});

	it("keeps replaying remaining mutations when one mutation throws", async () => {
		await enqueueStartSessionMutation({ serial: "TW-001", label: "Ribs", wasActive: false });
		await enqueueStartSessionMutation({ serial: "TW-002", label: "Brisket", wasActive: false });

		const client = makeClient({
			getDevice: vi.fn().mockResolvedValue({ sessionStart: null } as Device),
			startSession: vi
				.fn()
				.mockRejectedValueOnce(new Error("network error"))
				.mockResolvedValueOnce({ success: true }),
		});

		// A single failure must not abort replay of the remaining queued mutations.
		await expect(replayQueuedMutations(client)).resolves.toEqual({ replayed: 1, conflicts: 0 });
		// The failed mutation stays queued for the next reconnect; the successful one is cleared.
		await expect(getOutboxSnapshot()).resolves.toEqual({ pendingCount: 1, conflictCount: 0 });
	});

	it("shows and clears a pending badge count for queued actions", async () => {
		await enqueueStartSessionMutation({ serial: "TW-001", label: "Ribs", wasActive: false });

		const { rerender } = render(
			<OfflineCacheProvider>
				<OfflineBanner />
			</OfflineCacheProvider>,
		);

		expect(await screen.findByText("1 pending")).toBeInTheDocument();

		const client = makeClient({
			getDevice: vi.fn().mockResolvedValue({ sessionStart: null } as Device),
		});
		await replayQueuedMutations(client);
		rerender(
			<OfflineCacheProvider>
				<OfflineBanner />
			</OfflineCacheProvider>,
		);

		await waitFor(() => {
			expect(screen.queryByText("1 pending")).not.toBeInTheDocument();
		});
	});

	it("detects conflicts and surfaces review-and-retry resolution instead of overwriting", async () => {
		await enqueueAlarmMutation({
			serial: "TW-001",
			channel: 1,
			config: { high: { value: 225, units: "F", enabled: true } },
			currentHighValue: 100,
			currentHighEnabled: true,
			currentLowValue: 40,
			currentLowEnabled: true,
			channelUnits: "F",
		});
		const changedChannel = {
			alarmHigh: { enabled: true, value: 150, units: "F" },
			alarmLow: { enabled: true, value: 40, units: "F" },
		} as DeviceChannel;
		const client = makeClient({
			getDeviceChannel: vi.fn().mockResolvedValue(changedChannel),
		});

		await expect(replayQueuedMutations(client)).resolves.toEqual({ replayed: 0, conflicts: 1 });
		expect(client.setAlarm).not.toHaveBeenCalled();
		await expect(getOutboxSnapshot()).resolves.toEqual({ pendingCount: 0, conflictCount: 1 });

		render(
			<OfflineCacheProvider>
				<OfflineBanner />
			</OfflineCacheProvider>,
		);
		expect(await screen.findByText(/needs review/i)).toHaveTextContent(
			"1 needs review — check current device state, then retry online",
		);
	});
});
