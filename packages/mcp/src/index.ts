export { createServer, startServer } from "./server.js";

import { startServer } from "./server.js";

startServer().catch((error: unknown) => {
	console.error("Fatal error starting MCP server:", error);
	process.exit(1);
});
