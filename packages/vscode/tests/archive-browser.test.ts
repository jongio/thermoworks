import type { Archive, ArchiveChannel } from "thermoworks-sdk";
import { describe, expect, it, vi } from "vitest";

// ─── VS Code mock ────────────────────────────────────────────────────────────

const { MockThemeColor, MockThemeIcon } = vi.hoisted(() => {
	function MockThemeColor(this: { id: string }, id: string) {
		this.id = id;
	}
	function MockThemeIcon(this: { id: string; color?: unknown }, id: string, color?: unknown) {
		this.id = id;
		this.color = color;
	}
	return { MockThemeColor, MockThemeIcon };
});

vi.mock("vscode", () => ({
	ThemeColor: MockThemeColor,
	ThemeIcon: MockThemeIcon,
	TreeItem: class {
		label?: string;
		id?: string;
		description?: string;
		tooltip?: string | object;
		iconPath?: unknown;
		collapsibleState?: number;
		contextValue?: string;
		command?: unknown;
		constructor(label: string, collapsibleState?: number) {
			this.label = label;
			this.collapsibleState = collapsibleState;
		}
	},
	TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
	Uri: { parse: vi.fn((s: string) => ({ toString: () => s })) },
}));

// ─── Imports (after mock) ────────────────────────────────────────────────────

import {
	ArchiveChannelNode,
	ArchiveNode,
	ArchivesFolderNode,
	formatArchiveDuration,
	formatMinMax,
} from "../src/tree/tree-items";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeArchiveChannel(overrides: Partial<ArchiveChannel> = {}): ArchiveChannel {
	return {
		number: "1",
		label: "Pit",
		units: "F",
		value: 225,
		status: "ok",
		enabled: true,
		color: null,
		type: "temperature",
		alarmHigh: null,
		alarmLow: null,
		minimum: { value: 180, units: "F", date: new Date("2026-01-01T10:00:00Z") },
		maximum: { value: 275, units: "F", date: new Date("2026-01-01T12:00:00Z") },
		recentReadings: [],
		...overrides,
	};
}

