import { expect, test } from "@playwright/test";
import { DEVICE_LABEL, openAuthenticatedDashboard } from "./fixtures.ts";

test("dashboard opens a device detail page with channel readings", async ({ page }) => {
	await openAuthenticatedDashboard(page);

	await page.getByRole("link", { name: DEVICE_LABEL }).click();

	await expect(page.getByRole("heading", { name: DEVICE_LABEL })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Channels" })).toBeVisible();
	await expect(page.getByText("Pit")).toBeVisible();
	await expect(page.getByText("225.0°F")).toBeVisible();
	await expect(page.getByText("Food")).toBeVisible();
	await expect(page.getByText("165.0°F")).toBeVisible();
});
