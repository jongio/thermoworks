import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	dts: false,
	splitting: false,
	sourcemap: true,
	clean: true,
	target: "node18",
	// thermoworks-mcp is an internal (unpublished) workspace library; bundle it
	// into the CLI so `npm install -g thermoworks` doesn't need it from npm.
	noExternal: ["thermoworks-mcp"],
	banner: {
		js: "#!/usr/bin/env node",
	},
});
