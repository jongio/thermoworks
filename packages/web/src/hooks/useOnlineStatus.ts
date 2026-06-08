import { useSyncExternalStore } from "react";

function subscribe(onStoreChange: () => void): () => void {
	window.addEventListener("online", onStoreChange);
	window.addEventListener("offline", onStoreChange);
	return () => {
		window.removeEventListener("online", onStoreChange);
		window.removeEventListener("offline", onStoreChange);
	};
}

function getSnapshot(): boolean {
	return navigator.onLine;
}

function getServerSnapshot(): boolean {
	return true;
}

/**
 * Tracks the browser's online/offline status reactively.
 * Uses `useSyncExternalStore` for tear-free reads during concurrent rendering.
 */
export function useOnlineStatus(): boolean {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
