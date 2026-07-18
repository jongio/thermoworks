import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Route, test } from "@playwright/test";
import { DEVICE_LABEL, DEVICE_SERIAL, mockThermoworksCloud, seedAuthenticatedSession } from "./fixtures.ts";

const WCAG_21_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const authenticatedRoutes = [
	{ name: "Dashboard", path: "/", ready: async (page: Page) => page.getByRole("heading", { name: "Dashboard" }) },
	{ name: "Devices", path: "/devices", ready: async (page: Page) => page.getByRole("heading", { name: "Devices" }) },
	{
		name: "Compare",
		path: "/compare",
		ready: async (page: Page) => page.getByRole("heading", { name: "Compare channels" }),
	},
	{
		name: "Device detail",
		path: `/device/${DEVICE_SERIAL}`,
		ready: async (page: Page) => page.getByRole("heading", { name: DEVICE_LABEL }),
	},
	{ name: "Events", path: "/events", ready: async (page: Page) => page.getByRole("heading", { name: "Activity" }) },
	{ name: "Data usage", path: "/usage", ready: async (page: Page) => page.getByRole("heading", { name: "Data Usage" }) },
	{
		name: "Guide",
		path: "/guide",
		ready: async (page: Page) => page.getByRole("heading", { name: "Temperature Guide" }),
	},
	{ name: "Settings", path: "/settings", ready: async (page: Page) => page.getByRole("heading", { name: "Settings" }) },
	{
		name: "Export schedules",
		path: "/exports",
		ready: async (page: Page) => page.getByRole("heading", { name: "Export Schedules" }),
	},
	{ name: "Pit display", path: "/pit", ready: async (page: Page) => page.getByLabel("Exit pit display") },
];

const publicRoutes = [
	{
		name: "Shared device",
		path: `/share/device/${DEVICE_SERIAL}`,
		ready: async (page: Page) => page.getByRole("heading", { name: DEVICE_LABEL }),
	},
	{
		name: "Shared archive",
		path: `/share/archive/${DEVICE_SERIAL}/session-1`,
		ready: async (page: Page) => page.getByRole("heading", { name: "Brisket session" }),
	},
	{
		name: "Shared report",
		path: `/share/report?data=${createReportPayload()}`,
		ready: async (page: Page) => page.getByRole("heading", { name: "Cook report" }),
	},
];

test.describe("WCAG 2.1 AA accessibility", () => {
	test.describe.configure({ mode: "serial" });

	for (const route of authenticatedRoutes) {
		test(`${route.name} has no axe violations`, async ({ page }) => {
			await openAuthenticatedRoute(page, route.path);
			await expect(await route.ready(page)).toBeVisible({ timeout: 30_000 });
			await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
			await expectNoAxeViolations(page);
		});
	}

	for (const route of publicRoutes) {
		test(`${route.name} has no axe violations`, async ({ page }) => {
			await mockPublicShareData(page);
			await page.goto(`/#${route.path}`, { waitUntil: "domcontentloaded" });
			await expect(await route.ready(page)).toBeVisible({ timeout: 30_000 });
			await expectNoAxeViolations(page);
		});
	}

	test("unauthenticated landing and login screens have no axe violations", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("heading", { name: "ThermoWorks Tools" })).toBeVisible();
		await expectNoAxeViolations(page);

		await page.getByRole("button", { name: /sign in/i }).click();
		await expect(page.getByRole("heading", { name: "ThermoWorks Dashboard" })).toBeVisible();
		await expectNoAxeViolations(page);
	});

	test("keyboard users can skip to main content and operate custom controls", async ({ page }) => {
		await openAuthenticatedRoute(page, "/settings");
		await expect(page.locator("#main-content")).toBeFocused();

		await page.getByRole("link", { name: "Skip to main content" }).focus();
		await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(page.locator("#main-content")).toBeFocused();

		await page.goto("/#/device/SIGNALS-001", { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("heading", { name: DEVICE_LABEL })).toBeVisible();
		await page.getByRole("button", { name: "6 Hours" }).focus();
		await page.keyboard.press("Enter");
		await expect(page.getByRole("button", { name: "6 Hours" })).toHaveAttribute("aria-pressed", "true");
		await page.getByRole("checkbox", { name: "Show event markers" }).first().focus();
		await page.keyboard.press("Space");
		await expect(page.getByRole("checkbox", { name: "Show event markers" }).first()).not.toBeChecked();
	});
});

