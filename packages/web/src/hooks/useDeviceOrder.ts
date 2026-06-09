import { useCallback, useMemo, useState } from "react";
import type { DeviceWithChannels } from "../lib/api.ts";

const STORAGE_KEY = "thermoworks-device-order";

/** Read persisted device order from localStorage. Returns null if none saved. */
function loadOrder(): string[] | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string")) return null;
		return parsed as string[];
	} catch {
		return null;
	}
}

/** Persist device order to localStorage. */
function persistOrder(ids: string[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
	} catch {
		// Storage full or unavailable - silently degrade
	}
}

/** Clear persisted device order. */
function clearOrder(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Ignore
	}
}

/** Sort devices alphabetically by label (fallback to serial). */
function alphabetical(devices: DeviceWithChannels[]): DeviceWithChannels[] {
	return [...devices].sort((a, b) => {
		const nameA = (a.device.label ?? a.device.serial).toLowerCase();
		const nameB = (b.device.label ?? b.device.serial).toLowerCase();
		return nameA.localeCompare(nameB);
	});
}

interface UseDeviceOrderResult {
	/** Devices sorted by user-defined order (or alphabetical if no custom order). */
	orderedDevices: DeviceWithChannels[];
	/** Ordered array of device serial numbers (for SortableContext). */
	orderedIds: string[];
	/** Whether a custom order is active (non-alphabetical). */
	hasCustomOrder: boolean;
	/** Save a new order after drag-and-drop reorder. */
	saveOrder: (ids: string[]) => void;
	/** Reset to default alphabetical order. */
	resetOrder: () => void;
}

/**
 * Manages device display order with localStorage persistence.
 * Returns devices sorted by saved order (or alphabetical by default).
 */
export function useDeviceOrder(devices: DeviceWithChannels[]): UseDeviceOrderResult {
	const [revision, setRevision] = useState(0);

	const hasCustomOrder = useMemo(() => {
		// Re-evaluate when revision changes (forces re-read from storage)
		void revision;
		return loadOrder() !== null;
	}, [revision]);

	const orderedDevices = useMemo(() => {
		const savedOrder = loadOrder();
		if (!savedOrder || savedOrder.length === 0) {
			return alphabetical(devices);
		}

		// Build a map for O(1) lookup
		const deviceMap = new Map(devices.map((d) => [d.device.serial, d]));
		const ordered: DeviceWithChannels[] = [];

		// Place devices in saved order
		for (const id of savedOrder) {
			const device = deviceMap.get(id);
			if (device) {
				ordered.push(device);
				deviceMap.delete(id);
			}
		}

		// Append any new devices not in saved order (alphabetically)
		const remaining = [...deviceMap.values()];
		remaining.sort((a, b) => {
			const nameA = (a.device.label ?? a.device.serial).toLowerCase();
			const nameB = (b.device.label ?? b.device.serial).toLowerCase();
			return nameA.localeCompare(nameB);
		});
		ordered.push(...remaining);

		return ordered;
	}, [devices, revision]);

	const orderedIds = useMemo(
		() => orderedDevices.map((d) => d.device.serial),
		[orderedDevices],
	);

	const saveOrder = useCallback((ids: string[]) => {
		persistOrder(ids);
		setRevision((r) => r + 1);
	}, []);

	const resetOrder = useCallback(() => {
		clearOrder();
		setRevision((r) => r + 1);
	}, []);

	return { orderedDevices, orderedIds, hasCustomOrder, saveOrder, resetOrder };
}
