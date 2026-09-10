import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		pool: "threads",
		testTimeout: 30_000,
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/extension.ts"],
		},
	},
});
