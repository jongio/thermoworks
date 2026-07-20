import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		pool: "threads",
		// Run test files serially outside CI. On some machines (notably Node 26),
		// parallel worker threads thrash the transform pipeline when a file pulls in
		// a large import graph (registry.test.ts imports every command module plus
		// the SDK), inflating import time past testTimeout and causing spurious,
		// order-dependent failures in unrelated files. CI runners handle the
		// parallelism fine, so keep it fast there.
		fileParallelism: Boolean(process.env.CI),
		testTimeout: 10_000,
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov"],
			include: ["src/**/*.ts"],
			exclude: ["src/index.ts"],
		},
	},
});
