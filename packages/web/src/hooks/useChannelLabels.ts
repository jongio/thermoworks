import { useCallback, useSyncExternalStore } from "react";

/** localStorage key for the channel labels map. */
const STORAGE_KEY = "thermoworks:channelLabels";

/** The label map shape: `{ "serial:channelNumber": "label" }`. */
export type ChannelLabelMap = Record<string, string>;

/** Build a key for the label map. */
export function channelLabelKey(serial: string, channelNumber: string | number): string {
	return `${serial}:${channelNumber}`;
}

/**
 * Sanitize a user-provided label before persisting or displaying it.
 * Strips ANSI escape sequences, control characters, and enforces max length.
 */
function sanitizeLabel(value: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional - stripping control chars
	return value.replace(/[\x00-\x1f\x7f\x1b](\[[0-9;]*[A-Za-z])?/g, "").slice(0, 50);
}

function readMap(): ChannelLabelMap {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
		return parsed as ChannelLabelMap;
	} catch {
		return {};
	}
}

function writeMap(map: ChannelLabelMap): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
		// Notify same-window subscribers via a custom event.
		window.dispatchEvent(new Event("channel-labels-changed"));
	} catch {
		// localStorage may be full or disabled; non-fatal.
	}
}

/** Resolve a channel display name: custom label > cloud label > "Ch N". */
export function resolveChannelLabel(
	serial: string,
	channel: { label?: string | null; number?: string | null },
	labels: ChannelLabelMap,
	index: number,
): string {
	const chNum = channel.number ?? String(index + 1);
	const key = channelLabelKey(serial, chNum);
	const custom = labels[key];
	if (custom) return custom;
	if (channel.label) return channel.label;
	return `Ch ${chNum}`;
}

// ─── External store for useSyncExternalStore ─────────────────────────────────

let cachedSnapshot: ChannelLabelMap = readMap();

function subscribe(onStoreChange: () => void): () => void {
	const onStorage = (e: StorageEvent) => {
		if (e.key === STORAGE_KEY || e.key === null) {
			cachedSnapshot = readMap();
			onStoreChange();
		}
	};
	const onCustom = () => {
		cachedSnapshot = readMap();
		onStoreChange();
	};
	window.addEventListener("storage", onStorage);
	window.addEventListener("channel-labels-changed", onCustom);
	return () => {
		window.removeEventListener("storage", onStorage);
		window.removeEventListener("channel-labels-changed", onCustom);
	};
}

function getSnapshot(): ChannelLabelMap {
	return cachedSnapshot;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * React hook for reading and writing persistent channel labels stored in
 * localStorage. Returns the current label map, a setter, and a clear function.
 *
 * Cross-tab changes (via the `storage` event) and same-tab mutations both
 * trigger re-renders.
 */
export function useChannelLabels() {
	const labels = useSyncExternalStore(subscribe, getSnapshot, () => ({}));

	const setLabel = useCallback((serial: string, channelNumber: string | number, label: string) => {
		const cleaned = sanitizeLabel(label).trim();
		if (!cleaned) return;
		const map = readMap();
		map[channelLabelKey(serial, channelNumber)] = cleaned;
		writeMap(map);
		cachedSnapshot = map;
	}, []);

	const clearLabel = useCallback((serial: string, channelNumber: string | number) => {
		const map = readMap();
		delete map[channelLabelKey(serial, channelNumber)];
		writeMap(map);
		cachedSnapshot = map;
	}, []);

	return { labels, setLabel, clearLabel } as const;
}
