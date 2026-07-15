import { useCallback, useMemo, useState } from "react";

const FAVORITES_KEY = "thermoworks-device-favorites";
const HIDDEN_KEY = "thermoworks-device-hidden";

/** Read a set of device serials from localStorage. Returns empty set on failure. */
function loadSerialSet(key: string): Set<string> {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return new Set();
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string")) return new Set();
		return new Set(parsed as string[]);
	} catch {
		return new Set();
	}
}

/** Persist a set of device serials to localStorage. */
function persistSerialSet(key: string, serials: Set<string>): void {
	try {
		localStorage.setItem(key, JSON.stringify([...serials]));
	} catch {
		// Storage full or unavailable; silently degrade
	}
}

interface UseDeviceVisibilityResult {
	/** Set of favorited device serial numbers. */
	favorites: ReadonlySet<string>;
	/** Set of hidden device serial numbers. */
	hiddenSerials: ReadonlySet<string>;
	/** Whether hidden devices are currently shown. */
	showHidden: boolean;
	/** Toggle the "show hidden" display mode. */
	setShowHidden: (show: boolean) => void;
	/** Toggle a device's favorite status. Favoriting a hidden device unhides it. */
	toggleFavorite: (serial: string) => void;
	/** Toggle a device's hidden status. Hiding a favorited device unfavorites it. */
	toggleHidden: (serial: string) => void;
	/** Check if a device is favorited. */
	isFavorite: (serial: string) => boolean;
	/** Check if a device is hidden. */
	isHidden: (serial: string) => boolean;
}

/**
 * Manages device visibility preferences (favorites and hidden) with localStorage persistence.
 * Favorites and hidden are mutually exclusive: favoriting unhides, hiding unfavorites.
 */
export function useDeviceVisibility(): UseDeviceVisibilityResult {
	const [revision, setRevision] = useState(0);
	const [showHidden, setShowHidden] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: revision forces re-read from storage
	const favorites = useMemo(() => loadSerialSet(FAVORITES_KEY), [revision]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: revision forces re-read from storage
	const hiddenSerials = useMemo(() => loadSerialSet(HIDDEN_KEY), [revision]);

	const toggleFavorite = useCallback((serial: string) => {
		const current = loadSerialSet(FAVORITES_KEY);
		if (current.has(serial)) {
			current.delete(serial);
		} else {
			current.add(serial);
			// Unhide if favoriting a hidden device
			const hidden = loadSerialSet(HIDDEN_KEY);
			if (hidden.has(serial)) {
				hidden.delete(serial);
				persistSerialSet(HIDDEN_KEY, hidden);
			}
		}
		persistSerialSet(FAVORITES_KEY, current);
		setRevision((r) => r + 1);
	}, []);

	const toggleHidden = useCallback((serial: string) => {
		const current = loadSerialSet(HIDDEN_KEY);
		if (current.has(serial)) {
			current.delete(serial);
		} else {
			current.add(serial);
			// Remove from favorites if hiding
			const favs = loadSerialSet(FAVORITES_KEY);
			if (favs.has(serial)) {
				favs.delete(serial);
				persistSerialSet(FAVORITES_KEY, favs);
			}
		}
		persistSerialSet(HIDDEN_KEY, current);
		setRevision((r) => r + 1);
	}, []);

	const isFavorite = useCallback((serial: string) => favorites.has(serial), [favorites]);

	const isHidden = useCallback((serial: string) => hiddenSerials.has(serial), [hiddenSerials]);

	return {
		favorites,
		hiddenSerials,
		showHidden,
		setShowHidden,
		toggleFavorite,
		toggleHidden,
		isFavorite,
		isHidden,
	};
}
