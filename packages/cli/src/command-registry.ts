import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { account } from "./commands/account.js";
import { alarmClear, alarmList, alarmSet } from "./commands/alarm.js";
import { alarmSuggest } from "./commands/alarm-suggest.js";
import { alerts } from "./commands/alerts.js";
import { archives, parseArchivesArgs } from "./commands/archives.js";
import { authLogin, authLogout, authStatus } from "./commands/auth.js";
import { backup } from "./commands/backup.js";
import { calibration } from "./commands/calibration.js";
import { carryover } from "./commands/carryover.js";
import { compare, parseCompareArgs } from "./commands/compare.js";
import { config } from "./commands/config.js";
import { convert } from "./commands/convert.js";
import { cooldown } from "./commands/cooldown.js";
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
import { doctor } from "./commands/doctor.js";
import { doneness } from "./commands/doneness.js";
import { eta } from "./commands/eta.js";
import { events, parseEventsArgs } from "./commands/events.js";
import { exportData } from "./commands/export.js";
import { fan } from "./commands/fan.js";
import { firmware } from "./commands/firmware.js";
import { graph } from "./commands/graph.js";
import { guide } from "./commands/guide.js";
import { history } from "./commands/history.js";
import { journal } from "./commands/journal.js";
import { label } from "./commands/label.js";
import { mcpStart } from "./commands/mcp.js";
import { metrics } from "./commands/metrics.js";
import { notifications } from "./commands/notifications.js";
import { open } from "./commands/open.js";
import { placement } from "./commands/placement.js";
import { plan } from "./commands/plan.js";
import { replay } from "./commands/replay.js";
import { safe } from "./commands/safe.js";
import { search } from "./commands/search.js";
import { season } from "./commands/season.js";
import { session } from "./commands/session.js";
import { stability } from "./commands/stability.js";
import { stall } from "./commands/stall.js";
import { parseStatsArgs, stats } from "./commands/stats.js";
import { temp } from "./commands/temp.js";
import { timeline } from "./commands/timeline.js";
import { watch } from "./commands/watch.js";
import { wrap } from "./commands/wrap.js";
import type { OutputOptions } from "./output.js";

export interface CommandContext {
	readonly args: string[];
	readonly options: OutputOptions;
}

export type CommandHandler = (context: CommandContext) => Promise<void> | void;

export interface CommandField {
	readonly name: string;
	readonly description: string;
	readonly required?: boolean;
}

export interface CommandDefinition {
	readonly name: string;
	readonly summary: string;
	readonly usage: string;
	readonly usageLines: readonly string[];
	readonly aliases?: readonly string[];
	readonly subcommands?: readonly CommandDefinition[];
	readonly arguments?: readonly CommandField[];
	readonly options?: readonly CommandField[];
	readonly supportsJson: boolean;
	readonly completion?: readonly string[];
	readonly handler?: CommandHandler;
}

const json = { name: "--json", description: "Output machine-readable JSON." };
const serial = { name: "SERIAL", description: "Device serial number.", required: true };

function subcommands(
	commandName: string,
	definitions: readonly CommandDefinition[],
	usage: string,
): CommandHandler {
	return async ({ args, options }) => {
		const subcommand = args[1];
		const definition = definitions.find((candidate) => candidate.name === subcommand);
		if (!definition?.handler) {
			console.error(subcommand ? `Unknown ${commandName} command: ${subcommand}` : usage);
			process.exit(1);
			return;
		}
		await definition.handler({ args, options });
	};
}

const authCommands = [
	{
		name: "login",
		summary: "Authenticate with ThermoWorks Cloud",
		usage: "auth login",
		usageLines: ["auth login       Authenticate with ThermoWorks Cloud"],
		supportsJson: false,
		handler: () => authLogin(),
	},
	{
		name: "logout",
		summary: "Remove saved credentials",
		usage: "auth logout",
		usageLines: ["auth logout      Remove saved credentials"],
		supportsJson: false,
		handler: () => authLogout(),
	},
	{
		name: "status",
		summary: "Show current authentication status",
		usage: "auth status",
		usageLines: ["auth status      Show current authentication status"],
		supportsJson: true,
		handler: ({ options }: CommandContext) => authStatus(options),
	},
] as const satisfies readonly CommandDefinition[];

