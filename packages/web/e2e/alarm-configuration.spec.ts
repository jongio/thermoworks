import { expect, test } from "@playwright/test";
import { DEVICE_LABEL, openAuthenticatedDashboard } from "./fixtures.ts";

test("alarm configuration saves and reloads from the mocked cloud API", async ({ page }) => {
	await openAuthenticatedDashboard(page);
	await page.getByRole("link", { name: DEVICE_LABEL }).click();

	await page.getByLabel("Configure alarm for Pit").click();
	await page.getByLabel("High alarm").check();
	await page.getByLabel("High alarm temperature").fill("275");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("dialog", { name: "Alarm Settings" })).toBeHidden();

	await page.getByLabel("Configure alarm for Pit").click();
	await expect(page.getByRole("checkbox", { name: "High alarm" })).toBeChecked();
	await expect(page.getByLabel("High alarm temperature")).toHaveValue("275");
});
