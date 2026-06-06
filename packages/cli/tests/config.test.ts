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

describe("loadConfig", () => {
	it("returns default config when file does not exist", async () => {
		mockReadFile.mockRejectedValue(new Error("ENOENT: no such file or directory"));

		const { loadConfig } = await import("../src/config.js");
		const config = await loadConfig();

		expect(config).toEqual({ devices: [], refreshSeconds: 30 });
	});

	it("returns default config when JSON is corrupt", async () => {
		mockReadFile.mockResolvedValue("{not valid json!!!" as any);
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const { loadConfig } = await import("../src/config.js");
		const config = await loadConfig();

		expect(config).toEqual({ devices: [], refreshSeconds: 30 });
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("corrupted"));
	});

	it("returns parsed config when valid", async () => {
		const validConfig = {
			devices: [{ serial: "ABC123", label: "Smoker", channels: [1, 2] }],
			refreshSeconds: 60,
		};
		mockReadFile.mockResolvedValue(JSON.stringify(validConfig) as any);

		const { loadConfig } = await import("../src/config.js");
		const config = await loadConfig();

		expect(config).toEqual(validConfig);
	});

	it("returns default config when refreshSeconds is less than 1", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ refreshSeconds: 0 }) as any);
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const { loadConfig } = await import("../src/config.js");
		const config = await loadConfig();

		expect(config).toEqual({ devices: [], refreshSeconds: 30 });
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("invalid format"));
	});

	it("returns default config when refreshSeconds is negative", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ refreshSeconds: -5 }) as any);
		vi.spyOn(console, "error").mockImplementation(() => {});

		const { loadConfig } = await import("../src/config.js");
		const config = await loadConfig();

		expect(config).toEqual({ devices: [], refreshSeconds: 30 });
	});

	it("returns default config when refreshSeconds is not a number", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ refreshSeconds: "fast" }) as any);
		vi.spyOn(console, "error").mockImplementation(() => {});

		const { loadConfig } = await import("../src/config.js");
		const config = await loadConfig();

		expect(config).toEqual({ devices: [], refreshSeconds: 30 });
	});

	it("returns default config when devices is not an array", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ devices: "not-array" }) as any);
		vi.spyOn(console, "error").mockImplementation(() => {});

		const { loadConfig } = await import("../src/config.js");
		const config = await loadConfig();

		expect(config).toEqual({ devices: [], refreshSeconds: 30 });
	});

	it("returns default config when root value is an array", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify([1, 2, 3]) as any);
		vi.spyOn(console, "error").mockImplementation(() => {});

		const { loadConfig } = await import("../src/config.js");
		const config = await loadConfig();

		expect(config).toEqual({ devices: [], refreshSeconds: 30 });
	});

	it("returns default config when root value is null", async () => {
		mockReadFile.mockResolvedValue("null" as any);
		vi.spyOn(console, "error").mockImplementation(() => {});

		const { loadConfig } = await import("../src/config.js");
		const config = await loadConfig();

		expect(config).toEqual({ devices: [], refreshSeconds: 30 });
	});

	it("merges partial config with defaults - missing refreshSeconds", async () => {
		const partial = {
			devices: [{ serial: "XYZ", label: "Grill", channels: "avg" }],
		};
		mockReadFile.mockResolvedValue(JSON.stringify(partial) as any);

		const { loadConfig } = await import("../src/config.js");
		const config = await loadConfig();

		expect(config.devices).toEqual(partial.devices);
		expect(config.refreshSeconds).toBe(30);
	});

	it("merges partial config with defaults - missing devices", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ refreshSeconds: 120 }) as any);

		const { loadConfig } = await import("../src/config.js");
		const config = await loadConfig();

		expect(config.devices).toEqual([]);
		expect(config.refreshSeconds).toBe(120);
	});

	it("allows refreshSeconds of exactly 1", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ refreshSeconds: 1 }) as any);

		const { loadConfig } = await import("../src/config.js");
		const config = await loadConfig();

		expect(config.refreshSeconds).toBe(1);
	});
});

describe("saveConfig", () => {
	it("creates config directory with mode 0o700", async () => {
		const { saveConfig } = await import("../src/config.js");
		const config = { devices: [], refreshSeconds: 30 };

		await saveConfig(config);

		expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining(".thermoworks"), {
			recursive: true,
			mode: 0o700,
		});
	});

	it("writes JSON with mode 0o600", async () => {
		const { saveConfig } = await import("../src/config.js");
		const config = {
			devices: [{ serial: "A", label: "Test", channels: [1] as number[] | "avg" }],
			refreshSeconds: 45,
		};

		await saveConfig(config);

		expect(mockWriteFile).toHaveBeenCalledWith(
			expect.stringContaining("config.json"),
			expect.any(String),
			{ encoding: "utf8", mode: 0o600 },
		);
	});

	it("writes pretty-printed JSON with trailing newline", async () => {
		const { saveConfig } = await import("../src/config.js");
		const config = { devices: [], refreshSeconds: 30 };

		await saveConfig(config);

		const writtenContent = mockWriteFile.mock.calls[0]?.[1] as string;
		expect(writtenContent).toBe(`${JSON.stringify(config, null, 2)}\n`);
	});

	it("calls mkdir before writeFile", async () => {
		const callOrder: string[] = [];
		mockMkdir.mockImplementation(async () => {
			callOrder.push("mkdir");
			return undefined;
		});
		mockWriteFile.mockImplementation(async () => {
			callOrder.push("writeFile");
		});

		const { saveConfig } = await import("../src/config.js");
		await saveConfig({ devices: [], refreshSeconds: 30 });

		expect(callOrder).toEqual(["mkdir", "writeFile"]);
	});
});

