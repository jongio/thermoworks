import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// Stub localStorage for jsdom 29+ which no longer provides it by default.
// Re-stubs before each test to handle tests that call vi.unstubAllGlobals().
let localStorageStore: Record<string, string> = {};

function stubLocalStorageIfMissing() {
	if (typeof globalThis.localStorage === "undefined") {
		localStorageStore = {};
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => localStorageStore[key] ?? null,
			setItem: (key: string, value: string) => {
				localStorageStore[key] = String(value);
			},
			removeItem: (key: string) => {
				delete localStorageStore[key];
			},
			clear: () => {
				localStorageStore = {};
			},
			get length() {
				return Object.keys(localStorageStore).length;
			},
			key: (index: number) => Object.keys(localStorageStore)[index] ?? null,
		});
	}
}

stubLocalStorageIfMissing();

beforeEach(() => {
	stubLocalStorageIfMissing();
});

afterEach(() => {
	cleanup();
	if (typeof globalThis.localStorage !== "undefined" && globalThis.localStorage?.clear) {
		globalThis.localStorage.clear();
	}
});
