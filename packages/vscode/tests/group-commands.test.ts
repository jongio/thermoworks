import { afterEach, describe, expect, it, vi } from "vitest";

// ─── VS Code mock ───────────────────────────────────────────────────────────

const showQuickPick = vi.fn();
const showInputBox = vi.fn();
const showErrorMessage = vi.fn();
const showInformationMessage = vi.fn();

vi.mock("vscode", () => ({
	window: {
		showQuickPick: (...args: unknown[]) => showQuickPick(...args),
		showInputBox: (...args: unknown[]) => showInputBox(...args),
		showErrorMessage: (...args: unknown[]) => showErrorMessage(...args),
		showInformationMessage: (...args: unknown[]) => showInformationMessage(...args),
	},
	TreeItem: class {},
	TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
	ThemeIcon: class {
		constructor(public id: string) {}
	},
}));

// ─── SDK mock (required by tree-items.ts import chain) ──────────────────────

vi.mock("thermoworks-sdk", () => ({
	formatTimeAgo: () => "just now",
	getChannelAlarmState: () => null,
}));

// ─── SDK mock ───────────────────────────────────────────────────────────────

const mockGetDeviceGroups = vi.fn();
const mockCreateDeviceGroup = vi.fn();
const mockAddDeviceToGroup = vi.fn();
const mockRemoveDeviceFromGroup = vi.fn();

const mockClient = {
	getDeviceGroups: mockGetDeviceGroups,
	createDeviceGroup: mockCreateDeviceGroup,
	addDeviceToGroup: mockAddDeviceToGroup,
	removeDeviceFromGroup: mockRemoveDeviceFromGroup,
};

const mockGetCredentials = vi.fn();
const mockGetClient = vi.fn().mockReturnValue(mockClient);
const mockRefresh = vi.fn();
const mockClearGroupCache = vi.fn();

const mockCredentialStore = { getCredentials: mockGetCredentials } as any;
const mockClientManager = { getClient: mockGetClient } as any;
const mockTreeProvider = { refresh: mockRefresh, clearGroupCache: mockClearGroupCache } as any;

import { addToGroup, removeFromGroup } from "../src/group-commands";

afterEach(() => {
	vi.clearAllMocks();
});

function makeDeviceNode(serial: string): any {
	return { serial, label: `Device ${serial}` };
}

describe("addToGroup", () => {
	it("adds device to existing group", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a", password: "b" });
		mockGetDeviceGroups.mockResolvedValue([
			{ id: "g1", name: "Kitchen", devices: [] },
			{ id: "g2", name: "Backyard", devices: [] },
		]);
		showQuickPick.mockResolvedValue({ label: "Kitchen", groupId: "g1" });

		await addToGroup(
			makeDeviceNode("ABC123"),
			mockClientManager,
			mockCredentialStore,
			mockTreeProvider,
		);

		expect(mockAddDeviceToGroup).toHaveBeenCalledWith("g1", "ABC123");
		expect(showInformationMessage).toHaveBeenCalledWith('Added to "Kitchen".');
		expect(mockRefresh).toHaveBeenCalled();
	});

	it("creates new group when user selects create option", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a", password: "b" });
		mockGetDeviceGroups.mockResolvedValue([]);
		showQuickPick.mockResolvedValue({ label: "$(add) Create New Group…", groupId: "__new__" });
		showInputBox.mockResolvedValue("Patio");
		mockCreateDeviceGroup.mockResolvedValue({ id: "new-1", name: "Patio", devices: ["ABC123"] });

		await addToGroup(
			makeDeviceNode("ABC123"),
			mockClientManager,
			mockCredentialStore,
			mockTreeProvider,
		);

		expect(mockCreateDeviceGroup).toHaveBeenCalledWith("Patio", ["ABC123"]);
		expect(showInformationMessage).toHaveBeenCalledWith('Created "Patio" and added device.');
		expect(mockClearGroupCache).toHaveBeenCalled();
		expect(mockRefresh).toHaveBeenCalled();
	});

	it("aborts when quick pick is cancelled", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a", password: "b" });
		mockGetDeviceGroups.mockResolvedValue([{ id: "g1", name: "Kitchen", devices: [] }]);
		showQuickPick.mockResolvedValue(undefined);

		await addToGroup(
			makeDeviceNode("ABC123"),
			mockClientManager,
			mockCredentialStore,
			mockTreeProvider,
		);

		expect(mockAddDeviceToGroup).not.toHaveBeenCalled();
		expect(mockCreateDeviceGroup).not.toHaveBeenCalled();
		expect(mockRefresh).not.toHaveBeenCalled();
	});

	it("aborts when new group name input is cancelled", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a", password: "b" });
		mockGetDeviceGroups.mockResolvedValue([]);
		showQuickPick.mockResolvedValue({ label: "$(add) Create New Group…", groupId: "__new__" });
		showInputBox.mockResolvedValue(undefined);

		await addToGroup(
			makeDeviceNode("ABC123"),
			mockClientManager,
			mockCredentialStore,
			mockTreeProvider,
		);

		expect(mockCreateDeviceGroup).not.toHaveBeenCalled();
	});

	it("returns early when not authenticated", async () => {
		mockGetCredentials.mockResolvedValue(null);

		await addToGroup(
			makeDeviceNode("ABC123"),
			mockClientManager,
			mockCredentialStore,
			mockTreeProvider,
		);

		expect(mockGetDeviceGroups).not.toHaveBeenCalled();
	});
});

