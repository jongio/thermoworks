import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises");

describe("loadConfig()", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	async function importConfig() {
		const mod = await import("../src/config.js");
		return mod;
	}

	it("returns default config when file is missing", async () => {
		const fs = await import("node:fs/promises");
		vi.mocked(fs.readFile).mockRejectedValue(
			Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
		);

		const { loadConfig } = await importConfig();
		const config = await loadConfig();

		expect(config).toEqual({ devices: [], refreshSeconds: 30 });
	});

	it("parses valid config with devices", async () => {
		const validConfig = {
			devices: [
				{ serial: "ABC123", label: "Smoker", channels: "avg" },
				{ serial: "DEF456", label: "Oven", channels: [1, 2] },
			],
			refreshSeconds: 60,
		};

		const fs = await import("node:fs/promises");
		vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(validConfig));

		const { loadConfig } = await importConfig();
		const config = await loadConfig();

		expect(config.devices).toHaveLength(2);
		expect(config.devices[0]).toEqual({ serial: "ABC123", label: "Smoker", channels: "avg" });
		expect(config.devices[1]).toEqual({ serial: "DEF456", label: "Oven", channels: [1, 2] });
		expect(config.refreshSeconds).toBe(60);
	});

	it("filters out malformed device entries (missing serial)", async () => {
		const configWithBadEntries = {
			devices: [
				{ serial: "GOOD1", label: "Valid", channels: "avg" },
				{ label: "No Serial", channels: [1] },
				{ serial: "", label: "Empty Serial", channels: [1] },
			],
		};

		const fs = await import("node:fs/promises");
		vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(configWithBadEntries));

		const { loadConfig } = await importConfig();
		const config = await loadConfig();

		expect(config.devices).toHaveLength(1);
		expect(config.devices[0]!.serial).toBe("GOOD1");
	});

	it("filters out entries with invalid channels", async () => {
		const configWithBadChannels = {
			devices: [
				{ serial: "A", label: "Good Avg", channels: "avg" },
				{ serial: "B", label: "Good Array", channels: [1, 2, 3] },
				{ serial: "C", label: "Bad String", channels: "max" },
				{ serial: "D", label: "Bad Mixed", channels: [1, "two"] },
				{ serial: "E", label: "No Channels" },
			],
		};

		const fs = await import("node:fs/promises");
		vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(configWithBadChannels));

		const { loadConfig } = await importConfig();
		const config = await loadConfig();

		expect(config.devices).toHaveLength(2);
		expect(config.devices.map((d) => d.serial)).toEqual(["A", "B"]);
	});

	it("returns default on corrupt JSON", async () => {
		const fs = await import("node:fs/promises");
		vi.mocked(fs.readFile).mockResolvedValue("{ not valid json }}}}");

		const { loadConfig } = await importConfig();
		const config = await loadConfig();

		expect(config).toEqual({ devices: [], refreshSeconds: 30 });
	});

	it("returns default when config is an array (invalid root type)", async () => {
		const fs = await import("node:fs/promises");
		vi.mocked(fs.readFile).mockResolvedValue("[1, 2, 3]");

		const { loadConfig } = await importConfig();
		const config = await loadConfig();

		expect(config).toEqual({ devices: [], refreshSeconds: 30 });
	});

	it("returns default when refreshSeconds is invalid", async () => {
		const fs = await import("node:fs/promises");
		vi.mocked(fs.readFile).mockResolvedValue(
			JSON.stringify({ refreshSeconds: 0, devices: [] }),
		);

		const { loadConfig } = await importConfig();
		const config = await loadConfig();

		expect(config).toEqual({ devices: [], refreshSeconds: 30 });
	});

	it("returns default when devices is not an array", async () => {
		const fs = await import("node:fs/promises");
		vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ devices: "not-an-array" }));

		const { loadConfig } = await importConfig();
		const config = await loadConfig();

		expect(config).toEqual({ devices: [], refreshSeconds: 30 });
	});

	it("uses default refreshSeconds when not specified in config", async () => {
		const validConfig = {
			devices: [{ serial: "X", label: "Probe", channels: [1] }],
		};

		const fs = await import("node:fs/promises");
		vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(validConfig));

		const { loadConfig } = await importConfig();
		const config = await loadConfig();

		expect(config.refreshSeconds).toBe(30);
		expect(config.devices).toHaveLength(1);
	});

	it("filters entries with non-string label", async () => {
		const configWithBadLabel = {
			devices: [
				{ serial: "A", label: "Valid", channels: [1] },
				{ serial: "B", label: 123, channels: [1] },
				{ serial: "C", label: null, channels: "avg" },
			],
		};

		const fs = await import("node:fs/promises");
		vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(configWithBadLabel));

		const { loadConfig } = await importConfig();
		const config = await loadConfig();

		expect(config.devices).toHaveLength(1);
		expect(config.devices[0]!.serial).toBe("A");
	});
});
