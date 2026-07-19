import { expect, type Locator, type Page, test } from "@playwright/test";
import { DEVICE_LABEL, DEVICE_SERIAL, mockThermoworksCloud, seedAuthenticatedSession } from "./fixtures.ts";

type Theme = "light" | "dark";

const pages = [
	{
		name: "dashboard",
		path: "/",
		ready: async (page: Page) => page.getByRole("heading", { name: "Dashboard" }),
	},
	{
		name: "device-detail",
		path: `/device/${DEVICE_SERIAL}`,
		ready: async (page: Page) => page.getByRole("heading", { name: DEVICE_LABEL }),
	},
	{
		name: "settings",
		path: "/settings",
		ready: async (page: Page) => page.getByRole("heading", { name: "Settings" }),
	},
	{
		name: "guide",
		path: "/guide",
		ready: async (page: Page) => page.getByRole("heading", { name: "Temperature Guide" }),
	},
] as const;

const themes: Theme[] = ["light", "dark"];

test.describe("visual regression snapshots", () => {
	for (const theme of themes) {
		for (const visualPage of pages) {
			test(`${visualPage.name} matches ${theme} theme baseline`, async ({ page }) => {
				await openVisualRoute(page, visualPage.path, theme);
				await expect(await visualPage.ready(page)).toBeVisible({ timeout: 30_000 });
				await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
				await waitForVisualStability(page, visualPage.name);

				await expect(page).toHaveScreenshot(`${visualPage.name}-${theme}.png`, {
					animations: "disabled",
					fullPage: true,
					mask: volatileMasks(page),
				});
			});
		}
	}
});

async function openVisualRoute(page: Page, path: string, theme: Theme) {
	// Freeze the clock so time-relative UI (cook-report duration, chart time axis)
	// renders identically across runs; the mock fixtures use fixed timestamps near this time.
	await page.clock.setFixedTime(new Date("2026-07-17T20:00:00.000Z"));
	await page.emulateMedia({ colorScheme: theme });
	await page.addInitScript((mode) => {
		window.localStorage.setItem("thermoworks-theme", mode);
		document.documentElement.classList.remove("light", "dark");
		document.documentElement.classList.add(mode);
	}, theme);
	await mockThermoworksCloud(page);
	await seedAuthenticatedSession(page);
	await page.goto(`/#${path}`, { waitUntil: "domcontentloaded" });
}

async function waitForVisualStability(page: Page, pageName: string) {
	if (pageName === "device-detail") {
		await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
		await expect(page.getByTestId("cook-report-summary")).toBeVisible({ timeout: 30_000 });
	}
	await page.evaluate(() => document.fonts.ready);
}

function volatileMasks(page: Page): Locator[] {
	return [
		page.locator(".tabular-nums"),
		page.locator(".recharts-wrapper"),
		page.locator("[data-testid='annotation-marker-layer']"),
		page.getByText(/Updated \d{1,2}:\d{2}:\d{2}/),
	];
}
