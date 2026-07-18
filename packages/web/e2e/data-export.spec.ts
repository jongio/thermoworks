import { expect, test } from "@playwright/test";
import { DEVICE_LABEL, openAuthenticatedDashboard } from "./fixtures.ts";

test("temperature history can be exported as a CSV download", async ({ page }) => {
	await openAuthenticatedDashboard(page);
	await page.getByRole("link", { name: DEVICE_LABEL }).click();

	const csvButton = page
		.getByRole("region", { name: "Sessions" })
		.getByRole("button", { name: "CSV" })
		.first();
	await expect(csvButton).toBeEnabled();

	const downloadPromise = page.waitForEvent("download");
	await csvButton.click();
	const download = await downloadPromise;

	expect(download.suggestedFilename()).toBe("temperature-data.csv");
});
