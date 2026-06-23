import type { DeviceEvent } from "thermoworks-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
	MarkdownString: class {
		value: string;
		constructor(value: string) {
			this.value = value;
		}
	},
}));

// ─── Imports (after mock) ────────────────────────────────────────────────────

import { EventNode, EventsFolderNode, formatEventTime } from "../src/tree/tree-items";

// ─── Test fixtures ───────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<DeviceEvent> = {}): DeviceEvent {
	return {
		id: "evt-001",
		eventType: "High Alarm",
		severity: 3,
		eventTime: new Date("2026-06-07T12:00:00Z"),
		deviceId: "ABC123",
		channelId: "ch-1",
		accountId: "account-1",
		valueBefore: "225",
		valueAfter: "285",
		groups: null,
		...overrides,
	};
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("events-panel", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("EventsFolderNode", () => {
		it("creates with collapsed state and event count", () => {
			const node = new EventsFolderNode(5);
			expect(node.label).toBe("Events");
			expect(node.collapsibleState).toBe(1); // Collapsed
			expect(node.description).toBe("5");
			expect(node.id).toBe("thermoworks-events");
			expect(node.contextValue).toBe("eventsFolder");
			expect((node.iconPath as { id: string }).id).toBe("history");
		});

		it("shows zero count when no events", () => {
			const node = new EventsFolderNode(0);
			expect(node.description).toBe("0");
		});
	});

	describe("EventNode", () => {
		it("creates with event type as label", () => {
			const event = makeEvent();
			const node = new EventNode(event);
			expect(node.label).toBe("High Alarm");
			expect(node.id).toBe("thermoworks-event-evt-001");
			expect(node.contextValue).toBe("event");
		});

		it("stores the event reference", () => {
			const event = makeEvent();
			const node = new EventNode(event);
			expect(node.event).toBe(event);
		});

		it("shows error icon with red color for critical severity (>=3)", () => {
			const event = makeEvent({ severity: 3 });
			const node = new EventNode(event);
			expect((node.iconPath as { id: string }).id).toBe("error");
			expect((node.iconPath as { color: { id: string } }).color.id).toBe("charts.red");
		});

		it("shows error icon for severity 4 and above", () => {
			const event = makeEvent({ severity: 5 });
			const node = new EventNode(event);
			expect((node.iconPath as { id: string }).id).toBe("error");
			expect((node.iconPath as { color: { id: string } }).color.id).toBe("charts.red");
		});

		it("shows warning icon with orange color for medium severity (2)", () => {
			const event = makeEvent({ severity: 2 });
			const node = new EventNode(event);
			expect((node.iconPath as { id: string }).id).toBe("warning");
			expect((node.iconPath as { color: { id: string } }).color.id).toBe("charts.orange");
		});

		it("shows info icon with blue color for low severity (1)", () => {
			const event = makeEvent({ severity: 1 });
			const node = new EventNode(event);
			expect((node.iconPath as { id: string }).id).toBe("info");
			expect((node.iconPath as { color: { id: string } }).color.id).toBe("charts.blue");
		});

		it("shows info icon for severity 0", () => {
			const event = makeEvent({ severity: 0 });
			const node = new EventNode(event);
			expect((node.iconPath as { id: string }).id).toBe("info");
			expect((node.iconPath as { color: { id: string } }).color.id).toBe("charts.blue");
		});

		it("description includes channel, values, and formatted time", () => {
			const event = makeEvent({
				deviceId: "SN12345678",
				channelId: "2",
				valueBefore: "165",
				valueAfter: "180",
			});
			const node = new EventNode(event);
			const desc = node.description as string;
			// Channel, value change, and formatted date (no device ID)
			expect(desc).not.toContain("SN12345678");
			expect(desc).toContain("Ch 2");
			expect(desc).toContain("165 → 180");
		});

		it("description omits device ID entirely", () => {
			const event = makeEvent({
				deviceId: "ABC123",
				channelId: null,
				valueBefore: null,
				valueAfter: null,
			});
			const node = new EventNode(event);
			const desc = node.description as string;
			expect(desc).not.toContain("ABC123");
			expect(desc).not.toContain("…");
		});

		it("sets command to showEventDetails with event argument", () => {
			const event = makeEvent();
			const node = new EventNode(event);
			expect(node.command).toEqual({
				command: "thermoworks.showEventDetails",
				title: "Show Event Details",
				arguments: [event],
			});
		});

		it("includes channel in tooltip when present", () => {
			const event = makeEvent({ channelId: "ch-2" });
			const node = new EventNode(event);
			const tooltipValue = (node.tooltip as { value: string }).value;
			expect(tooltipValue).toContain("Channel: ch-2");
		});

		it("omits channel in tooltip when null", () => {
			const event = makeEvent({ channelId: null });
			const node = new EventNode(event);
			const tooltipValue = (node.tooltip as { value: string }).value;
			expect(tooltipValue).not.toContain("Channel:");
		});

		it("includes value change in tooltip when present", () => {
			const event = makeEvent({ valueBefore: "200", valueAfter: "250" });
			const node = new EventNode(event);
			const tooltipValue = (node.tooltip as { value: string }).value;
			expect(tooltipValue).toContain("200");
			expect(tooltipValue).toContain("250");
		});

		it("omits value change in tooltip when both are null", () => {
			const event = makeEvent({ valueBefore: null, valueAfter: null });
			const node = new EventNode(event);
			const tooltipValue = (node.tooltip as { value: string }).value;
			expect(tooltipValue).not.toContain("Change:");
		});

		it("shows – for null valueBefore with present valueAfter", () => {
			const event = makeEvent({ valueBefore: null, valueAfter: "250" });
			const node = new EventNode(event);
			const tooltipValue = (node.tooltip as { value: string }).value;
			expect(tooltipValue).toContain("–");
			expect(tooltipValue).toContain("250");
		});

		it("includes event type and severity label in tooltip", () => {
			const event = makeEvent({ eventType: "Low Battery Alert", severity: 2 });
			const node = new EventNode(event);
			const tooltipValue = (node.tooltip as { value: string }).value;
			expect(tooltipValue).toContain("Low Battery Alert");
			expect(tooltipValue).toContain("warning");
		});

		it("includes device ID in tooltip", () => {
			const event = makeEvent({ deviceId: "XYZ789" });
			const node = new EventNode(event);
			const tooltipValue = (node.tooltip as { value: string }).value;
			expect(tooltipValue).toContain("Device: XYZ789");
		});

		it("includes relative time in tooltip", () => {
			const event = makeEvent({ eventTime: new Date(Date.now() - 120_000) });
			const node = new EventNode(event);
			const tooltipValue = (node.tooltip as { value: string }).value;
			expect(tooltipValue).toContain("Relative:");
		});
	});

	describe("formatEventTime", () => {
		it("returns just time for today", () => {
			const now = new Date();
			const todayEvent = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 30);
			const result = formatEventTime(todayEvent);
			expect(result).toMatch(/2:30/);
			expect(result).not.toContain("Yesterday");
		});

		it("returns 'Yesterday' prefix for yesterday", () => {
			const yesterday = new Date();
			yesterday.setDate(yesterday.getDate() - 1);
			yesterday.setHours(9, 15, 0, 0);
			const result = formatEventTime(yesterday);
			expect(result).toContain("Yesterday");
			expect(result).toMatch(/9:15/);
		});

		it("returns month + day + time for older dates this year", () => {
			const now = new Date();
			const older = new Date(now.getFullYear(), 0, 15, 10, 0);
			// Only test if Jan 15 is more than 1 day ago
			if (now.getTime() - older.getTime() > 2 * 86_400_000) {
				const result = formatEventTime(older);
				expect(result).toContain("Jan");
				expect(result).toContain("15");
			}
		});

		it("includes year for dates from a different year", () => {
			const oldDate = new Date(2024, 5, 20, 12, 0);
			const result = formatEventTime(oldDate);
			expect(result).toContain("2024");
		});
	});
});
