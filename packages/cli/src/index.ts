import { stdout } from "node:process";

import { dispatchCommand, printVersion, renderTopLevelUsage } from "./command-registry.js";
import { parseGlobalFlags, setRedaction } from "./output.js";

process.on("SIGINT", () => {
	stdout.write("\n");
	process.exit(0);
});

function printUsage(): void {
	console.log(renderTopLevelUsage());
}

async function main(): Promise<void> {
	const rawArgs = process.argv.slice(2);
	const { options, remaining: args } = parseGlobalFlags(rawArgs);
	setRedaction(options.redact ?? false);
	const command = args[0];

	if (command === "--version" || command === "-v") {
		await printVersion();
		return;
	}

	if (command === "--help" || command === "-h" || command === undefined) {
		printUsage();
		return;
	}

	if (await dispatchCommand(args, options)) return;

	console.error(`Unknown command: ${command}\n`);
	printUsage();
	process.exit(1);
}

main().catch((err: Error) => {
	console.error(`Error: ${err.message}`);
	process.exit(1);
});
