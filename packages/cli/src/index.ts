import { stdout } from "node:process";

import { authLogin, authLogout, authStatus } from "./commands/auth.js";
import { copilotRemove, copilotSetup, copilotStatus } from "./commands/copilot.js";
import { devices } from "./commands/devices.js";

// Clean exit on Ctrl+C
process.on("SIGINT", () => {
	stdout.write("\n");
	process.exit(0);
});

function printUsage(): void {
	console.log(`Usage: thermoworks <command> [subcommand] [options]

Commands:
  auth login       Authenticate with ThermoWorks Cloud
  auth logout      Remove saved credentials
  auth status      Show current authentication status

  copilot setup    Configure Copilot CLI statusline (wizard)
  copilot status   Show configured temperature reading
  copilot remove   Remove statusline configuration

  devices          List connected devices

Options:
  --help, -h       Show this help message
  --version, -v    Show version`);
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const command = args[0];
	const subcommand = args[1];

	switch (command) {
		case "auth":
			switch (subcommand) {
				case "login":
					await authLogin();
					break;
				case "logout":
					await authLogout();
					break;
				case "status":
					await authStatus();
					break;
				default:
					console.error(
						subcommand
							? `Unknown auth command: ${subcommand}`
							: "Usage: thermoworks auth <login|logout|status>",
					);
					process.exit(1);
			}
			break;

		case "copilot":
			switch (subcommand) {
				case "setup":
					await copilotSetup(args.includes("--dev"));
					break;
				case "status":
					await copilotStatus();
					break;
				case "remove":
					await copilotRemove();
					break;
				default:
					console.error(
						subcommand
							? `Unknown copilot command: ${subcommand}`
							: "Usage: thermoworks copilot <setup|status|remove>",
					);
					process.exit(1);
			}
			break;

		case "devices":
			await devices();
			break;

		case "--version":
		case "-v": {
			const { readFile } = await import("node:fs/promises");
			const { fileURLToPath } = await import("node:url");
			const { dirname, join } = await import("node:path");
			const dir = dirname(fileURLToPath(import.meta.url));
			const pkg = JSON.parse(await readFile(join(dir, "..", "package.json"), "utf8"));
			console.log(pkg.version);
			break;
		}

		case "--help":
		case "-h":
		case undefined:
			printUsage();
			break;

		default:
			console.error(`Unknown command: ${command}\n`);
			printUsage();
			process.exit(1);
	}
}

main().catch((err: Error) => {
	console.error(`Error: ${err.message}`);
	process.exit(1);
});
