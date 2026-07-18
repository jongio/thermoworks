import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const WEB_ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = resolve(WEB_ROOT, "public");

describe("PWA manifest", () => {
	const raw = readFileSync(resolve(PUBLIC_DIR, "manifest.json"), "utf-8");
	const manifest = JSON.parse(raw);

	it("has required name fields", () => {
		expect(manifest.name).toBe("ThermoWorks Dashboard");
		expect(manifest.short_name).toBe("ThermoWorks");
	});

	it("has start_url for relative base path", () => {
		expect(manifest.start_url).toBe("./");
	});

	it("uses standalone display mode", () => {
		expect(manifest.display).toBe("standalone");
	});

	it("declares theme and background colors", () => {
		expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);
		expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
	});

	it("has the full favicon and PWA icon set", () => {
		expect(manifest.icons.length).toBeGreaterThanOrEqual(5);

		const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
		expect(sizes).toContain("16x16");
		expect(sizes).toContain("32x32");
		expect(sizes).toContain("192x192");
		expect(sizes).toContain("512x512");
	});

	it("every icon has src and type", () => {
		for (const icon of manifest.icons) {
			expect(icon.src).toBeTruthy();
			expect(icon.type).toBeTruthy();
		}
	});

	it("marks installable PNG icons as maskable", () => {
		const installIcons = manifest.icons.filter(
			(icon: { type: string; sizes: string }) =>
				icon.type === "image/png" && (icon.sizes === "192x192" || icon.sizes === "512x512"),
		);

		expect(installIcons).toHaveLength(2);
		for (const icon of installIcons) {
			expect(icon.purpose).toContain("maskable");
		}
	});

	it("ships generated PNG favicon assets", () => {
		expect(existsSync(resolve(PUBLIC_DIR, "favicon-16x16.png"))).toBe(true);
		expect(existsSync(resolve(PUBLIC_DIR, "favicon-32x32.png"))).toBe(true);
	});
});

describe("index.html PWA meta tags", () => {
	const html = readFileSync(resolve(WEB_ROOT, "index.html"), "utf-8");

	it("includes manifest link", () => {
		expect(html).toContain('<link rel="manifest"');
	});

	it("includes theme-color meta", () => {
		expect(html).toContain('name="theme-color"');
	});

	it("includes apple-mobile-web-app-capable meta", () => {
		expect(html).toContain('name="apple-mobile-web-app-capable"');
	});

	it("viewport includes viewport-fit=cover", () => {
		expect(html).toContain("viewport-fit=cover");
	});

	it("includes apple-touch-icon link", () => {
		expect(html).toContain('rel="apple-touch-icon"');
	});

	it("includes size-specific PNG favicon links", () => {
		expect(html).toContain('href="favicon-32x32.png"');
		expect(html).toContain('href="favicon-16x16.png"');
	});
});

describe("service worker", () => {
	const sw = readFileSync(resolve(PUBLIC_DIR, "sw.js"), "utf-8");

	it("handles install event", () => {
		expect(sw).toContain('addEventListener("install"');
	});

	it("handles activate event with old cache cleanup", () => {
		expect(sw).toContain('addEventListener("activate"');
		expect(sw).toContain("caches.keys()");
	});

	it("handles fetch event with network-first strategy", () => {
		expect(sw).toContain('addEventListener("fetch"');
		expect(sw).toContain("fetch(request)");
		expect(sw).toContain("caches.match");
	});

	it("skips API requests to avoid serving stale data", () => {
		expect(sw).toContain("/api/");
	});

	it("defines a versioned cache name", () => {
		expect(sw).toMatch(/CACHE_NAME\s*=\s*["']thermoworks-v\d+["']/);
	});

	it("shows a notification with push payload data", async () => {
		interface PushEvent {
			readonly data: {
				json: () => unknown;
				text: () => string;
			};
			waitUntil: (promise: Promise<void>) => void;
		}

		type ServiceWorkerListener = (event: PushEvent) => void;
		const listeners: Partial<Record<string, ServiceWorkerListener>> = {};
		const showNotification = vi.fn().mockResolvedValue(undefined);
		const pending: Array<Promise<void>> = [];

		vm.runInNewContext(sw, {
			self: {
				addEventListener: (type: string, listener: ServiceWorkerListener) => {
					listeners[type] = listener;
				},
				clients: { claim: vi.fn() },
				registration: { showNotification },
				skipWaiting: vi.fn(),
			},
			caches: {},
			fetch: vi.fn(),
		});

		listeners.push?.({
			data: {
				json: () => ({ title: "High alarm", body: "Probe is above 200°F", tag: "alarm-1" }),
				text: () => "",
			},
			waitUntil: (promise: Promise<void>) => pending.push(promise),
		});
		await Promise.all(pending);

		expect(showNotification).toHaveBeenCalledWith(
			"High alarm",
			expect.objectContaining({
				body: "Probe is above 200°F",
				icon: "./favicon.svg",
				tag: "alarm-1",
			}),
		);
	});
});

describe("service worker registration", () => {
	const main = readFileSync(resolve(WEB_ROOT, "src", "main.tsx"), "utf-8");

	it("checks for serviceWorker support before registering", () => {
		expect(main).toContain('"serviceWorker" in navigator');
	});

	it("calls navigator.serviceWorker.register", () => {
		expect(main).toContain("navigator.serviceWorker.register");
	});
});
