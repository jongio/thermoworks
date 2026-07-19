import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
	commandDefinitions,
	flattenedCommandDefinitions,
	renderCliReference,
} from "../src/command-registry.js";
import { COMMANDS } from "../src/commands/completion.js";

const expectedCommands = [
	"auth",
	"alarm",
	"alerts",
	"calibration",
	"copilot",
	"data-usage",
	"notifications",
	"account",
	"devices",
	"temp",
	"eta",
	"stall",
	"device",
	"label",
	"mcp",
	"watch",
	"metrics",
	"events",
	"archives",
	"stats",
	"firmware",
	"fan",
	"search",
	"session",
	"export",
	"backup",
	"history",
	"graph",
	"guide",
	"doneness",
	"safe",
	"carryover",
	"cooldown",
	"season",
	"wrap",
	"open",
	"convert",
	"journal",
	"plan",
	"thaw",
	"completion",
	"config",
	"doctor",
	"replay",
	"timeline",
	"demo",
];

describe("command registry", () => {
	it("covers every current top-level CLI command", () => {
		expect(commandDefinitions.map((command) => command.name)).toEqual(expectedCommands);
	});

	it("requires help text and dispatch handlers for every registered command", () => {
		for (const command of flattenedCommandDefinitions()) {
			expect(command.summary, command.name).not.toHaveLength(0);
			expect(command.usage, command.name).not.toHaveLength(0);
			expect(command.handler, command.name).toEqual(expect.any(Function));
		}
	});

	it("keeps shell completion metadata derived from the registry", () => {
		expect(COMMANDS.map((command) => command.name)).toEqual(expectedCommands);
		for (const command of commandDefinitions) {
			const completion = COMMANDS.find((candidate) => candidate.name === command.name);
			expect(completion?.subcommands).toEqual([
				...(command.completion ?? command.subcommands?.map((subcommand) => subcommand.name) ?? []),
			]);
		}
	});

	it("includes every registered command in generated docs", () => {
		const docs = renderCliReference();
		for (const command of flattenedCommandDefinitions()) {
			expect(docs, command.name).toContain(`thermoworks ${command.usage}`);
		}
	});

	it("keeps docs/cli-reference.md in sync with the registry generator", async () => {
		const docsPath = resolve(import.meta.dirname, "..", "..", "..", "docs", "cli-reference.md");
		await expect(readFile(docsPath, "utf8")).resolves.toBe(renderCliReference());
	});

	it("keeps index.ts delegated to registry usage and dispatch", async () => {
		const indexPath = resolve(import.meta.dirname, "..", "src", "index.ts");
		const source = await readFile(indexPath, "utf8");
		expect(source).toContain("dispatchCommand");
		expect(source).toContain("renderTopLevelUsage");
		expect(source).not.toContain("switch (command)");
	});
});