describe("readCache", () => {
	it("returns cached output when within TTL", async () => {
		const entry = { output: "72.4F", timestamp: Date.now() - 5000 };
		mockReadFile.mockResolvedValue(JSON.stringify(entry) as any);

		const { readCache } = await import("../src/config.js");
		const result = await readCache(30_000);

		expect(result).toBe("72.4F");
	});

	it("returns null when cache is expired", async () => {
		const entry = { output: "72.4F", timestamp: Date.now() - 60_000 };
		mockReadFile.mockResolvedValue(JSON.stringify(entry) as any);

		const { readCache } = await import("../src/config.js");
		const result = await readCache(30_000);

		expect(result).toBeNull();
	});

	it("returns null when cache file does not exist", async () => {
		mockReadFile.mockRejectedValue(new Error("ENOENT: no such file or directory"));

		const { readCache } = await import("../src/config.js");
		const result = await readCache(30_000);

		expect(result).toBeNull();
	});

	it("returns null when cache JSON is corrupt", async () => {
		mockReadFile.mockResolvedValue("not json {{" as any);

		const { readCache } = await import("../src/config.js");
		const result = await readCache(30_000);

		expect(result).toBeNull();
	});

	it("returns null when cache entry is missing output field", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ timestamp: Date.now() }) as any);

		const { readCache } = await import("../src/config.js");
		const result = await readCache(30_000);

		expect(result).toBeNull();
	});

	it("returns null when cache entry is missing timestamp field", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ output: "hello" }) as any);

		const { readCache } = await import("../src/config.js");
		const result = await readCache(30_000);

		expect(result).toBeNull();
	});

	it("returns null when output is not a string", async () => {
		const entry = { output: 42, timestamp: Date.now() };
		mockReadFile.mockResolvedValue(JSON.stringify(entry) as any);

		const { readCache } = await import("../src/config.js");
		const result = await readCache(30_000);

		expect(result).toBeNull();
	});

	it("returns null when timestamp is not a number", async () => {
		const entry = { output: "hello", timestamp: "yesterday" };
		mockReadFile.mockResolvedValue(JSON.stringify(entry) as any);

		const { readCache } = await import("../src/config.js");
		const result = await readCache(30_000);

		expect(result).toBeNull();
	});

	it("returns output at exact TTL boundary (just under)", async () => {
		const now = Date.now();
		vi.spyOn(Date, "now").mockReturnValue(now);
		const entry = { output: "edge-case", timestamp: now - 29_999 };
		mockReadFile.mockResolvedValue(JSON.stringify(entry) as any);

		const { readCache } = await import("../src/config.js");
		const result = await readCache(30_000);

		expect(result).toBe("edge-case");
	});

	it("returns null at exact TTL boundary (equal)", async () => {
		const now = Date.now();
		vi.spyOn(Date, "now").mockReturnValue(now);
		const entry = { output: "expired", timestamp: now - 30_000 };
		mockReadFile.mockResolvedValue(JSON.stringify(entry) as any);

		const { readCache } = await import("../src/config.js");
		const result = await readCache(30_000);

		expect(result).toBeNull();
	});
});

describe("writeCache", () => {
	it("creates cache directory with mode 0o700", async () => {
		const { writeCache } = await import("../src/config.js");

		await writeCache("72.4F");

		expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining(".cache"), {
			recursive: true,
			mode: 0o700,
		});
	});

	it("writes cache entry with timestamp", async () => {
		const now = 1717000000000;
		vi.spyOn(Date, "now").mockReturnValue(now);

		const { writeCache } = await import("../src/config.js");
		await writeCache("72.4F");

		const expectedContent = JSON.stringify({ output: "72.4F", timestamp: now });
		expect(mockWriteFile).toHaveBeenCalledWith(
			expect.stringContaining("readings.json"),
			expectedContent,
			{ encoding: "utf8", mode: 0o600 },
		);
	});

	it("does not throw when mkdir fails", async () => {
		mockMkdir.mockRejectedValue(new Error("EPERM: permission denied"));

		const { writeCache } = await import("../src/config.js");

		await expect(writeCache("test")).resolves.toBeUndefined();
	});

	it("does not throw when writeFile fails", async () => {
		mockWriteFile.mockRejectedValue(new Error("ENOSPC: no space left"));

		const { writeCache } = await import("../src/config.js");

		await expect(writeCache("test")).resolves.toBeUndefined();
	});
});

describe("getConfigPath", () => {
	it("returns path containing .thermoworks/config.json", async () => {
		const { getConfigPath } = await import("../src/config.js");
		const path = getConfigPath();

		expect(path).toContain(".thermoworks");
		expect(path).toMatch(/config\.json$/);
	});
});
