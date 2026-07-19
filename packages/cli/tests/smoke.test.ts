import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	formatSmokeDetail,
	formatSmokeTable,
	formatWoodList,
	smoke,
} from "../src/commands/smoke.js";

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe("formatSmokeTable", () => {
	it("renders a header and a row per cut", () => {
		const out = formatSmokeTable([
			{
				meat: "Brisket",
				woods: ["Oak", "Hickory"],
				intensity: "strong",
				note: "Beef takes bold smoke.",
			},
		]);
		expect(out).toContain("Recommended woods");
		expect(out).toContain("Brisket");
		expect(out).toContain("Oak, Hickory");
		expect(out).toContain("strong");
	});
});

describe("formatSmokeDetail", () => {
	it("renders a labeled block for one cut", () => {
		const out = formatSmokeDetail({
			meat: "Salmon",
			woods: ["Alder", "Apple"],
			intensity: "mild",
			note: "Alder is the traditional fish wood.",
		});
		expect(out).toContain("Salmon");
		expect(out).toContain("Woods:");
		expect(out).toContain("Alder, Apple");
		expect(out).toContain("Alder is the traditional fish wood.");
	});
});

describe("formatWoodList", () => {
	it("lists each wood with its strength and note", () => {
		const out = formatWoodList([
			{ wood: "Alder", strength: "mild", note: "Delicate and lightly sweet." },
			{ wood: "Mesquite", strength: "strong", note: "Earthy and intense." },
		]);
		expect(out).toContain("lightest to boldest");
		expect(out).toContain("Alder");
		expect(out).toContain("Mesquite");
		expect(out).toContain("strong");
	});
});

describe("smoke command", () => {
	it("prints a table of every built-in cut", async () => {
		await smoke([]);
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("Smoke wood guide");
		expect(written).toContain("Brisket");
		expect(written).toContain("Salmon");
	});

	it("prints details for a single resolved cut", async () => {
		await smoke(["brisket"]);
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("Brisket");
		expect(written).toContain("Woods:");
	});

	it("resolves aliases", async () => {
		await smoke(["pulled pork"]);
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("Pork Butt");
	});

	it("lists wood profiles with --woods", async () => {
		await smoke(["--woods"]);
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("Wood flavor profiles");
		expect(written).toContain("Hickory");
		expect(written).toContain("Alder");
	});

	it("exits with an error for an unknown meat", async () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		await expect(smoke(["unobtainium"])).rejects.toThrow("exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown meat"));
		exitSpy.mockRestore();
	});

	it("emits a JSON array for the full list", async () => {
		await smoke([], { json: true });
		const written = logSpy.mock.calls.map((c) => c[0]).join("\n");
		const parsed = JSON.parse(written);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].meat).toBe("Brisket");
		expect(parsed[0]).toHaveProperty("woods");
	});

	it("emits a JSON object for a single cut", async () => {
		await smoke(["brisket"], { json: true });
		const written = logSpy.mock.calls.map((c) => c[0]).join("\n");
		const parsed = JSON.parse(written);
		expect(parsed.meat).toBe("Brisket");
		expect(parsed.intensity).toBe("strong");
	});

	it("emits JSON wood profiles for --woods", async () => {
		await smoke(["--woods"], { json: true });
		const written = logSpy.mock.calls.map((c) => c[0]).join("\n");
		const parsed = JSON.parse(written);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed).toHaveLength(8);
		expect(parsed[0]).toHaveProperty("wood");
		expect(parsed[0]).toHaveProperty("strength");
	});
});