function makeArchive(overrides: Partial<Archive> = {}): Archive {
	return {
		id: "archive-001",
		start: new Date("2026-01-01T08:00:00Z"),
		end: new Date("2026-01-01T14:30:00Z"),
		count: 390,
		type: "session",
		label: "Brisket Cook",
		deviceLabel: "Backyard Smoker",
		notes: "Low and slow",
		createdOn: new Date("2026-01-01T14:31:00Z"),
		public: false,
		publicLink: null,
		filename: null,
		channels: [makeArchiveChannel(), makeArchiveChannel({ label: "Meat", number: "2" })],
		...overrides,
	};
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("archive-browser", () => {
	describe("ArchivesFolderNode", () => {
		it("creates collapsed folder with history icon", () => {
			const node = new ArchivesFolderNode("ABC123");
			expect(node.label).toBe("Archives");
			expect(node.serial).toBe("ABC123");
			expect(node.collapsibleState).toBe(1); // Collapsed
			expect(node.id).toBe("thermoworks-archives-ABC123");
			expect((node.iconPath as { id: string }).id).toBe("history");
			expect(node.contextValue).toBe("archivesFolder");
		});

		it("generates unique id per device serial", () => {
			const a = new ArchivesFolderNode("DEV-A");
			const b = new ArchivesFolderNode("DEV-B");
			expect(a.id).not.toBe(b.id);
		});
	});

	describe("ArchiveNode", () => {
		it("creates collapsed node with archive label and duration", () => {
			const archive = makeArchive();
			const node = new ArchiveNode(archive, "ABC123");
			expect(node.label).toBe("Brisket Cook");
			expect(node.serial).toBe("ABC123");
			expect(node.archive).toBe(archive);
			expect(node.collapsibleState).toBe(1); // Collapsed
			expect(node.id).toBe("thermoworks-archive-ABC123-archive-001");
			expect(node.contextValue).toBe("archive");
			expect((node.iconPath as { id: string }).id).toBe("notebook");
			expect(node.description).toBe("6h 30m");
		});

		it("uses shortened id as label when archive label is null", () => {
			const archive = makeArchive({ label: null, id: "abcdef123456" });
			const node = new ArchiveNode(archive, "ABC123");
			expect(node.label).toBe("Session abcdef");
		});

		it("shows empty description when start/end are null", () => {
			const archive = makeArchive({ start: null, end: null });
			const node = new ArchiveNode(archive, "ABC123");
			expect(node.description).toBe("");
		});

		it("builds tooltip with session info", () => {
			const archive = makeArchive();
			const node = new ArchiveNode(archive, "ABC123");
			const tooltip = node.tooltip as string;
			expect(tooltip).toContain("Brisket Cook");
			expect(tooltip).toContain("Start:");
			expect(tooltip).toContain("End:");
			expect(tooltip).toContain("Readings: 390");
			expect(tooltip).toContain("Notes: Low and slow");
		});

		it("omits notes from tooltip when null", () => {
			const archive = makeArchive({ notes: null });
			const node = new ArchiveNode(archive, "ABC123");
			const tooltip = node.tooltip as string;
			expect(tooltip).not.toContain("Notes:");
		});
	});

	describe("ArchiveChannelNode", () => {
		it("creates with label and min/max description", () => {
			const channel = makeArchiveChannel();
			const node = new ArchiveChannelNode(channel, "ABC123", "archive-001", 0);
			expect(node.label).toBe("Pit");
			expect(node.description).toBe("min 180\u00B0F / max 275\u00B0F");
			expect(node.id).toBe("thermoworks-archive-ch-ABC123-archive-001-0");
			expect((node.iconPath as { id: string }).id).toBe("graph-line");
			expect(node.contextValue).toBe("archiveChannel");
		});

		it("uses fallback label when channel label is null", () => {
			const channel = makeArchiveChannel({ label: null });
			const node = new ArchiveChannelNode(channel, "ABC123", "archive-001", 2);
			expect(node.label).toBe("Channel 3");
		});

		it("shows -- when min/max are null", () => {
			const channel = makeArchiveChannel({ minimum: null, maximum: null });
			const node = new ArchiveChannelNode(channel, "ABC123", "archive-001", 0);
			expect(node.description).toBe("--");
		});

		it("shows partial min/max when only one is available", () => {
			const channel = makeArchiveChannel({ minimum: null });
			const node = new ArchiveChannelNode(channel, "ABC123", "archive-001", 0);
			expect(node.description).toBe("max 275\u00B0F");
		});
	});

	describe("formatArchiveDuration", () => {
		it("formats hours and minutes", () => {
			const start = new Date("2026-01-01T08:00:00Z");
			const end = new Date("2026-01-01T14:30:00Z");
			expect(formatArchiveDuration(start, end)).toBe("6h 30m");
		});

		it("formats minutes only when less than an hour", () => {
			const start = new Date("2026-01-01T08:00:00Z");
			const end = new Date("2026-01-01T08:45:00Z");
			expect(formatArchiveDuration(start, end)).toBe("45m");
		});

		it("returns empty string when start is null", () => {
			expect(formatArchiveDuration(null, new Date())).toBe("");
		});

		it("returns empty string when end is null", () => {
			expect(formatArchiveDuration(new Date(), null)).toBe("");
		});

		it("returns empty string when end is before start", () => {
			const start = new Date("2026-01-01T14:00:00Z");
			const end = new Date("2026-01-01T08:00:00Z");
			expect(formatArchiveDuration(start, end)).toBe("");
		});

		it("shows 0m for identical start and end", () => {
			const d = new Date("2026-01-01T08:00:00Z");
			expect(formatArchiveDuration(d, d)).toBe("0m");
		});
	});

	describe("formatMinMax", () => {
		it("formats both min and max", () => {
			const ch = makeArchiveChannel();
			expect(formatMinMax(ch)).toBe("min 180\u00B0F / max 275\u00B0F");
		});

		it("returns -- when both are null", () => {
			const ch = makeArchiveChannel({ minimum: null, maximum: null });
			expect(formatMinMax(ch)).toBe("--");
		});

		it("shows only min when max is null", () => {
			const ch = makeArchiveChannel({ maximum: null });
			expect(formatMinMax(ch)).toBe("min 180\u00B0F");
		});

		it("shows only max when min is null", () => {
			const ch = makeArchiveChannel({ minimum: null });
			expect(formatMinMax(ch)).toBe("max 275\u00B0F");
		});

		it("uses channel units as fallback when minmax units is null", () => {
			const ch = makeArchiveChannel({
				minimum: { value: 180, units: null, date: null },
				maximum: { value: 275, units: null, date: null },
			});
			expect(formatMinMax(ch)).toBe("min 180\u00B0F / max 275\u00B0F");
		});

		it("rounds values to integers", () => {
			const ch = makeArchiveChannel({
				minimum: { value: 179.7, units: "F", date: null },
				maximum: { value: 275.3, units: "F", date: null },
			});
			expect(formatMinMax(ch)).toBe("min 180\u00B0F / max 275\u00B0F");
		});
	});
});
