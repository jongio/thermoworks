import type { DeviceEvent } from "thermoworks-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── VS Code mock ────────────────────────────────────────────────────────────

const { mockGetConfiguration } = vi.hoisted(() => ({
	mockGetConfiguration: vi.fn(() => ({
		get: (_key: string, defaultValue: number) => defaultValue,
	})),
}));

vi.mock("vscode", () => ({
	ThemeColor: function ThemeColor(this: { id: string }, id: string) {
		this.id = id;
	},
	ThemeIcon: function ThemeIcon(this: { id: string; color?: unknown }, id: string, color?: unknown) {
		this.id = id;
		this.color = color;
	},
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
	EventEmitter: class {
		private handlers: Array<(...args: unknown[]) => void> = [];
		event = (handler: (...args: unknown[]) => void) => {
			this.handlers.push(handler);
			return { dispose: () => {} };
		};
		fire(data?: unknown) {
			for (const h of this.handlers) h(data);
		}
		dispose() {}
	},
	workspace: {
		getConfiguration: mockGetConfiguration,
	},
}));

// ─── SDK mock ────────────────────────────────────────────────────────────────

const { mockGetEvents, mockGetDeviceEvents } = vi.hoisted(() => ({
	mockGetEvents: vi.fn(),
	mockGetDeviceEvents: vi.fn(),
}));

