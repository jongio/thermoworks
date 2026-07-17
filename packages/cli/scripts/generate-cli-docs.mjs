import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { renderCliReference } from "../dist/command-registry.js";

const docsPath = resolve(process.cwd(), "..", "..", "docs", "cli-reference.md");
await writeFile(docsPath, renderCliReference(), "utf8");
process.exit(0);
