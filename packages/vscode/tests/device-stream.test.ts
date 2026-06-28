import type { DeviceChannel } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceStream } from "../src/device-stream";

function ch(value: number, alarming = false): DeviceChannel {
	return {
		number: "1",
		value,
		units: "F",
		status: "normal",
		alarmHigh: { alarming },
	} as unknown as DeviceChannel;
}

describe("DeviceStream", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("polls watched devices and emits a snapshot on the first poll", async () => {
		const onSnapshot = vi.fn();
		const fetcher = vi.fn().mockResolvedValue([ch(225)]);
		const stream = new DeviceStream(fetcher, { onSnapshot }, 15_000);

		stream.setDevices(["AAA"]);
		expect(stream.size).toBe(1);

		await vi.advanceTimersByTimeAsync(15_000);
		expect(onSnapshot).toHaveBeenCalledWith({ serial: "AAA", channels: [ch(225)] });
		stream.dispose();
	});

	it("deduplicates identical snapshots", async () => {
		const onSnapshot = vi.fn();
		const fetcher = vi.fn().mockResolvedValue([ch(225)]);
		const stream = new DeviceStream(fetcher, { onSnapshot }, 15_000);

		stream.setDevices(["AAA"]);
		await vi.advanceTimersByTimeAsync(15_000);
		await vi.advanceTimersByTimeAsync(15_000);

		expect(onSnapshot).toHaveBeenCalledTimes(1);
		stream.dispose();
	});

	it("emits again when channel values change", async () => {
		const onSnapshot = vi.fn();
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce([ch(225)])
			.mockResolvedValueOnce([ch(230)]);
		const stream = new DeviceStream(fetcher, { onSnapshot }, 15_000);

		stream.setDevices(["AAA"]);
		await vi.advanceTimersByTimeAsync(15_000);
		await vi.advanceTimersByTimeAsync(15_000);

		expect(onSnapshot).toHaveBeenCalledTimes(2);
		stream.dispose();
	});

	it("enforces the minimum poll interval", async () => {
		const onSnapshot = vi.fn();
		const fetcher = vi.fn().mockResolvedValue([ch(225)]);
		const stream = new DeviceStream(fetcher, { onSnapshot }, 1_000);

		stream.setDevices(["AAA"]);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(onSnapshot).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(14_000);
		expect(onSnapshot).toHaveBeenCalledTimes(1);
		stream.dispose();
	});

	it("stops polling a removed device", () => {
		const fetcher = vi.fn().mockResolvedValue([ch(225)]);
		const stream = new DeviceStream(fetcher, { onSnapshot: vi.fn() }, 15_000);

		stream.setDevices(["AAA", "BBB"]);
		expect(stream.size).toBe(2);

		stream.setDevices(["AAA"]);
		expect(stream.size).toBe(1);
		stream.dispose();
	});

	it("reports fetch errors", async () => {
		const onError = vi.fn();
		const fetcher = vi.fn().mockRejectedValue(new Error("boom"));
		const stream = new DeviceStream(fetcher, { onSnapshot: vi.fn(), onError }, 15_000);

		stream.setDevices(["AAA"]);
		await vi.advanceTimersByTimeAsync(15_000);

		expect(onError).toHaveBeenCalledWith("AAA", expect.objectContaining({ message: "boom" }));
		stream.dispose();
	});

	it("stops all polling on dispose", async () => {
		const onSnapshot = vi.fn();
		const fetcher = vi.fn().mockResolvedValue([ch(225)]);
		const stream = new DeviceStream(fetcher, { onSnapshot }, 15_000);

		stream.setDevices(["AAA"]);
		stream.dispose();
		expect(stream.size).toBe(0);

		await vi.advanceTimersByTimeAsync(45_000);
		expect(onSnapshot).not.toHaveBeenCalled();
	});

	it("ignores setDevices after dispose", () => {
		const stream = new DeviceStream(vi.fn(), { onSnapshot: vi.fn() }, 15_000);
		stream.dispose();
		stream.setDevices(["AAA"]);
		expect(stream.size).toBe(0);
	});
});