const alarmCommands = [
	{
		name: "set",
		summary: "Set alarm thresholds on a device channel",
		usage: "alarm set <SERIAL> --channel <1-9> [--high <temp>] [--low <temp>]",
		usageLines: ["alarm set        Set alarm thresholds on a device channel"],
		arguments: [serial],
		options: [
			{
				name: "--channel <1-9>",
				description: "Channel number to set the alarm on.",
				required: true,
			},
			{ name: "--high <temp>", description: "High alarm threshold temperature." },
			{ name: "--low <temp>", description: "Low alarm threshold temperature." },
		],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => alarmSet(args.slice(2), options),
	},
	{
		name: "clear",
		summary: "Clear alarm thresholds on a device channel",
		usage: "alarm clear <SERIAL> --channel <1-9>",
		usageLines: ["alarm clear      Clear alarm thresholds on a device channel"],
		arguments: [serial],
		options: [
			{
				name: "--channel <1-9>",
				description: "Channel number to clear alarms on.",
				required: true,
			},
		],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => alarmClear(args.slice(2), options),
	},
	{
		name: "list",
		summary: "List configured alarm thresholds",
		usage: "alarm list [SERIAL]",
		usageLines: ["alarm list       List configured alarm thresholds (all devices or one SERIAL)"],
		arguments: [{ name: "SERIAL", description: "Optional device serial number." }],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => alarmList(args.slice(2), options),
	},
	{
		name: "suggest",
		summary: "Suggest pit and meat-probe alarm thresholds for a cut of meat",
		usage:
			"alarm suggest <MEAT> [--pit-band <deg>] [--serial <SN>] [--meat-channel <1-9>] [--pit-channel <1-9>]",
		usageLines: ["alarm suggest    Suggest pit and meat-probe alarm thresholds for a cut of meat"],
		arguments: [{ name: "MEAT", description: "Meat name or alias.", required: true }],
		options: [
			{ name: "--pit-band <deg>", description: "Half-width of the pit alarm band." },
			{ name: "--serial <SN>", description: "Serial number for suggested commands." },
			{ name: "--meat-channel <1-9>", description: "Meat-probe channel." },
			{ name: "--pit-channel <1-9>", description: "Pit-probe channel." },
		],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => alarmSuggest(args.slice(2), options),
	},
] as const satisfies readonly CommandDefinition[];

const copilotCommands = [
	{
		name: "setup",
		summary: "Configure Copilot CLI statusline (wizard)",
		usage: "copilot setup [--dev] [--demo]",
		usageLines: ["copilot setup    Configure Copilot CLI statusline (wizard)"],
		options: [
			{ name: "--dev", description: "Use a local development command." },
			{ name: "--demo", description: "Configure fake cycling demo data." },
		],
		supportsJson: false,
		handler: ({ args }: CommandContext) =>
			args.includes("--demo") ? copilotSetupDemo() : copilotSetup(args.includes("--dev")),
	},
	{
		name: "status",
		summary: "Show configured temperature reading",
		usage: "copilot status [--demo]",
		usageLines: ["copilot status   Show configured temperature reading"],
		options: [{ name: "--demo", description: "Output fake demo data instead of real readings." }],
		supportsJson: false,
		handler: async ({ args }: CommandContext) =>
			args.includes("--demo") ? copilotStatusDemo(await nextDemoState()) : copilotStatus(),
	},
	{
		name: "remove",
		summary: "Remove statusline configuration",
		usage: "copilot remove",
		usageLines: ["copilot remove   Remove statusline configuration"],
		supportsJson: false,
		handler: () => copilotRemove(),
	},
] as const satisfies readonly CommandDefinition[];

function forwardingSubcommand(
	name: string,
	command: CommandHandler,
	supportsJson = true,
): CommandDefinition {
	return {
		name,
		summary: `${name} subcommand`,
		usage: name,
		usageLines: [],
		supportsJson,
		handler: command,
	};
}

const fanCommands = ["set", "enable", "disable"].map((name) =>
	forwardingSubcommand(name, ({ args, options }) => fan(args.slice(1), options)),
) satisfies CommandDefinition[];
const sessionCommands = ["start", "end", "status", "clear"].map((name) =>
	forwardingSubcommand(name, ({ args, options }) => session(args.slice(1), options)),
) satisfies CommandDefinition[];
const deviceCommands = ["rename", "reset-minmax"].map((name) =>
	forwardingSubcommand(name, ({ args, options }) => device(args.slice(1), options)),
) satisfies CommandDefinition[];
const labelCommands = ["set", "get", "list", "clear"].map((name) =>
	forwardingSubcommand(name, ({ args, options }) => label(args.slice(1), options), name === "list"),
) satisfies CommandDefinition[];
const journalCommands = ["add", "list", "show", "cost", "import", "export", "rm"].map((name) =>
	forwardingSubcommand(
		name,
		({ args, options }) => journal(args.slice(1), options),
		["list", "show", "cost", "import"].includes(name),
	),
) satisfies CommandDefinition[];

const mcpCommands = [
	{
		name: "start",
		summary: "Start MCP server for AI assistants",
		usage: "mcp start",
		usageLines: [],
		supportsJson: false,
		handler: () => mcpStart(),
	},
] as const satisfies readonly CommandDefinition[];

