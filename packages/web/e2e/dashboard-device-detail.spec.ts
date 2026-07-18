import { expect, test } from "@playwright/test";
import { DEVICE_LABEL, openAuthenticatedDashboard } from "./fixtures.ts";

test("dashboard opens a device detail page with channel readings", async ({ page }) => {
	await openAuthenticatedDashboard(page);

	await page.getByRole("link", { name: DEVICE_LABEL }).click();

	await expect(page.getByRole("heading", { name: DEVICE_LABEL })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Channels" })).toBeVisible();
	const channels = page.getByLabel("Channels");
	await expect(channels.getByText("Pit")).toBeVisible();
	await expect(channels.getByText("225.0°F")).toBeVisible();
	await expect(channels.getByText("Food")).toBeVisible();
	await expect(channels.getByText("165.0°F")).toBeVisible();
});
