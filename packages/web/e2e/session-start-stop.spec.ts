import { expect, test } from "@playwright/test";
import { openAuthenticatedDashboard } from "./fixtures.ts";

test("session controls start and stop a named cook session", async ({ page }) => {
	await openAuthenticatedDashboard(page);

	await page.getByPlaceholder("Session label (optional)").fill("Brisket cook");
	await page.getByRole("button", { name: "Start Session" }).click();

	await expect(page.getByText("- Brisket cook")).toBeVisible();
	await expect(page.getByLabel("Session elapsed time")).toBeVisible();

	await page.getByRole("button", { name: "End" }).click();
	await page.getByRole("button", { name: "Confirm" }).click();

	await expect(page.getByRole("button", { name: "Start Session" })).toBeVisible();
});
