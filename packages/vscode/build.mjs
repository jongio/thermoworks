import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const vendorDest = join(__dirname, "dist", "vendor", "@github", "keytar");

// 0. Build the React/recharts chart webview (Vite -> dist/webview/webview.js + webview.css)
execSync("npx vite build --config vite.webview.config.ts", { stdio: "inherit", cwd: __dirname });

// 1. Bundle with esbuild (keytar externalized since it's native)
execSync(
	"npx esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --external:@github/keytar --format=cjs --platform=node --sourcemap",
	{ stdio: "inherit", cwd: __dirname },
);

// 2. Copy keytar into dist/vendor so it ships with the VSIX
const require = createRequire(import.meta.url);
const keytarSource = dirname(require.resolve("@github/keytar/package.json"));

rmSync(vendorDest, { recursive: true, force: true });
mkdirSync(dirname(vendorDest), { recursive: true });
cpSync(keytarSource, vendorDest, { recursive: true });

// 3. Patch the import in the bundle to point at the vendor path
const bundlePath = join(__dirname, "dist", "extension.js");
let bundle = readFileSync(bundlePath, "utf8");
bundle = bundle.replace(
	/require\(["']@github\/keytar["']\)/g,
	'require("./vendor/@github/keytar")',
);
bundle = bundle.replace(
	/import\(["']@github\/keytar["']\)/g,
	'Promise.resolve(require("./vendor/@github/keytar"))',
);
writeFileSync(bundlePath, bundle, "utf8");

console.log("✓ keytar vendored into dist/vendor/@github/keytar");