export const commandDefinitions: readonly CommandDefinition[] = [
	{
		name: "auth",
		summary: "Manage ThermoWorks Cloud credentials",
		usage: "auth <login|logout|status>",
		usageLines: [],
		subcommands: authCommands,
		completion: authCommands.map((s) => s.name),
		supportsJson: true,
		handler: subcommands("auth", authCommands, "Usage: thermoworks auth <login|logout|status>"),
	},
	{
		name: "alarm",
		summary: "Manage alarm thresholds",
		usage: "alarm <set|clear|list|suggest>",
		usageLines: [],
		subcommands: alarmCommands,
		completion: alarmCommands.map((s) => s.name),
		supportsJson: true,
		handler: subcommands(
			"alarm",
			alarmCommands,
			"Usage: thermoworks alarm <set|clear|list|suggest>",
		),
	},
	{
		name: "alerts",
		summary: "Scan current alarm state and exit non-zero if any channel is alarming",
		usage: "alerts [SERIAL] [--json]",
		usageLines: [
			"alerts           Scan current alarm state and exit non-zero if any channel is alarming",
			"  [SERIAL]       Scope the scan to a single device",
		],
		arguments: [{ name: "SERIAL", description: "Optional device serial number." }],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => alerts(args.slice(1), options),
	},
	{
		name: "calibration",
		summary: "Show NIST-traceable calibration data for a device",
		usage: "calibration <SERIAL> [--interval-months N] [--json]",
		usageLines: [
			"calibration <SERIAL>  Show NIST-traceable calibration data for a device",
			"  --interval-months N  Recalibration interval for the due-date check (default: 12)",
		],
		arguments: [serial],
		options: [
			{
				name: "--interval-months N",
				description: "Recalibration interval for the due-date check.",
			},
		],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => calibration(args[1], options, args),
	},
	{
		name: "copilot",
		summary: "Configure and render the Copilot CLI statusline",
		usage: "copilot <setup|status|remove>",
		usageLines: [],
		subcommands: copilotCommands,
		completion: copilotCommands.map((s) => s.name),
		supportsJson: false,
		handler: subcommands(
			"copilot",
			copilotCommands,
			"Usage: thermoworks copilot <setup|status|remove>",
		),
	},
	{
		name: "data-usage",
		summary: "Show account data storage usage",
		usage: "data-usage [--by-device] [--json]",
		usageLines: [
			"data-usage       Show account data storage usage",
			"  --by-device    Show per-device breakdown",
		],
		options: [{ name: "--by-device", description: "Show per-device breakdown." }],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => dataUsage(args.slice(1), options),
	},
	{
		name: "notifications",
		summary: "Show account notification settings",
		usage: "notifications [--enable FIELD | --disable FIELD] [--json]",
		usageLines: [
			"notifications    Show account notification settings",
			"  --enable FIELD   Enable a setting (all, continuous, email, sms, device)",
			"  --disable FIELD  Disable a setting (all, continuous, email, sms, device)",
		],
		options: [
			{ name: "--enable FIELD", description: "Enable a setting." },
			{ name: "--disable FIELD", description: "Disable a setting." },
		],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => notifications(args.slice(1), options),
	},
	{
		name: "account",
		summary: "Show account details and billing plan",
		usage: "account [--json]",
		usageLines: ["account          Show account details and billing plan"],
		supportsJson: true,
		handler: ({ options }: CommandContext) => account(options),
	},
	{
		name: "devices",
		summary: "List connected devices and channel readings",
		usage:
			"devices [--type T] [--status S] [--label L] [--serial SN] [--active-within N] [--sort health|label|last-seen] [--critical] [--no-channels] [--json]",
		usageLines: [
			"devices          List connected devices and channel readings",
			"  --active-within N  Only devices seen within N minutes",
			"  --sort FIELD       Sort by health, label, or last-seen",
			"  --critical         Only show devices needing attention",
		],
		completion: [
			"--type",
			"--status",
			"--label",
			"--serial",
			"--active-within",
			"--sort",
			"--critical",
			"--no-channels",
		],
		options: [
			{ name: "--active-within N", description: "Only devices seen within N minutes." },
			{ name: "--sort FIELD", description: "Sort devices by health, label, or last-seen." },
			{ name: "--critical", description: "Only show devices needing attention." },
			{ name: "--no-channels", description: "Hide channel readings." },
		],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) =>
			devices(parseDevicesArgs(args.slice(1), options)),
	},
	{
		name: "temp",
		summary: "Print a single temperature value for scripting",
		usage: "temp <SERIAL> [--channel N] [--unit auto|f|c] [--json]",
		usageLines: [
			"temp <SERIAL>    Print a single temperature value for scripting",
			"  --channel N    Read a specific channel (1-9) instead of the average",
		],
		arguments: [serial],
		options: [
			{ name: "--channel N", description: "Read a specific channel." },
			{ name: "--unit auto|f|c", description: "Convert the output value." },
		],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => temp(args.slice(1), options),
	},
	{
		name: "eta",
		summary: "Estimate time-to-target for a probe channel",
		usage: "eta <SERIAL> [--channel N] [--target N] [--json]",
		usageLines: [
			"eta <SERIAL>     Estimate time-to-target for a probe channel (one-shot, for scripts)",
			"  --channel N    Probe channel to predict (1-9, default: 1)",
			"  --target N     Target temperature (default: the channel's high alarm)",
		],
		arguments: [serial],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => eta(args.slice(1), options),
	},
	{
		name: "stall",
		summary: "Check whether a cook has stalled",
		usage: "stall <SERIAL> [--threshold N] [--duration N] [--json]",
		usageLines: [
			"stall <SERIAL>   Check whether a cook has stalled (one-shot, for scripts)",
			"  --threshold N  Max temperature spread to count as a stall (default: 2)",
			"  --duration N   Minutes the plateau must last to count as a stall (default: 30)",
		],
		arguments: [serial],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => stall(args.slice(1), options),
	},
	{
		name: "device",
		summary: "Manage devices",
		usage: "device <rename|reset-minmax>",
		usageLines: [
			"device rename <SERIAL> --name <TEXT>        Rename a device",
			"device reset-minmax <SERIAL> --channel <N>  Reset min/max readings for a channel",
		],
		subcommands: deviceCommands,
		completion: deviceCommands.map((s) => s.name),
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => device(args.slice(1), options),
	},
	{
		name: "label",
		summary: "Manage custom display labels for device channels",
		usage: "label <set|get|list|clear>",
		usageLines: [
			"label set <SERIAL> <CH> <LABEL>  Set a persistent channel label",
			"label get <SERIAL> <CH>          Show the label for a channel",
			"label list [SERIAL]              List all labels (optionally for one device)",
			"label clear <SERIAL> <CH>        Remove a channel label",
		],
		subcommands: labelCommands,
		completion: labelCommands.map((s) => s.name),
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => label(args.slice(1), options),
	},
	{
		name: "mcp",
		summary: "Start MCP server for AI assistants",
		usage: "mcp start",
		usageLines: ["mcp start        Start MCP server for AI assistants"],
		subcommands: mcpCommands,
		completion: ["start"],
		supportsJson: false,
		handler: subcommands("mcp", mcpCommands, "Usage: thermoworks mcp <start>"),
	},
	{
		name: "watch",
		summary: "Continuously monitor temperatures",
		usage:
			"watch [--device SN] [--interval N] [--alert-before N] [--bell] [--until-alarm] [--timeout N] [--json]",
		usageLines: [
			"watch            Continuously monitor temperatures (live refresh)",
			"  --device SN    Watch a specific device by serial number",
			"  --interval N   Refresh interval in seconds (default: 10)",
			"  --alert-before N  Warn when a channel is within N degrees of its high alarm",
			"  --bell         Ring the terminal bell while any channel is alarming",
			"  --until-alarm  Exit when any channel enters a high or low alarm state (for scripts)",
			"  --timeout N    With --until-alarm, exit with code 2 if no alarm within N seconds",
		],
		completion: [
			"--device",
			"--interval",
			"--alert-before",
			"--bell",
			"--until-alarm",
			"--timeout",
		],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => watch(args.slice(1), options),
	},
	{
		name: "metrics",
		summary: "Serve live temperatures as Prometheus metrics",
		usage: "metrics [--host HOST] [--port N] [--device SN] [--interval N]",
		usageLines: [
			"metrics          Serve live temperatures as Prometheus metrics on /metrics",
			"  --host HOST    Bind address (default: 127.0.0.1)",
			"  --port N       Listen port (default: 9464)",
			"  --device SN    Export a specific device by serial number",
			"  --interval N   Poll interval in seconds (default: 10)",
		],
		supportsJson: false,
		handler: ({ args, options }: CommandContext) => metrics(args.slice(1), options),
	},
	{
		name: "events",
		summary: "Show device event history",
		usage: "events [--device SERIAL] [--type TYPE] [--limit N] [--json]",
		usageLines: ["events           Show device event history (alarms, status changes)"],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => events(parseEventsArgs(args.slice(1)), options),
	},
	{
		name: "archives",
		summary: "List archived sessions for a device",
		usage: "archives <serial> [--id ID] [--limit N] [--from DATE] [--to DATE] [--json]",
		usageLines: [
			"archives <serial>  List archived sessions for a device",
			"  --from DATE    Only list archives starting on or after DATE",
			"  --to DATE      Only list archives starting on or before DATE",
			"archives compare <serial> <idA> <idB>  Compare two archived sessions side by side",
		],
		completion: ["compare", "--id", "--limit", "--from", "--to"],
		supportsJson: true,
		handler: async ({ args, options }: CommandContext) => {
			if (args[1] === "compare") {
				const compareArgs = parseCompareArgs(args);
				if (!compareArgs) {
					console.error(
						"Usage: thermoworks archives compare <serial> <archiveA> <archiveB> [--json]",
					);
					process.exit(1);
					return;
				}
				await compare(compareArgs, options);
				return;
			}
			const archivesArgs = parseArchivesArgs(args);
			if (!archivesArgs) {
				console.error(
					"Usage: thermoworks archives <serial> [--id ID] [--limit N] [--from DATE] [--to DATE] [--json]",
				);
				process.exit(1);
				return;
			}
			if ("error" in archivesArgs) {
				console.error(archivesArgs.error);
				process.exit(1);
				return;
			}
			await archives(archivesArgs, options);
		},
	},
	{
		name: "stats",
		summary: "Show cross-session cook analytics for a device",
		usage: "stats <serial> [--limit N] [--json]",
		usageLines: ["stats <serial>   Show cross-session cook analytics for a device"],
		arguments: [serial],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => {
			const statsArgs = parseStatsArgs(args);
			if (!statsArgs) {
				console.error("Usage: thermoworks stats <serial> [--limit N] [--json]");
				process.exit(1);
				return;
			}
			return stats(statsArgs, options);
		},
	},
	{
		name: "stability",
		summary: "Measure pit temperature time-in-band for an archived cook",
		usage: "stability <SERIAL> --target F [--band F] [--archive ID] [--channel N] [--json]",
		usageLines: [
			"stability <SERIAL>  Measure pit temperature time-in-band for an archived cook",
			"  --target F     Desired pit temperature in Fahrenheit (required)",
			"  --band F       Allowed degrees above or below target (default: 15)",
			"  --archive ID   Analyze a specific archive instead of the latest",
			"  --channel N    Archive channel to analyze (default: first with readings)",
		],
		arguments: [serial],
		options: [
			{ name: "--target F", description: "Desired pit temperature in Fahrenheit.", required: true },
			{ name: "--band F", description: "Allowed degrees above or below target." },
			{ name: "--archive ID", description: "Analyze a specific archive." },
			{ name: "--channel N", description: "Archive channel to analyze." },
		],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => stability(args.slice(1), options),
	},
	{
		name: "firmware",
		summary: "Show firmware versions and available updates",
		usage: "firmware [--device SERIAL] [--json]",
		usageLines: ["firmware         Show firmware versions and available updates"],
		options: [{ name: "--device SERIAL", description: "Check firmware for a specific device." }],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) =>
			firmware(options, args.includes("--device") ? args[args.indexOf("--device") + 1] : undefined),
	},
	{
		name: "fan",
		summary: "Show or control fan controller state",
		usage: "fan [set|enable|disable] <SERIAL>",
		usageLines: [
			"fan <SERIAL>     Show fan controller state",
			"fan set <SERIAL> --target <temp>  Set fan target temperature",
			"fan enable <SERIAL>   Enable fan controller",
			"fan disable <SERIAL>  Disable fan controller",
		],
		subcommands: fanCommands,
		completion: fanCommands.map((s) => s.name),
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => fan(args.slice(1), options),
	},
	{
		name: "search",
		summary: "Full-text search across devices",
		usage: "search <query> [--collection C] [--limit N] [--json]",
		usageLines: [
			"search <query>   Full-text search across devices",
			"  --collection C Search collection: device, accounts, or users (default: device)",
			"  --limit N      Max results to return (default: 20, max: 100)",
		],
		arguments: [{ name: "query", description: "Search query.", required: true }],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => search(args.slice(1), options),
	},
	{
		name: "session",
		summary: "Manage monitoring sessions",
		usage: "session <start|end|status|clear>",
		usageLines: [
			"session start    Start a monitoring session (--label TEXT)",
			"session end      End an active monitoring session",
			"session status   Show devices with an active session (all or one SERIAL)",
			"session clear    Clear session data (--yes to skip confirmation)",
		],
		subcommands: sessionCommands,
		completion: sessionCommands.map((s) => s.name),
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => session(args.slice(1), options),
	},
	{
		name: "export",
		summary: "Export archive readings to CSV, JSON, or InfluxDB",
		usage: "export SERIAL [--archive ID] [--format FMT] [--output PATH]",
		usageLines: [
			"export SERIAL    Export archive readings to CSV, JSON, or InfluxDB",
			"  --archive ID   Export a specific archive (default: latest)",
			"  --format FMT   Output format: csv, json, or influx (default: json)",
			"  --output PATH  Write to file (default: stdout)",
		],
		arguments: [serial],
		supportsJson: true,
		handler: ({ args }: CommandContext) => exportData(args),
	},
	{
		name: "backup",
		summary: "Bulk-export archived sessions to a directory",
		usage: "backup [SERIAL] [--output DIR] [--format FMT] [--limit N] [--json]",
		usageLines: [
			"backup [SERIAL]  Bulk-export archived sessions to a directory",
			"  --output DIR   Directory to write files (default: thermoworks-backup)",
			"  --format FMT   Output format: csv or json (default: json)",
			"  --limit N      Max archives to export per device (default: 20)",
		],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => backup(args, options),
	},
	{
		name: "history",
		summary: "Export historical time-series readings",
		usage: "history <SERIAL> [--limit N] [--format FMT] [--output PATH]",
		usageLines: [
			"history <SERIAL> Export historical time-series readings (BigQuery)",
			"  --limit N      Show the N most recent readings",
			"  --format FMT   Output format: table, csv, or json (default: table)",
			"  --output PATH  Write to file (default: stdout)",
		],
		arguments: [serial],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => history(args.slice(1), options),
	},
	{
		name: "graph",
		summary: "Draw a temperature chart in the terminal",
		usage: "graph <SERIAL> [--archive ID] [--channel N] [--width N] [--height N]",
		usageLines: [
			"graph <SERIAL>   Draw a temperature chart in the terminal",
			"  --archive ID   Chart a saved archive instead of recent history",
			"  --channel N    Archive channel to chart (default: first with readings)",
			"  --width N      Chart width in columns (default: 60)",
			"  --height N     Chart height in rows (default: 12)",
		],
		arguments: [serial],
		supportsJson: false,
		handler: ({ args, options }: CommandContext) => graph(args.slice(1), options),
	},
	{
		name: "guide",
		summary: "Show temperature guide",
		usage: "guide [category] [--json]",
		usageLines: ["guide [category] Show temperature guide (safe cooking temps)"],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => guide(args[1], options),
	},
	{
		name: "doneness",
		summary: "Show recommended internal pull temperatures",
		usage: "doneness [meat] [--json]",
		usageLines: ["doneness [meat]  Show recommended internal pull temperatures for common cuts"],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => doneness(args[1], options),
	},
	{
		name: "placement",
		summary: "Show meat and pit probe placement guidance",
		usage: "placement [meat] [--json]",
		usageLines: ["placement [meat]  Show meat and pit probe placement guidance"],
		arguments: [{ name: "meat", description: "Meat name or alias." }],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => placement(args.slice(1), options),
	},
	{
		name: "safe",
		summary: "Show food-safety pasteurization progress",
		usage: "safe <SERIAL> [--channel N] [--temp T] [--protein P] [--held N] [--json]",
		usageLines: [
			"safe <SERIAL>    Show food-safety pasteurization progress for a probe",
			"  --channel N    Read a specific channel (1-9) instead of the average",
			"  --temp T       Assess a manual temperature value, e.g. 150f or 74c",
			"  --protein P    Table to use: poultry, beef, or pork (default: poultry)",
			"  --held N       Minutes already held at or above the current temperature",
		],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => safe(args.slice(1), options),
	},
	{
		name: "carryover",
		summary: "Predict when to pull so carryover lands on the target",
		usage: "carryover <SERIAL> --target F [--channel N] [--rise DEG] [--size SIZE] [--json]",
		usageLines: [
			"carryover <SERIAL>  Predict when to pull so carryover lands on the target",
			"  --target F     Desired final temperature after resting (required)",
			"  --channel N    Read a specific channel (1-9) instead of the average",
			"  --rise DEG     Expected carryover rise in degrees",
			"  --size SIZE    Preset rise: small, medium (default), or large",
		],
		arguments: [serial],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => carryover(args.slice(1), options),
	},
	{
		name: "cooldown",
		summary: "Check cooling against the FDA two-stage rule",
		usage: "cooldown <SERIAL> [--readings LIST] [--stage1-limit H] [--stage2-limit H] [--json]",
		usageLines: [
			"cooldown <SERIAL>  Check cooling against the FDA two-stage rule",
			'  --readings LIST  Offline "temp@minutes" pairs in Fahrenheit, comma-separated',
			"  --stage1-limit H  Hours allowed for 135F to 70F (default 2)",
			"  --stage2-limit H  Hours allowed for 135F to 41F (default 6)",
		],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => cooldown(args.slice(1), options),
	},
	{
		name: "season",
		summary: "Scale a rub or brine to the weight of a cut",
		usage: "season --weight LB [--recipe NAME] [--brine] [--dry-brine] [--list] [--json]",
		usageLines: [
			"season           Scale a rub or brine to the weight of a cut (offline)",
			"  --weight LB    Weight of the meat in pounds (required)",
			"  --recipe NAME  Rub recipe to use (see --list)",
			"  --brine        Wet brine plan instead of a rub",
			"  --dry-brine    Dry brine plan instead of a rub",
			"  --list         Show the built-in rub recipes",
		],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => season(args.slice(1), options),
	},
	{
		name: "wrap",
		summary: "Advise whether to wrap the cook now",
		usage: "wrap <SERIAL> --target F [--wrap-at F] [--limit N] [--json]",
		usageLines: [
			"wrap <SERIAL>    Advise whether to wrap the cook now (the Texas crutch)",
			"  --target F     Target internal temperature in Fahrenheit (required)",
			"  --wrap-at F    Temperature where the wrap window opens (default: 160)",
			"  --limit N      Look at only the most recent N readings",
		],
		arguments: [serial],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => wrap(args.slice(1), options),
	},
	{
		name: "open",
		summary: "Open a ThermoWorks site in your browser",
		usage: "open [target] [--json]",
		usageLines: [
			"open [target]    Open a ThermoWorks site in your browser",
			"  cloud          ThermoWorks Cloud web app (default)",
			"  web            This project's web dashboard",
		],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => open(args[1], options),
	},
	{
		name: "convert",
		summary: "Convert between Celsius and Fahrenheit",
		usage: "convert VALUE [--to c|f] [--json]",
		usageLines: [
			"convert VALUE    Convert between Celsius and Fahrenheit",
			"  225f           Convert 225°F to Celsius",
			"  107c           Convert 107°C to Fahrenheit",
			"  225 --to c     Convert a bare number to the given unit",
		],
		arguments: [{ name: "VALUE", description: "Temperature value to convert.", required: true }],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => convert(args.slice(1), options),
	},
	{
		name: "journal",
		summary: "Keep a local logbook of finished cooks",
		usage: "journal <add|list|show|cost|import|export|rm>",
		usageLines: [
			"journal add      Log a finished cook to a local logbook",
			"  --cost-meat N  Meat cost for the cook",
			"  --cost-fuel N  Fuel cost for the cook",
			"journal list     List logbook entries (newest first)",
			"journal show <id>  Show one logbook entry",
			"journal cost     Summarize cook costs across the logbook",
			"journal export   Export the local logbook as JSON or CSV",
			"journal rm <id>  Remove one logbook entry",
		],
		subcommands: journalCommands,
		completion: journalCommands.map((s) => s.name),
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => journal(args.slice(1), options),
	},
	{
		name: "plan",
		summary: "Back-calculate cook start times",
		usage: "plan --ready TIME --item SPEC [--list-meats] [--json]",
		usageLines: [
			"plan             Back-calculate cook start times for a target ready time",
			'  --ready TIME   When everything should be ready (e.g. "6:00 PM")',
			"  --item SPEC    Add an item: NAME, NAME=WEIGHT (lb), or NAME=Nh (hours)",
			"  --list-meats   Show built-in meat profiles",
		],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => plan(args.slice(1), options),
	},
	{
		name: "completion",
		summary: "Print a shell completion script",
		usage: "completion <bash|zsh|fish|powershell>",
		usageLines: [
			"completion <SHELL>  Print a shell completion script (bash, zsh, fish, powershell)",
		],
		completion: ["bash", "zsh", "fish", "powershell"],
		supportsJson: false,
		handler: async ({ args, options }: CommandContext) => {
			const command = await import("./commands/completion.js");
			await command.completion(args[1], options);
		},
	},
	{
		name: "config",
		summary: "Store local default preferences",
		usage: "config <set|get|list|unset|path>",
		usageLines: [
			"config set <key> <value>  Set a default preference (unit, device, watchInterval)",
			"config get <key>          Show a preference value",
			"config list               Show all preferences",
			"config unset <key>        Remove a preference",
			"config path               Show the preferences file path",
		],
		completion: ["set", "get", "list", "unset", "path"],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => config(args.slice(1), options),
	},
	{
		name: "doctor",
		summary: "Diagnose auth, network, and API issues",
		usage: "doctor [--json]",
		usageLines: [
			"doctor           Diagnose auth, network, and API issues",
			"  --json         Output results as JSON",
		],
		supportsJson: true,
		handler: ({ options }: CommandContext) => doctor(options),
	},
	{
		name: "replay",
		summary: "Play back a past cook as a live stream",
		usage: "replay <SERIAL> [--archive ID] [--channel N] [--speed N] [--loop]",
		usageLines: [
			"replay <SERIAL>  Play back a past cook as a live stream",
			"  --archive ID   Replay a saved archive instead of recent history",
			"  --channel N    Archive channel to replay (default: first with readings)",
			"  --speed N      Time compression, e.g. 60 = a minute per second (default: 60)",
			"  --loop         Restart from the beginning when the replay ends",
		],
		arguments: [serial],
		supportsJson: false,
		handler: ({ args, options }: CommandContext) => replay(args.slice(1), options),
	},
	{
		name: "timeline",
		summary: "Annotate a saved cook with its key milestones",
		usage: "timeline <SERIAL> [--archive ID] [--channel N] [--target F] [--json]",
		usageLines: [
			"timeline <SERIAL>  Annotate a saved cook with its key milestones",
			"  --archive ID     Chart a specific archive (default: latest)",
			"  --channel N      Archive channel to chart (default: first with readings)",
			"  --target F       Mark the first crossing of a target temperature",
			"  --json           Output the timeline as JSON",
		],
		arguments: [serial],
		supportsJson: true,
		handler: ({ args, options }: CommandContext) => timeline(args.slice(1), options),
	},
	{
		name: "demo",
		summary: "Show demo output",
		usage: "demo <high|low|normal>",
		usageLines: ["demo <mode>      Show demo output (modes: high, low, normal)"],
		completion: ["high", "low", "normal"],
		supportsJson: false,
		handler: async ({ args }: CommandContext) => {
			const mode = args[1];
			if (mode !== "high" && mode !== "low" && mode !== "normal") {
				console.error("Usage: thermoworks demo <high|low|normal>");
				process.exit(1);
				return;
			}
			await copilotStatusDemo(mode === "normal" ? "none" : mode);
		},
	},
];

