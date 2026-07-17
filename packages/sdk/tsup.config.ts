import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/testing/index.ts"],
	format: ["esm", "cjs"],
	// Declarations are emitted by `tsc` (see build script) because tsup's
	// rollup-plugin-dts bundler is incompatible with the TypeScript 7 native
	// compiler API.
	dts: false,
	splitting: false,
	sourcemap: true,
	clean: true,
	target: "node18",
});
