import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dir = dirname(fileURLToPath(import.meta.url));

// Builds the chart webview into dist/webview as a single self-contained webview.js +
// webview.css (IIFE, no dynamic imports) so the extension can inject them under a strict
// CSP without loading any remote/CDN scripts.
export default defineConfig({
	plugins: [react()],
	build: {
		outDir: "dist/webview",
		emptyOutDir: true,
		target: "es2022",
		cssCodeSplit: false,
		sourcemap: false,
		rollupOptions: {
			input: resolve(dir, "webview/main.tsx"),
			output: {
				format: "iife",
				entryFileNames: "webview.js",
				assetFileNames: "webview.[ext]",
				inlineDynamicImports: true,
			},
		},
	},
});
