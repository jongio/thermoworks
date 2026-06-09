import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

	it("has at least two icon sizes", () => {
		expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

		const sizes = manifest.icons.map(
			(i: { sizes: string }) => i.sizes,
		);
		expect(sizes).toContain("192x192");
		expect(sizes).toContain("512x512");
	});

	it("every icon has src and type", () => {
		for (const icon of manifest.icons) {
			expect(icon.src).toBeTruthy();
			expect(icon.type).toBeTruthy();
		}
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
});

describe("service worker registration", () => {
	const main = readFileSync(
		resolve(WEB_ROOT, "src", "main.tsx"),
		"utf-8",
	);

	it("checks for serviceWorker support before registering", () => {
		expect(main).toContain('"serviceWorker" in navigator');
	});

	it("calls navigator.serviceWorker.register", () => {
		expect(main).toContain("navigator.serviceWorker.register");
	});
});
