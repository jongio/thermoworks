import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDeviceOrder } from "../src/hooks/useDeviceOrder.ts";
import type { DeviceWithChannels } from "../src/lib/api.ts";

const STORAGE_KEY = "thermoworks-device-order";

function makeDevice(serial: string, label?: string): DeviceWithChannels {
	return {
		device: {
			serial,
			deviceId: `dev-${serial}`,
			label: label ?? `Device ${serial}`,
			status: "online",
			type: "Signals",
			device: "signals",
			battery: 85,
			wifiStrength: -45,
			firmware: "1.2.0",
			sessionStart: null,
			sessionLabel: null,
		},
		channels: [],
	} as DeviceWithChannels;
}

describe("useDeviceOrder", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it("returns devices in alphabetical order by default", () => {
		const devices = [
			makeDevice("C001", "Zebra"),
			makeDevice("A001", "Alpha"),
			makeDevice("B001", "Mango"),
		];

		const { result } = renderHook(() => useDeviceOrder(devices));

		expect(result.current.orderedIds).toEqual(["A001", "B001", "C001"]);
		expect(result.current.orderedDevices[0].device.serial).toBe("A001");
		expect(result.current.orderedDevices[1].device.serial).toBe("B001");
		expect(result.current.orderedDevices[2].device.serial).toBe("C001");
		expect(result.current.hasCustomOrder).toBe(false);
	});

	it("persists and restores custom order from localStorage", () => {
		const devices = [
			makeDevice("A001", "Alpha"),
			makeDevice("B001", "Beta"),
			makeDevice("C001", "Charlie"),
		];

		const { result, rerender } = renderHook(() => useDeviceOrder(devices));

		// Save a custom order: C, A, B
		act(() => {
			result.current.saveOrder(["C001", "A001", "B001"]);
		});

		expect(result.current.hasCustomOrder).toBe(true);
		expect(result.current.orderedIds).toEqual(["C001", "A001", "B001"]);

		// Verify localStorage was written
		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
		expect(stored).toEqual(["C001", "A001", "B001"]);

		// Simulate re-render (like a page refresh scenario)
		rerender();
		expect(result.current.orderedIds).toEqual(["C001", "A001", "B001"]);
	});

	it("resetOrder clears localStorage and returns to alphabetical", () => {
		const devices = [
			makeDevice("C001", "Zebra"),
			makeDevice("A001", "Alpha"),
			makeDevice("B001", "Mango"),
		];

		// Pre-set custom order
		localStorage.setItem(STORAGE_KEY, JSON.stringify(["C001", "B001", "A001"]));

		const { result } = renderHook(() => useDeviceOrder(devices));

		expect(result.current.hasCustomOrder).toBe(true);
		expect(result.current.orderedIds).toEqual(["C001", "B001", "A001"]);

		// Reset
		act(() => {
			result.current.resetOrder();
		});

		expect(result.current.hasCustomOrder).toBe(false);
		// Back to alphabetical: Alpha, Mango, Zebra
		expect(result.current.orderedIds).toEqual(["A001", "B001", "C001"]);
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("appends new devices not in saved order alphabetically at the end", () => {
		const savedOrder = ["B001", "A001"];
		localStorage.setItem(STORAGE_KEY, JSON.stringify(savedOrder));

		const devices = [
			makeDevice("A001", "Alpha"),
			makeDevice("B001", "Beta"),
			makeDevice("D001", "Delta"),
			makeDevice("C001", "Charlie"),
		];

		const { result } = renderHook(() => useDeviceOrder(devices));

		// B001, A001 first (saved order), then C001, D001 (alphabetical remainder)
		expect(result.current.orderedIds).toEqual(["B001", "A001", "C001", "D001"]);
	});

	it("handles removed devices gracefully (ignores missing IDs in saved order)", () => {
		const savedOrder = ["A001", "GONE001", "B001"];
		localStorage.setItem(STORAGE_KEY, JSON.stringify(savedOrder));

		const devices = [makeDevice("A001", "Alpha"), makeDevice("B001", "Beta")];

		const { result } = renderHook(() => useDeviceOrder(devices));

		// GONE001 is silently skipped
		expect(result.current.orderedIds).toEqual(["A001", "B001"]);
	});

	it("handles corrupt localStorage gracefully", () => {
		localStorage.setItem(STORAGE_KEY, "not-valid-json{{{");

		const devices = [
			makeDevice("B001", "Beta"),
			makeDevice("A001", "Alpha"),
		];

		const { result } = renderHook(() => useDeviceOrder(devices));

		// Falls back to alphabetical
		expect(result.current.hasCustomOrder).toBe(false);
		expect(result.current.orderedIds).toEqual(["A001", "B001"]);
	});

	it("handles non-array localStorage value gracefully", () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ invalid: true }));

		const devices = [
			makeDevice("B001", "Beta"),
			makeDevice("A001", "Alpha"),
		];

		const { result } = renderHook(() => useDeviceOrder(devices));

		expect(result.current.hasCustomOrder).toBe(false);
		expect(result.current.orderedIds).toEqual(["A001", "B001"]);
	});

	it("handles localStorage write failure gracefully", () => {
		const devices = [makeDevice("A001", "Alpha")];

		// Simulate storage being full
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("QuotaExceededError");
		});

		const { result } = renderHook(() => useDeviceOrder(devices));

		// Should not throw
		act(() => {
			result.current.saveOrder(["A001"]);
		});

		// State still updates (in-memory via revision increment)
		expect(result.current.orderedIds).toEqual(["A001"]);
	});

	it("uses serial as fallback when label is null", () => {
		const devices = [
			makeDevice("ZZZ001", undefined),
			makeDevice("AAA001", undefined),
		];
		// Override labels to null
		devices[0].device.label = null as unknown as string;
		devices[1].device.label = null as unknown as string;

		const { result } = renderHook(() => useDeviceOrder(devices));

		// Alphabetical by serial: AAA001, ZZZ001 (since "Device X" labels are null)
		expect(result.current.orderedIds).toEqual(["AAA001", "ZZZ001"]);
	});
});
