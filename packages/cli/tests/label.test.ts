import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
	mkdir: vi.fn(),
}));

import { mkdir, readFile, writeFile } from "node:fs/promises";

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);

beforeEach(() => {
	mockMkdir.mockResolvedValue(undefined);
	mockWriteFile.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe("label set", () => {
	it("sets a label in the config and prints confirmation", async () => {
		const existingConfig = { devices: [], refreshSeconds: 30 };
		mockReadFile.mockResolvedValue(JSON.stringify(existingConfig) as never);

		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const { label } = await import("../src/commands/label.js");
		await label(["set", "SN1", "1", "Brisket"], { json: false });

		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Brisket"));

		const writeCall = mockWriteFile.mock.calls[0];
		expect(writeCall).toBeDefined();
		const written = JSON.parse(writeCall![1] as string);
		expect(written.channelLabels).toEqual({ "SN1:1": "Brisket" });
	});

	it("sanitizes ANSI from label text", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ devices: [], refreshSeconds: 30 }) as never);
		vi.spyOn(console, "log").mockImplementation(() => {});

		const { label } = await import("../src/commands/label.js");
		await label(["set", "SN1", "2", "\x1b[31mRibs\x1b[0m"], { json: false });

		const writeCall = mockWriteFile.mock.calls[0];
		const written = JSON.parse(writeCall![1] as string);
		expect(written.channelLabels["SN1:2"]).toBe("Ribs");
	});

	it("merges with existing labels", async () => {
		const existing = {
			devices: [],
			refreshSeconds: 30,
			channelLabels: { "SN1:1": "Pit" },
		};
		mockReadFile.mockResolvedValue(JSON.stringify(existing) as never);
		vi.spyOn(console, "log").mockImplementation(() => {});

		const { label } = await import("../src/commands/label.js");
		await label(["set", "SN1", "2", "Meat"], { json: false });

		const writeCall = mockWriteFile.mock.calls[0];
		const written = JSON.parse(writeCall![1] as string);
		expect(written.channelLabels).toEqual({ "SN1:1": "Pit", "SN1:2": "Meat" });
	});
});

describe("label get", () => {
	it("prints the label when it exists", async () => {
		const config = {
			devices: [],
			refreshSeconds: 30,
			channelLabels: { "SN1:1": "Pit" },
		};
		mockReadFile.mockResolvedValue(JSON.stringify(config) as never);
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const { label } = await import("../src/commands/label.js");
		await label(["get", "SN1", "1"], { json: false });

		expect(consoleSpy).toHaveBeenCalledWith("Pit");
	});

	it("prints (not set) when label does not exist", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ devices: [], refreshSeconds: 30 }) as never);
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const { label } = await import("../src/commands/label.js");
		await label(["get", "SN1", "3"], { json: false });

		expect(consoleSpy).toHaveBeenCalledWith("(not set)");
	});
});

describe("label list", () => {
	it("lists all labels in text format", async () => {
		const config = {
			devices: [],
			refreshSeconds: 30,
			channelLabels: { "SN1:1": "Pit", "SN1:2": "Meat" },
		};
		mockReadFile.mockResolvedValue(JSON.stringify(config) as never);
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const { label } = await import("../src/commands/label.js");
		await label(["list"], { json: false });

		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("SN1"));
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Pit"));
	});

	it("outputs JSON when --json flag is set", async () => {
		const config = {
			devices: [],
			refreshSeconds: 30,
			channelLabels: { "SN1:1": "Pit" },
		};
		mockReadFile.mockResolvedValue(JSON.stringify(config) as never);
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const { label } = await import("../src/commands/label.js");
		await label(["list"], { json: true });

		const output = consoleSpy.mock.calls[0]?.[0] as string;
		const parsed = JSON.parse(output);
		expect(parsed).toEqual({ "SN1:1": "Pit" });
	});

	it("filters by serial when provided", async () => {
		const config = {
			devices: [],
			refreshSeconds: 30,
			channelLabels: { "SN1:1": "Pit", "SN2:1": "Other" },
		};
		mockReadFile.mockResolvedValue(JSON.stringify(config) as never);
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const { label } = await import("../src/commands/label.js");
		await label(["list", "SN1"], { json: true });

		const output = consoleSpy.mock.calls[0]?.[0] as string;
		const parsed = JSON.parse(output);
		expect(parsed).toEqual({ "SN1:1": "Pit" });
	});

	it("prints empty message when no labels set", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ devices: [], refreshSeconds: 30 }) as never);
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const { label } = await import("../src/commands/label.js");
		await label(["list"], { json: false });

		expect(consoleSpy).toHaveBeenCalledWith("No channel labels set.");
	});
});

describe("label clear", () => {
	it("removes a label from the config", async () => {
		const config = {
			devices: [],
			refreshSeconds: 30,
			channelLabels: { "SN1:1": "Pit", "SN1:2": "Meat" },
		};
		mockReadFile.mockResolvedValue(JSON.stringify(config) as never);
		vi.spyOn(console, "log").mockImplementation(() => {});

		const { label } = await import("../src/commands/label.js");
		await label(["clear", "SN1", "1"], { json: false });

		const writeCall = mockWriteFile.mock.calls[0];
		const written = JSON.parse(writeCall![1] as string);
		expect(written.channelLabels).toEqual({ "SN1:2": "Meat" });
	});

	it("prints message when label was not set", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ devices: [], refreshSeconds: 30 }) as never);
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const { label } = await import("../src/commands/label.js");
		await label(["clear", "SN1", "5"], { json: false });

		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No label set"));
	});
});
