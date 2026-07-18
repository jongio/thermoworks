import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "jsdom",
		pool: "threads",
		maxWorkers: 4,
		exclude: [...configDefaults.exclude, "e2e/**"],
		setupFiles: ["./tests/setup.ts"],
		exclude: [...configDefaults.exclude, "e2e/**"],
	},
});
