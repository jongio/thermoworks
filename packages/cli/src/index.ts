import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";

import { account } from "./commands/account.js";
import { alarmClear, alarmList, alarmSet } from "./commands/alarm.js";
import { archives, parseArchivesArgs } from "./commands/archives.js";
import { authLogin, authLogout, authStatus } from "./commands/auth.js";
import { backup } from "./commands/backup.js";
import { calibration } from "./commands/calibration.js";
import { completion } from "./commands/completion.js";
import {
	copilotRemove,
	copilotSetup,
	copilotSetupDemo,
	copilotStatus,
	copilotStatusDemo,
	nextDemoState,
} from "./commands/copilot.js";
import { dataUsage } from "./commands/data-usage.js";
import { device } from "./commands/device.js";
import { devices, parseDevicesArgs } from "./commands/devices.js";
import { events, parseEventsArgs } from "./commands/events.js";
import { exportData } from "./commands/export.js";
import { fan } from "./commands/fan.js";
import { firmware } from "./commands/firmware.js";
import { graph } from "./commands/graph.js";
import { guide } from "./commands/guide.js";
import { history } from "./commands/history.js";
import { journal } from "./commands/journal.js";
import { mcpStart } from "./commands/mcp.js";
import { metrics } from "./commands/metrics.js";
import { notifications } from "./commands/notifications.js";
import { plan } from "./commands/plan.js";
import { search } from "./commands/search.js";
import { session } from "./commands/session.js";
import { parseStatsArgs, stats } from "./commands/stats.js";
import { temp } from "./commands/temp.js";
import { watch } from "./commands/watch.js";
import { parseGlobalFlags } from "./output.js";

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

  alarm set        Set alarm thresholds on a device channel
  alarm clear      Clear alarm thresholds on a device channel
  alarm list       List configured alarm thresholds (all devices or one SERIAL)

  calibration <SERIAL>  Show NIST-traceable calibration data for a device

  copilot setup    Configure Copilot CLI statusline (wizard)
  copilot status   Show configured temperature reading
  copilot remove   Remove statusline configuration

  data-usage       Show account data storage usage
    --by-device    Show per-device breakdown

  notifications    Show account notification settings
    --enable FIELD   Enable a setting (all, continuous, email, sms, device)
    --disable FIELD  Disable a setting (all, continuous, email, sms, device)

  account          Show account details and billing plan

  devices          List connected devices and channel readings
    --active-within N  Only devices seen within N minutes

  temp <SERIAL>    Print a single temperature value for scripting
    --channel N    Read a specific channel (1-9) instead of the average
  device rename <SERIAL> --name <TEXT>        Rename a device
  device reset-minmax <SERIAL> --channel <N>  Reset min/max readings for a channel
  mcp start        Start MCP server for AI assistants
  watch            Continuously monitor temperatures (live refresh)
    --device SN    Watch a specific device by serial number
    --interval N   Refresh interval in seconds (default: 10)

  metrics          Serve live temperatures as Prometheus metrics on /metrics
    --host HOST    Bind address (default: 127.0.0.1)
    --port N       Listen port (default: 9464)
    --device SN    Export a specific device by serial number
    --interval N   Poll interval in seconds (default: 10)
  events           Show device event history (alarms, status changes)
  archives <serial>  List archived sessions for a device
  stats <serial>   Show cross-session cook analytics for a device

  firmware         Show firmware versions and available updates

  fan <SERIAL>     Show fan controller state
  fan set <SERIAL> --target <temp>  Set fan target temperature
  fan enable <SERIAL>   Enable fan controller
  fan disable <SERIAL>  Disable fan controller

  search <query>   Full-text search across devices
    --collection C Search collection: device, accounts, or users (default: device)
    --limit N      Max results to return (default: 20, max: 100)

  session start    Start a monitoring session (--label TEXT)
  session end      End an active monitoring session
  session status   Show devices with an active session (all or one SERIAL)
  session clear    Clear session data (--yes to skip confirmation)

  export SERIAL    Export archive readings to CSV or JSON
    --archive ID   Export a specific archive (default: latest)
    --format FMT   Output format: csv or json (default: json)
    --output PATH  Write to file (default: stdout)

  backup [SERIAL]  Bulk-export archived sessions to a directory
    --output DIR   Directory to write files (default: thermoworks-backup)
    --format FMT   Output format: csv or json (default: json)
    --limit N      Max archives to export per device (default: 20)

  history <SERIAL> Export historical time-series readings (BigQuery)
    --limit N      Show the N most recent readings
    --format FMT   Output format: table, csv, or json (default: table)
    --output PATH  Write to file (default: stdout)

  graph <SERIAL>   Draw a temperature chart in the terminal
    --archive ID   Chart a saved archive instead of recent history
    --channel N    Archive channel to chart (default: first with readings)
    --width N      Chart width in columns (default: 60)
    --height N     Chart height in rows (default: 12)

  guide [category] Show temperature guide (safe cooking temps)

  journal add      Log a finished cook to a local logbook
  journal list     List logbook entries (newest first)
  journal show <id>  Show one logbook entry
  journal rm <id>  Remove a logbook entry

  plan             Back-calculate cook start times for a target ready time
    --ready TIME   When everything should be ready (e.g. "6:00 PM")
    --item SPEC    Add an item: NAME, NAME=WEIGHT (lb), or NAME=Nh (hours)
    --list-meats   Show built-in meat profiles

  completion <SHELL>  Print a shell completion script (bash, zsh, fish, powershell)

  demo <mode>      Show demo output (modes: high, low, normal)