export const globalOptions = [
	json,
	{
		name: "--redact",
		description: "Mask serials, account and user IDs, email, and tokens in output",
	},
	{ name: "--no-channels", description: "Hide channel readings in devices output" },
	{ name: "--help, -h", description: "Show this help message" },
	{ name: "--version, -v", description: "Show version" },
] as const satisfies readonly CommandField[];

export function findCommand(name: string | undefined): CommandDefinition | undefined {
	if (!name) return undefined;
	return commandDefinitions.find(
		(command) => command.name === name || command.aliases?.includes(name),
	);
}

export async function dispatchCommand(args: string[], options: OutputOptions): Promise<boolean> {
	const definition = findCommand(args[0]);
	if (!definition) return false;
	if (!definition.handler)
		throw new Error(`Command ${definition.name} is registered without a handler.`);
	await definition.handler({ args, options });
	return true;
}

export async function printVersion(): Promise<void> {
	const dir = dirname(fileURLToPath(import.meta.url));
	const pkg = JSON.parse(await readFile(join(dir, "..", "package.json"), "utf8"));
	console.log(pkg.version);
}

export function renderTopLevelUsage(): string {
	const lines = ["Usage: thermoworks <command> [subcommand] [options]", "", "Commands:"];
	for (const command of commandDefinitions) {
		const usageLines =
			command.usageLines.length > 0
				? command.usageLines
				: (command.subcommands ?? []).flatMap((subcommand) => subcommand.usageLines);
		if (usageLines.length === 0) lines.push(`  ${command.name.padEnd(16)} ${command.summary}`);
		else lines.push(...usageLines.map((line) => `  ${line}`));
		if (
			[
				"auth",
				"alarm",
				"copilot",
				"data-usage",
				"notifications",
				"account",
				"devices",
				"stall",
				"label",
				"watch",
				"metrics",
				"stats",
				"firmware",
				"wrap",
				"journal",
				"timeline",
			].includes(command.name)
		)
			lines.push("");
	}
	lines.push("Options:");
	lines.push(...globalOptions.map((option) => `  ${option.name.padEnd(16)} ${option.description}`));
	return lines.join("\n");
}

