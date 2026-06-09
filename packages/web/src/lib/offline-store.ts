import type { DeviceWithChannels } from "./api.ts";

const DB_NAME = "thermoworks";
const DB_VERSION = 1;
const STORE_NAME = "devices";
const CACHE_KEY = "latest";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CachedDeviceData {
	devices: DeviceWithChannels[];
	cachedAt: number;
}

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME);
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Store device data with the current timestamp.
 * Silently fails if IndexedDB is unavailable.
 */
export async function cacheDevices(devices: DeviceWithChannels[]): Promise<void> {
	const db = await openDB();
	const data: CachedDeviceData = { devices, cachedAt: Date.now() };

	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		tx.objectStore(STORE_NAME).put(data, CACHE_KEY);
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error);
		};
	});
}

/**
 * Retrieve cached device data if it exists and is fresher than 24h.
 * Returns null if no cache, expired, or IndexedDB is unavailable.
 */
export async function getCachedDevices(): Promise<CachedDeviceData | null> {
	const db = await openDB();

	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readonly");
		const request = tx.objectStore(STORE_NAME).get(CACHE_KEY);

		request.onsuccess = () => {
			db.close();
			const data = request.result as CachedDeviceData | undefined;
			if (!data) {
				resolve(null);
				return;
			}
			if (Date.now() - data.cachedAt > CACHE_TTL_MS) {
				resolve(null);
				return;
			}
			resolve(data);
		};

		request.onerror = () => {
			db.close();
			reject(request.error);
		};
	});
}

/**
 * Remove cache entries older than 24h.
 * Called on app startup to prevent stale data accumulation.
 */
export async function clearStaleCache(): Promise<void> {
	const db = await openDB();

	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		const request = store.get(CACHE_KEY);

		request.onsuccess = () => {
			const data = request.result as CachedDeviceData | undefined;
			if (data && Date.now() - data.cachedAt > CACHE_TTL_MS) {
				store.delete(CACHE_KEY);
			}
		};

		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error);
		};
	});
}