Options:
  --json           Output machine-readable JSON (for scripting)
  --no-channels    Hide channel readings in devices output
  --help, -h       Show this help message
  --version, -v    Show version`);
}

async function main(): Promise<void> {
	const rawArgs = process.argv.slice(2);
	const { options, remaining: args } = parseGlobalFlags(rawArgs);
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
					await authStatus(options);
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

		case "alarm":
			switch (subcommand) {
				case "set":
					await alarmSet(args.slice(2), options);
					break;
				case "clear":
					await alarmClear(args.slice(2), options);
					break;
				case "list":
					await alarmList(args.slice(2), options);
					break;
				default:
					console.error(
						subcommand
							? `Unknown alarm command: ${subcommand}`
							: "Usage: thermoworks alarm <set|clear|list>",
					);
					process.exit(1);
			}
			break;

		case "copilot":
			switch (subcommand) {
				case "setup":
					if (args.includes("--demo")) {
						await copilotSetupDemo();
					} else {
						await copilotSetup(args.includes("--dev"));
					}
					break;
				case "status":
					if (args.includes("--demo")) {
						await copilotStatusDemo(await nextDemoState());
					} else {
						await copilotStatus();
					}
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

		case "mcp":
			switch (subcommand) {
				case "start":
					await mcpStart();
					break;
				default:
					console.error(
						subcommand ? `Unknown mcp command: ${subcommand}` : "Usage: thermoworks mcp <start>",
					);
					process.exit(1);
			}
			break;

		case "data-usage":
			await dataUsage(args.slice(1), options);
			break;

		case "notifications":
			await notifications(args.slice(1), options);
			break;

		case "account":
			await account(options);
			break;

		case "device":
			await device(args.slice(1), options);
			break;

		case "devices": {
			await devices(parseDevicesArgs(args.slice(1), options));
			break;
		}

		case "watch":
			await watch(args.slice(1), options);
			break;

		case "metrics":
			await metrics(args.slice(1), options);
			break;

		case "events": {
			const eventArgs = parseEventsArgs(args.slice(1));
			await events(eventArgs, options);
			break;
		}

		case "archives": {
			const archivesArgs = parseArchivesArgs(args);
			if (!archivesArgs) {
				console.error("Usage: thermoworks archives <serial> [--id ID] [--limit N] [--json]");
				process.exit(1);
			}
			await archives(archivesArgs, options);
			break;
		}

		case "stats": {
			const statsArgs = parseStatsArgs(args);
			if (!statsArgs) {
				console.error("Usage: thermoworks stats <serial> [--limit N] [--json]");
				process.exit(1);
			}
			await stats(statsArgs, options);
			break;
		}

		case "firmware": {
			const deviceFlag = args.includes("--device") ? args[args.indexOf("--device") + 1] : undefined;
			await firmware(options, deviceFlag);
			break;
		}

		case "search":
			await search(args.slice(1), options);
			break;

		case "session":
			await session(args.slice(1), options);
			break;

		case "export":
			await exportData(args);
			break;

		case "backup":
			await backup(args, options);
			break;

		case "history":
			await history(args.slice(1), options);
			break;

		case "graph":
			await graph(args.slice(1), options);
			break;

		case "fan":
			await fan(args.slice(1), options);
			break;

		case "guide":
			await guide(args[1], options);
			break;

		case "journal":
			await journal(args.slice(1), options);
			break;

		case "plan":
			await plan(args.slice(1), options);
			break;

		case "calibration":
			await calibration(args[1], options);
			break;

		case "completion":
			await completion(args[1], options);
			break;

		case "temp":
			await temp(args.slice(1), options);
			break;

		case "demo": {
			const mode = args[1];
			if (mode !== "high" && mode !== "low" && mode !== "normal") {
				console.error("Usage: thermoworks demo <high|low|normal>");
				process.exit(1);
			}
			await copilotStatusDemo(mode === "normal" ? "none" : mode);
			break;
		}

		case "--version":
		case "-v": {
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