export function flattenedCommandDefinitions(): CommandDefinition[] {
	return commandDefinitions.flatMap((command) =>
		command.subcommands?.length
			? [
					command,
					...command.subcommands.map((subcommand) => ({
						...subcommand,
						name: `${command.name} ${subcommand.name}`,
						usage: subcommand.usage.startsWith(command.name)
							? subcommand.usage
							: `${command.name} ${subcommand.usage}`,
					})),
				]
			: [command],
	);
}

export function renderCliReference(): string {
	const lines = [
		"# CLI Reference",
		"",
		"This file is generated from `packages/cli/src/command-registry.ts`.",
		"",
		"## Commands",
		"",
	];
	for (const command of flattenedCommandDefinitions()) {
		lines.push(
			`### \`thermoworks ${command.usage}\``,
			"",
			command.summary,
			"",
			"**Usage**",
			"",
			"```bash",
			`npx thermoworks ${command.usage}`,
			"```",
		);
		if (command.arguments?.length) {
			lines.push("", "**Arguments**", "");
			for (const argument of command.arguments)
				lines.push(
					`- \`${argument.name}\`${argument.required ? " (required)" : ""} - ${argument.description}`,
				);
		}
		const options = [...(command.options ?? [])];
		if (command.supportsJson) options.push(json);
		lines.push("", "**Options**", "");
		if (options.length === 0) lines.push("None.");
		for (const option of options)
			lines.push(
				`- \`${option.name}\`${option.required ? " (required)" : ""} - ${option.description}`,
			);
		if (command.subcommands?.length) {
			lines.push("", "**Subcommands**", "");
			for (const subcommand of command.subcommands)
				lines.push(`- \`${subcommand.name}\` - ${subcommand.summary}`);
		}
		lines.push("");
	}
	lines.push("## Global Options", "");
	for (const option of globalOptions) lines.push(`- \`${option.name}\` - ${option.description}`);
	lines.push("");
	return `${lines.join("\n").trimEnd()}\n`;
}
