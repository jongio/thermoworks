import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
	mkdir: vi.fn(),
}));

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { config } from "../src/commands/config.js";

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

/** Parse the JSON written by the last savePreferences call. */
function lastWritten(): unknown {
	const call = mockWriteFile.mock.calls.at(-1);
	return call ? JSON.parse(String(call[1])) : undefined;
}

beforeEach(() => {
	mockMkdir.mockResolvedValue(undefined as never);
	mockWriteFile.mockResolvedValue(undefined);
	mockReadFile.mockRejectedValue(new Error("ENOENT"));
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(process, "exit").mockImplementation(() => {
		throw new Error("process.exit");
	});
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe("config set", () => {
	it("stores a valid value", async () => {
		await config(["set", "unit", "c"], { json: false });
		expect(lastWritten()).toEqual({ unit: "C" });
		expect(logSpy).toHaveBeenCalledWith("Set unit = C");
	});

	it("merges with existing preferences", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ device: "M100" }) as never);
		await config(["set", "watchInterval", "15"], { json: false });
		expect(lastWritten()).toEqual({ device: "M100", watchInterval: 15 });
	});

	it("rejects an unknown key", async () => {
		await expect(config(["set", "color", "red"], { json: false })).rejects.toThrow("process.exit");
		expect(mockWriteFile).not.toHaveBeenCalled();
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown key"));
	});

	it("rejects an invalid value", async () => {
		await expect(config(["set", "unit", "kelvin"], { json: false })).rejects.toThrow(
			"process.exit",
		);
		expect(mockWriteFile).not.toHaveBeenCalled();
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid value"));
	});

	it("requires a value", async () => {
		await expect(config(["set", "unit"], { json: false })).rejects.toThrow("process.exit");
	});
});

describe("config get", () => {
	it("prints a stored value", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ unit: "F" }) as never);
		await config(["get", "unit"], { json: false });
		expect(logSpy).toHaveBeenCalledWith("F");
	});

	it("prints (not set) when missing", async () => {
		await config(["get", "device"], { json: false });
		expect(logSpy).toHaveBeenCalledWith("(not set)");
	});

	it("supports json output", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ watchInterval: 30 }) as never);
		await config(["get", "watchInterval"], { json: true });
		expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ watchInterval: 30 }, null, 2));
	});

	it("rejects an unknown key", async () => {
		await expect(config(["get", "nope"], { json: false })).rejects.toThrow("process.exit");
	});
});

describe("config list", () => {
	it("shows every known key", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ unit: "C" }) as never);
		await config(["list"], { json: false });
		expect(logSpy).toHaveBeenCalledWith("unit = C");
		expect(logSpy).toHaveBeenCalledWith("device = (not set)");
		expect(logSpy).toHaveBeenCalledWith("watchInterval = (not set)");
	});

	it("supports json output", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ unit: "C" }) as never);
		await config(["list"], { json: true });
		expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ unit: "C" }, null, 2));
	});
});

describe("config unset", () => {
	it("removes a stored value", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ unit: "C", device: "M100" }) as never);
		await config(["unset", "unit"], { json: false });
		expect(lastWritten()).toEqual({ device: "M100" });
		expect(logSpy).toHaveBeenCalledWith("Unset unit");
	});

	it("is a no-op when the key is not set", async () => {
		await config(["unset", "device"], { json: false });
		expect(mockWriteFile).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledWith("device is not set.");
	});

	it("rejects an unknown key", async () => {
		await expect(config(["unset", "nope"], { json: false })).rejects.toThrow("process.exit");
	});
});

describe("config path", () => {
	it("prints the preferences file path", async () => {
		await config(["path"], { json: false });
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("preferences.json"));
	});
});

describe("config with no subcommand", () => {
	it("prints usage and exits", async () => {
		await expect(config([], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage: thermoworks config"));
	});
});
