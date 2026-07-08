import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	// Declarations are emitted by `tsc` (see build script) because tsup's
	// rollup-plugin-dts bundler is incompatible with the TypeScript 7 native
	// compiler API.
	dts: false,
	splitting: false,
	sourcemap: true,
	clean: true,
	target: "node18",
	banner: {
		js: "#!/usr/bin/env node",
	},
});
