import type { SearchResult } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockSearch = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		search = mockSearch;
		close = mockClose;
	}

	return { ...actual, ThermoworksCloud: MockThermoworksCloud };
});

vi.mock("../src/credentials.js", () => ({
	getCredentials: vi.fn(),
}));

import { ThermoworksCloud } from "thermoworks-sdk";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);

const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockSearch = vi.mocked(mockClient.search);

// --- Helpers ---

const DEVICE_HITS: SearchResult = {
	hits: [
		{ id: "AB1234", score: 0.95, document: { label: "Pit Boss Smoker", serial: "AB1234" } },
		{ id: "CD5678", score: 0.82, document: { label: "Brisket Probe", serial: "CD5678" } },
	],
	totalHits: 2,
	page: 1,
};

const EMPTY_RESULT: SearchResult = {
	hits: [],
	totalHits: 0,
	page: 1,
};

// --- Test suites ---

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
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

// =============================================================================
// search (default device collection)
// =============================================================================

describe("search", () => {
	it("searches devices by default", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSearch.mockResolvedValue(DEVICE_HITS);

		const { search } = await import("../src/commands/search.js");
		await search(["brisket"], { json: false });

		expect(mockSearch).toHaveBeenCalledWith("brisket", { collection: "device", pageSize: 20 });
		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("AB1234");
		expect(output).toContain("Pit Boss Smoker");
		expect(output).toContain("(score: 0.95)");
	});

	it("joins multiple positional args into a single query", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSearch.mockResolvedValue(DEVICE_HITS);

		const { search } = await import("../src/commands/search.js");
		await search(["pit", "boss"], { json: false });

		expect(mockSearch).toHaveBeenCalledWith("pit boss", { collection: "device", pageSize: 20 });
	});

	it("exits with usage when no query is provided", async () => {
		const { search } = await import("../src/commands/search.js");
		await expect(search([], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
	});

	it("exits with error when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);

		const { search } = await import("../src/commands/search.js");
		await expect(search(["brisket"], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
	});
});

// =============================================================================
// search --collection
// =============================================================================

describe("search --collection", () => {
	it("searches accounts collection", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		const accountResult: SearchResult = {
			hits: [{ id: "ACC1", score: 0.9, document: { name: "Jon's BBQ" } }],
			totalHits: 1,
			page: 1,
		};
		mockSearch.mockResolvedValue(accountResult);

		const { search } = await import("../src/commands/search.js");
		await search(["bbq", "--collection", "accounts"], { json: false });

		expect(mockSearch).toHaveBeenCalledWith("bbq", { collection: "accounts", pageSize: 20 });
		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("ACC1");
		expect(output).toContain("Jon's BBQ");
	});

	it("searches users collection", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		const userResult: SearchResult = {
			hits: [{ id: "USR1", score: 0.88, document: { email: "chef@example.com" } }],
			totalHits: 1,
			page: 1,
		};
		mockSearch.mockResolvedValue(userResult);

		const { search } = await import("../src/commands/search.js");
		await search(["chef", "--collection", "users"], { json: false });

		expect(mockSearch).toHaveBeenCalledWith("chef", { collection: "users", pageSize: 20 });
		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("USR1");
		expect(output).toContain("chef@example.com");
	});

	it("rejects invalid collection with error", async () => {
		const { search } = await import("../src/commands/search.js");
		await expect(search(["q", "--collection", "invalid"], { json: false })).rejects.toThrow(
			"process.exit",
		);

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid collection: invalid"));
	});
});

// =============================================================================
// search --limit
// =============================================================================

