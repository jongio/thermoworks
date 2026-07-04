import type { OutputOptions } from "../output.js";

/** A top-level command and its subcommands for completion. */
export interface CommandSpec {
	name: string;
	subcommands: string[];
}

/**
 * Source-of-truth list of commands and subcommands used to generate shell
 * completion scripts. Keep this in sync with the router in `index.ts` and the
 * usage text in `printUsage`.
 */
export const COMMANDS: CommandSpec[] = [
	{ name: "auth", subcommands: ["login", "logout", "status"] },
	{ name: "alarm", subcommands: ["set", "clear"] },
	{ name: "calibration", subcommands: [] },
	{ name: "copilot", subcommands: ["setup", "status", "remove"] },
	{ name: "data-usage", subcommands: [] },
	{ name: "devices", subcommands: [] },
	{ name: "device", subcommands: ["rename", "reset-minmax"] },
	{ name: "mcp", subcommands: ["start"] },
	{ name: "watch", subcommands: [] },
	{ name: "events", subcommands: [] },
	{ name: "archives", subcommands: [] },
	{ name: "firmware", subcommands: [] },
	{ name: "fan", subcommands: ["set", "enable", "disable"] },
	{ name: "search", subcommands: [] },
	{ name: "session", subcommands: ["start", "end", "clear"] },
	{ name: "export", subcommands: [] },
	{ name: "history", subcommands: [] },
	{ name: "guide", subcommands: [] },
	{ name: "demo", subcommands: ["high", "low", "normal"] },
	{ name: "completion", subcommands: ["bash", "zsh", "fish", "powershell"] },
];

/** Global flags offered on every command. */
export const GLOBAL_FLAGS = ["--json", "--help", "-h", "--version", "-v"];

/** Shells with a supported completion generator. */
export const SUPPORTED_SHELLS = ["bash", "zsh", "fish", "powershell"] as const;
export type Shell = (typeof SUPPORTED_SHELLS)[number];

function topLevelNames(): string[] {
	return COMMANDS.map((c) => c.name);
}

/** Generate a bash completion script. */
export function bashCompletion(): string {
	const commands = topLevelNames().join(" ");
	const globals = GLOBAL_FLAGS.join(" ");

	const subCases = COMMANDS.filter((c) => c.subcommands.length > 0)
		.map((c) => `        ${c.name})\n            opts="${c.subcommands.join(" ")}"\n            ;;`)
		.join("\n");

	return `# bash completion for thermoworks
# Install: thermoworks completion bash > /etc/bash_completion.d/thermoworks
_thermoworks() {
    local cur prev words cword
    _init_completion 2>/dev/null || {
        cur="\${COMP_WORDS[COMP_CWORD]}"
        prev="\${COMP_WORDS[COMP_CWORD-1]}"
        cword=$COMP_CWORD
    }

    local commands="${commands}"
    local globals="${globals}"

    if [ "$cword" -le 1 ]; then
        COMPREPLY=( $(compgen -W "$commands $globals" -- "$cur") )
        return 0
    fi

    local opts=""
    case "\${COMP_WORDS[1]}" in
${subCases}
    esac

    COMPREPLY=( $(compgen -W "$opts $globals" -- "$cur") )
    return 0
}
complete -F _thermoworks thermoworks
`;
}

/** Generate a zsh completion script. */
export function zshCompletion(): string {
	const commandLines = COMMANDS.map((c) => `        '${c.name}:${c.name} command'`).join(" \\\n");

	const subBlocks = COMMANDS.filter((c) => c.subcommands.length > 0)
		.map((c) => {
			const subs = c.subcommands.map((s) => `'${s}'`).join(" ");
			return `                ${c.name})\n                    compadd ${subs}\n                    ;;`;
		})
		.join("\n");

	return `#compdef thermoworks
# zsh completion for thermoworks
# Install: thermoworks completion zsh > "\${fpath[1]}/_thermoworks"
_thermoworks() {
    local -a commands
    commands=( \\
${commandLines} \\
    )

    if (( CURRENT == 2 )); then
        _describe 'command' commands
        return
    fi

    if (( CURRENT == 3 )); then
        case "\${words[2]}" in
${subBlocks}
        esac
    fi
}
_thermoworks "$@"
`;
}

/** Generate a fish completion script. */
export function fishCompletion(): string {
	const lines: string[] = [
		"# fish completion for thermoworks",
		"# Install: thermoworks completion fish > ~/.config/fish/completions/thermoworks.fish",
		"function __thermoworks_no_subcommand",
		"    set -l cmd (commandline -opc)",
		"    test (count $cmd) -eq 1",
		"end",
		"",
	];

	for (const c of COMMANDS) {
		lines.push(
			`complete -c thermoworks -n '__thermoworks_no_subcommand' -f -a '${c.name}' -d '${c.name} command'`,
		);
	}

	lines.push("");
	for (const c of COMMANDS.filter((c) => c.subcommands.length > 0)) {
		for (const sub of c.subcommands) {
			lines.push(
				`complete -c thermoworks -n '__fish_seen_subcommand_from ${c.name}' -f -a '${sub}' -d '${c.name} ${sub}'`,
			);
		}
	}

	lines.push("");
	lines.push("complete -c thermoworks -l json -d 'Output machine-readable JSON'");
	lines.push("complete -c thermoworks -l help -s h -d 'Show help'");
	lines.push("complete -c thermoworks -l version -s v -d 'Show version'");
	lines.push("");

	return lines.join("\n");
}

/** Generate a PowerShell completion script. */
export function powershellCompletion(): string {
	const commands = topLevelNames()
		.map((n) => `'${n}'`)
		.join(", ");

	const subCases = COMMANDS.filter((c) => c.subcommands.length > 0)
		.map((c) => {
			const subs = c.subcommands.map((s) => `'${s}'`).join(", ");
			return `            '${c.name}' { $suggestions = @(${subs}) }`;
		})
		.join("\n");

	return `# PowerShell completion for thermoworks
# Install: thermoworks completion powershell | Out-String | Invoke-Expression
Register-ArgumentCompleter -Native -CommandName thermoworks -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $commands = @(${commands})
    $tokens = $commandAst.CommandElements | ForEach-Object { $_.ToString() }

    if ($tokens.Count -le 2) {
        $suggestions = $commands
    } else {
        $suggestions = @()
        switch ($tokens[1]) {
${subCases}
        }
    }

    $suggestions | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
}
`;
}

const GENERATORS: Record<Shell, () => string> = {
	bash: bashCompletion,
	zsh: zshCompletion,
	fish: fishCompletion,
	powershell: powershellCompletion,
};

/** Type guard for a supported shell name. */
export function isSupportedShell(value: string): value is Shell {
	return (SUPPORTED_SHELLS as readonly string[]).includes(value);
}

/**
 * Print a shell completion script for the given shell to stdout.
 * Exits non-zero when the shell is missing or unsupported.
 */
export async function completion(
	shell: string | undefined,
	_options: OutputOptions,
): Promise<void> {
	if (!shell) {
		console.error(`Usage: thermoworks completion <${SUPPORTED_SHELLS.join("|")}>`);
		process.exit(1);
		return;
	}

	if (!isSupportedShell(shell)) {
		console.error(`Unsupported shell: ${shell}. Supported shells: ${SUPPORTED_SHELLS.join(", ")}.`);
		process.exit(1);
		return;
	}

	console.log(GENERATORS[shell]());
}