describe("removeFromGroup", () => {
	it("removes device from single group without prompt", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a", password: "b" });
		mockGetDeviceGroups.mockResolvedValue([{ id: "g1", name: "Kitchen", devices: ["ABC123"] }]);

		await removeFromGroup(
			makeDeviceNode("ABC123"),
			mockClientManager,
			mockCredentialStore,
			mockTreeProvider,
		);

		expect(mockRemoveDeviceFromGroup).toHaveBeenCalledWith("g1", "ABC123");
		expect(showInformationMessage).toHaveBeenCalledWith("Removed from group.");
		expect(showQuickPick).not.toHaveBeenCalled();
		expect(mockRefresh).toHaveBeenCalled();
	});

	it("prompts when device is in multiple groups", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a", password: "b" });
		mockGetDeviceGroups.mockResolvedValue([
			{ id: "g1", name: "Kitchen", devices: ["ABC123"] },
			{ id: "g2", name: "Backyard", devices: ["ABC123"] },
		]);
		showQuickPick.mockResolvedValue({ label: "Backyard", groupId: "g2" });

		await removeFromGroup(
			makeDeviceNode("ABC123"),
			mockClientManager,
			mockCredentialStore,
			mockTreeProvider,
		);

		expect(showQuickPick).toHaveBeenCalled();
		expect(mockRemoveDeviceFromGroup).toHaveBeenCalledWith("g2", "ABC123");
	});

	it("shows info when device is not in any group", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a", password: "b" });
		mockGetDeviceGroups.mockResolvedValue([{ id: "g1", name: "Kitchen", devices: ["OTHER"] }]);

		await removeFromGroup(
			makeDeviceNode("ABC123"),
			mockClientManager,
			mockCredentialStore,
			mockTreeProvider,
		);

		expect(showInformationMessage).toHaveBeenCalledWith("Device is not in any group.");
		expect(mockRemoveDeviceFromGroup).not.toHaveBeenCalled();
	});

	it("aborts when multi-group quick pick is cancelled", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a", password: "b" });
		mockGetDeviceGroups.mockResolvedValue([
			{ id: "g1", name: "Kitchen", devices: ["ABC123"] },
			{ id: "g2", name: "Backyard", devices: ["ABC123"] },
		]);
		showQuickPick.mockResolvedValue(undefined);

		await removeFromGroup(
			makeDeviceNode("ABC123"),
			mockClientManager,
			mockCredentialStore,
			mockTreeProvider,
		);

		expect(mockRemoveDeviceFromGroup).not.toHaveBeenCalled();
	});

	it("returns early when not authenticated", async () => {
		mockGetCredentials.mockResolvedValue(null);

		await removeFromGroup(
			makeDeviceNode("ABC123"),
			mockClientManager,
			mockCredentialStore,
			mockTreeProvider,
		);

		expect(mockGetDeviceGroups).not.toHaveBeenCalled();
	});
});