describe("search --limit", () => {
	it("passes custom limit as pageSize", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSearch.mockResolvedValue(DEVICE_HITS);

		const { search } = await import("../src/commands/search.js");
		await search(["brisket", "--limit", "5"], { json: false });

		expect(mockSearch).toHaveBeenCalledWith("brisket", { collection: "device", pageSize: 5 });
	});

	it("rejects limit of 0", async () => {
		const { search } = await import("../src/commands/search.js");
		await expect(search(["q", "--limit", "0"], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid limit: 0"));
	});

	it("rejects limit above 100", async () => {
		const { search } = await import("../src/commands/search.js");
		await expect(search(["q", "--limit", "101"], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid limit: 101"));
	});

	it("rejects non-integer limit", async () => {
		const { search } = await import("../src/commands/search.js");
		await expect(search(["q", "--limit", "abc"], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid limit: abc"));
	});

	it("rejects negative limit", async () => {
		const { search } = await import("../src/commands/search.js");
		await expect(search(["q", "--limit", "-5"], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid limit: -5"));
	});
});

// =============================================================================
// search (human output formatting)
// =============================================================================

describe("search human output", () => {
	it("shows id, label, and score per hit", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSearch.mockResolvedValue(DEVICE_HITS);

		const { search } = await import("../src/commands/search.js");
		await search(["brisket"], { json: false });

		const lines = logSpy.mock.calls.map((c) => c[0] as string);
		expect(lines[0]).toMatch(/AB1234\s+Pit Boss Smoker\s+\(score: 0\.95\)/);
		expect(lines[1]).toMatch(/CD5678\s+Brisket Probe\s+\(score: 0\.82\)/);
	});

	it("handles documents without a label field gracefully", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		const noLabelResult: SearchResult = {
			hits: [{ id: "XY999", score: 0.5, document: {} }],
			totalHits: 1,
			page: 1,
		};
		mockSearch.mockResolvedValue(noLabelResult);

		const { search } = await import("../src/commands/search.js");
		await search(["test"], { json: false });

		const output = logSpy.mock.calls[0][0] as string;
		expect(output).toContain("XY999");
		expect(output).toContain("(score: 0.50)");
	});

	it("uses serial as label when label is absent but serial is present", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		const serialResult: SearchResult = {
			hits: [{ id: "Z100", score: 0.75, document: { serial: "M100009168" } }],
			totalHits: 1,
			page: 1,
		};
		mockSearch.mockResolvedValue(serialResult);

		const { search } = await import("../src/commands/search.js");
		await search(["test"], { json: false });

		const output = logSpy.mock.calls[0][0] as string;
		expect(output).toContain("M100009168");
	});
});

// =============================================================================
// search empty results
// =============================================================================

describe("search empty results", () => {
	it("prints no-results message when hits are empty", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSearch.mockResolvedValue(EMPTY_RESULT);

		const { search } = await import("../src/commands/search.js");
		await search(["nonexistent"], { json: false });

		expect(logSpy).toHaveBeenCalledWith('No results found for "nonexistent".');
	});

	it("prints no-results message with multi-word query", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSearch.mockResolvedValue(EMPTY_RESULT);

		const { search } = await import("../src/commands/search.js");
		await search(["does", "not", "exist"], { json: false });

		expect(logSpy).toHaveBeenCalledWith('No results found for "does not exist".');
	});
});

// =============================================================================
// search --json
// =============================================================================

describe("search --json", () => {
	it("outputs the full SearchResult as JSON", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSearch.mockResolvedValue(DEVICE_HITS);

		const { search } = await import("../src/commands/search.js");
		await search(["brisket"], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual(DEVICE_HITS);
	});

	it("outputs empty SearchResult as JSON when no hits", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSearch.mockResolvedValue(EMPTY_RESULT);

		const { search } = await import("../src/commands/search.js");
		await search(["nothing"], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output.hits).toEqual([]);
		expect(output.totalHits).toBe(0);
	});

	it("outputs valid JSON with no ANSI codes", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSearch.mockResolvedValue(DEVICE_HITS);

		const { search } = await import("../src/commands/search.js");
		await search(["brisket"], { json: true });

		const raw = logSpy.mock.calls[0][0] as string;
		expect(raw).not.toContain("\u001b[");
		expect(() => JSON.parse(raw)).not.toThrow();
	});
});
