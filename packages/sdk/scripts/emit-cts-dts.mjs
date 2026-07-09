// Mirror the tsc-emitted `.d.ts` declaration files to `.d.cts` so the package's
// `require` export condition (types: ./dist/index.d.cts) resolves. Node/TS map
// `.js` specifiers in a `.d.cts` file to sibling `.d.cts` files, so every
// emitted declaration needs a `.d.cts` twin. This replaces tsup's bundled dts
// output, which relies on rollup-plugin-dts (incompatible with the TypeScript 7
// native compiler API).
import { copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const distDir = join(import.meta.dirname, "..", "dist");

for (const file of readdirSync(distDir)) {
	if (file.endsWith(".d.ts")) {
		copyFileSync(join(distDir, file), join(distDir, file.replace(/\.d\.ts$/, ".d.cts")));
	}
}
