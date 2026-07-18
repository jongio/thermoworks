import { defineConfig, devices } from "@playwright/test";

declare const process: { readonly argv: readonly string[] };

const visualOnly = process.argv.slice(2).some((arg) => arg === "visual");

export default defineConfig({
	testDir: "./e2e",
	testMatch: visualOnly ? /visual\.spec\.ts/ : undefined,
	testIgnore: visualOnly ? undefined : /visual\.spec\.ts/,
	fullyParallel: true,
	reporter: "list",
	use: {
		baseURL: "http://127.0.0.1:4200",
		trace: "on-first-retry",
	},
	webServer: {
		command: "pnpm dev --host 127.0.0.1",
		url: "http://127.0.0.1:4200",
		reuseExistingServer: true,
		timeout: 120_000,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
