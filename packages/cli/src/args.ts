/**
 * Shared CLI argument helpers.
 */

/**
 * Find the first positional argument in a CLI arg list, skipping option flags
 * (`--foo`) and — for value-taking flags — the value token that follows them.
 *
 * Without skipping flag values, a value placed before the positional (e.g.
 * `thermoworks eta --target 203 ABC123`) would be mistaken for the positional
 * itself, silently operating on the wrong target. Callers pass the set of
 * value-taking flags so boolean flags (e.g. `--json`) fall through without
 * consuming the following token.
 *
 * @param args CLI arguments (already scoped to the command).
 * @param valueFlags Flags that consume the next token as their value.
 * @returns The first positional argument, or `undefined` when none is present.
 */
export function firstPositional(
	args: string[],
	valueFlags: readonly string[] = [],
): string | undefined {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;
		if (arg.startsWith("--")) {
			if (valueFlags.includes(arg)) i++;
			continue;
		}
		return arg;
	}
	return undefined;
}