vi.mock("thermoworks-sdk", () => ({
	ThermoworksCloud: class {
		getEvents = mockGetEvents;
		getDeviceEvents = mockGetDeviceEvents;
		close = vi.fn();
	},
	formatTimeAgo: (date: Date) => {
		const ms = Date.now() - date.getTime();
		const min = Math.floor(ms / 60_000);
		return `${min}m ago`;
	},
	getChannelAlarmState: () => "none",
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { EventsTreeProvider } from "../src/tree/events-tree-provider";
import { ErrorNode, EventNode } from "../src/tree/tree-items";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function makeCredentialStore(hasCredentials: boolean) {
	return {
		getCredentials: vi.fn(async () =>
			hasCredentials ? { email: "test@example.com", password: "pass123" } : null,
		),
	};
}

function makeClientManager() {
	return {
		getClient: vi.fn(() => ({
			getEvents: mockGetEvents,
			getDeviceEvents: mockGetDeviceEvents,
		})),
		close: vi.fn(),
	};
}

function createProvider(hasCredentials = true) {
	const cs = makeCredentialStore(hasCredentials);
	const cm = makeClientManager();
	return { provider: new EventsTreeProvider(cs as any, cm as any), cs, cm };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("EventsTreeProvider", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("getChildren (root)", () => {
		it("shows error when not authenticated", async () => {
			const { provider } = createProvider(false);
			const children = await provider.getChildren();
			expect(children.length).toBe(1);
			expect(children[0]).toBeInstanceOf(ErrorNode);
			expect((children[0] as ErrorNode).label).toBe("Sign in to view events");
		});

		it("returns EventNode items when events exist", async () => {
			const { provider } = createProvider(true);
			mockGetEvents.mockResolvedValue([
				makeEvent({ id: "evt-1" }),
				makeEvent({ id: "evt-2", eventType: "Low Alarm", severity: 2 }),
			]);

			const children = await provider.getChildren();
			expect(children.length).toBe(2);
			expect(children[0]).toBeInstanceOf(EventNode);
			expect(children[1]).toBeInstanceOf(EventNode);
		});

		it("shows empty message when no events found", async () => {
			const { provider } = createProvider(true);
			mockGetEvents.mockResolvedValue([]);

			const children = await provider.getChildren();
			expect(children.length).toBe(1);
			expect(children[0]).toBeInstanceOf(ErrorNode);
			expect((children[0] as ErrorNode).label).toBe("No events found");
		});

		it("shows error message on SDK failure", async () => {
			const { provider } = createProvider(true);
			mockGetEvents.mockRejectedValue(new Error("Network error"));

			const children = await provider.getChildren();
			expect(children.length).toBe(1);
			expect(children[0]).toBeInstanceOf(ErrorNode);
			expect((children[0] as ErrorNode).label).toBe("Network error");
		});
	});

	describe("eventsLimit setting", () => {
		it("respects eventsLimit from configuration", async () => {
			mockGetConfiguration.mockReturnValue({
				get: (key: string, def: number) => (key === "eventsLimit" ? 10 : def),
			});
			const { provider } = createProvider(true);
			mockGetEvents.mockResolvedValue([]);

			await provider.getChildren();

			expect(mockGetEvents).toHaveBeenCalledWith({ limit: 10 });
		});

		it("uses default limit of 20 when not configured", async () => {
			mockGetConfiguration.mockReturnValue({
				get: (_key: string, def: number) => def,
			});
			const { provider } = createProvider(true);
			mockGetEvents.mockResolvedValue([]);

			await provider.getChildren();

			expect(mockGetEvents).toHaveBeenCalledWith({ limit: 20 });
		});
	});

	describe("per-device filtering", () => {
		it("calls getDeviceEvents when device filter is set", async () => {
			const { provider } = createProvider(true);
			mockGetDeviceEvents.mockResolvedValue([makeEvent()]);
			provider.setDeviceFilter("ABC123", "Smoker");

			const children = await provider.getChildren();

			expect(mockGetDeviceEvents).toHaveBeenCalledWith("ABC123", 20);
			expect(mockGetEvents).not.toHaveBeenCalled();
			expect(children.length).toBe(1);
			expect(children[0]).toBeInstanceOf(EventNode);
		});

		it("uses getEvents when filter is cleared", async () => {
			const { provider } = createProvider(true);
			mockGetDeviceEvents.mockResolvedValue([makeEvent()]);
			mockGetEvents.mockResolvedValue([makeEvent(), makeEvent({ id: "evt-2" })]);

			provider.setDeviceFilter("ABC123", "Smoker");
			provider.clearDeviceFilter();

			const children = await provider.getChildren();

			expect(mockGetEvents).toHaveBeenCalledWith({ limit: 20 });
			expect(children.length).toBe(2);
		});

		it("getDeviceFilter returns current filter", () => {
			const { provider } = createProvider(true);
			expect(provider.getDeviceFilter()).toBeUndefined();

			provider.setDeviceFilter("XYZ789", "Fridge");
			expect(provider.getDeviceFilter()).toEqual({ serial: "XYZ789", label: "Fridge" });

			provider.clearDeviceFilter();
			expect(provider.getDeviceFilter()).toBeUndefined();
		});
	});

	describe("severity icons", () => {
		it("renders critical events with error icon", async () => {
			const { provider } = createProvider(true);
			mockGetEvents.mockResolvedValue([makeEvent({ severity: 3 })]);

			const children = await provider.getChildren();
			const node = children[0] as EventNode;
			expect((node.iconPath as { id: string }).id).toBe("error");
		});

		it("renders warning events with warning icon", async () => {
			const { provider } = createProvider(true);
			mockGetEvents.mockResolvedValue([makeEvent({ severity: 2 })]);

			const children = await provider.getChildren();
			const node = children[0] as EventNode;
			expect((node.iconPath as { id: string }).id).toBe("warning");
		});

		it("renders info events with info icon", async () => {
			const { provider } = createProvider(true);
			mockGetEvents.mockResolvedValue([makeEvent({ severity: 1 })]);

			const children = await provider.getChildren();
			const node = children[0] as EventNode;
			expect((node.iconPath as { id: string }).id).toBe("info");
		});
	});

	describe("dispose", () => {
		it("returns empty array after dispose", async () => {
			const { provider } = createProvider(true);
			mockGetEvents.mockResolvedValue([makeEvent()]);

			provider.dispose();
			const children = await provider.getChildren();
			expect(children).toEqual([]);
		});
	});
});