async function openAuthenticatedRoute(page: Page, path: string) {
	await mockThermoworksCloud(page);
	await seedAuthenticatedSession(page);
	await page.goto(`/#${path}`, { waitUntil: "domcontentloaded" });
}

async function expectNoAxeViolations(page: Page) {
	const results = await new AxeBuilder({ page }).withTags(WCAG_21_AA_TAGS).analyze();
	expect(results.violations).toEqual([]);
}

async function mockPublicShareData(page: Page) {
	await page.route("**/api/**", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const path = url.pathname;
		if (path.includes("/api/firebase/v1alpha/projects/-/apps/")) {
			await json(route, { projectId: "e2e-project" });
			return;
		}
		if (path.includes(`/documents/devices/${DEVICE_SERIAL}/channels/1`)) {
			await json(route, { fields: channelFields() });
			return;
		}
		if (path.includes(`/documents/devices/${DEVICE_SERIAL}/channels/`)) {
			await json(route, {}, 404);
			return;
		}
		if (path.includes(`/documents/devices/${DEVICE_SERIAL}/archive/session-1`)) {
			await json(route, { fields: archiveFields() });
			return;
		}
		if (path.includes(`/documents/devices/${DEVICE_SERIAL}`)) {
			await json(route, { fields: deviceFields() });
			return;
		}
		await json(route, {}, 404);
	});
}

function json(route: Route, body: unknown, status = 200) {
	return route.fulfill({
		status,
		contentType: "application/json",
		body: JSON.stringify(body),
	});
}

function s(value: string) {
	return { stringValue: value };
}

function n(value: number) {
	return { doubleValue: value };
}

function b(value: boolean) {
	return { booleanValue: value };
}

function t(value: string) {
	return { timestampValue: value };
}

function deviceFields() {
	return {
		serial: s(DEVICE_SERIAL),
		deviceId: s(DEVICE_SERIAL),
		label: s(DEVICE_LABEL),
		type: s("Signals"),
		status: s("online"),
		battery: n(88),
		wifiStrength: n(-47),
		public: b(true),
	};
}

function channelFields() {
	return {
		number: s("1"),
		label: s("Pit"),
		value: n(225),
		units: s("F"),
		status: s("ok"),
		enabled: b(true),
		lastSeen: t("2026-07-17T19:30:00.000Z"),
	};
}

function archiveFields() {
	return {
		id: s("session-1"),
		label: s("Brisket session"),
		deviceLabel: s(DEVICE_LABEL),
		start: t("2026-07-17T19:00:00.000Z"),
		end: t("2026-07-17T20:00:00.000Z"),
		createdOn: t("2026-07-17T20:00:00.000Z"),
		count: n(3),
		public: b(true),
		channels: {
			arrayValue: {
				values: [
					{
						mapValue: {
							fields: {
								...channelFields(),
								recentReadings: {
									arrayValue: {
										values: [
											{
												mapValue: {
													fields: { v: n(225), ts: t("2026-07-17T19:30:00.000Z"), u: s("F") },
												},
											},
										],
									},
								},
							},
						},
					},
				],
			},
		},
	};
}

function createReportPayload() {
	const payload = {
		archive: {
			id: "session-1",
			label: "Brisket session",
			deviceLabel: DEVICE_LABEL,
			start: "2026-07-17T19:00:00.000Z",
			end: "2026-07-17T20:00:00.000Z",
			createdOn: "2026-07-17T20:00:00.000Z",
			count: 3,
			channels: [
				{
					number: "1",
					label: "Pit",
					value: 225,
					units: "F",
					enabled: true,
					recentReadings: [
						{ value: 225, timestamp: "2026-07-17T19:30:00.000Z", units: "F" },
						{ value: 230, timestamp: "2026-07-17T19:31:00.000Z", units: "F" },
					],
				},
			],
		},
		annotations: [
			{
				id: "wrap",
				timestamp: "2026-07-17T19:30:00.000Z",
				label: "Wrapped brisket",
				note: "Moved to foil pan.",
			},
		],
		targetTemp: 203,
		targetTolerance: 2,
	};
	return btoa(JSON.stringify(payload)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
