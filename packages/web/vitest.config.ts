import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "jsdom",
		pool: "threads",
		maxWorkers: 4,
		setupFiles: ["./tests/setup.ts"],
	},
});
