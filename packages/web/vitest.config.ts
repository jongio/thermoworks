import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "jsdom",
		environmentOptions: {
			jsdom: {
				url: "http://localhost:4200/",
			},
		},
		pool: "vmThreads",
		maxWorkers: 4,
		setupFiles: ["./tests/setup.ts"],
		exclude: [...configDefaults.exclude, "e2e/**"],
	},
});
