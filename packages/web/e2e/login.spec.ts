import { expect, test } from "@playwright/test";
import { DEVICE_LABEL, mockThermoworksCloud } from "./fixtures.ts";

test("login flow shows credential errors and signs in with valid credentials", async ({ page }) => {
	await mockThermoworksCloud(page);
	await page.addInitScript(() => window.localStorage.setItem("thermoworks-onboarding-complete", "true"));

	await page.goto("/", { waitUntil: "domcontentloaded" });
	await page.getByRole("button", { name: "Sign In to Dashboard" }).click();

	await page.getByLabel("Email").fill("e2e@example.com");
	await page.getByLabel("Password").fill("wrong-password");
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page.getByRole("alert")).toHaveText("Invalid email or password.");

	await page.getByLabel("Password").fill("correct-password");
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page.getByRole("link", { name: DEVICE_LABEL })).toBeVisible();
});
