import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── VS Code mock ────────────────────────────────────────────────────────────

const { mockShowQuickPick, mockShowErrorMessage, mockShowInformationMessage } = vi.hoisted(() => ({
	mockShowQuickPick: vi.fn(),
	mockShowErrorMessage: vi.fn(),
	mockShowInformationMessage: vi.fn(),
}));

vi.mock("vscode", () => ({
	window: {
		showQuickPick: mockShowQuickPick,
		showErrorMessage: mockShowErrorMessage,
		showInformationMessage: mockShowInformationMessage,
	},
}));

// ─── SDK mock ────────────────────────────────────────────────────────────────

const { mockGetTemperatureGuide } = vi.hoisted(() => ({
	mockGetTemperatureGuide: vi.fn(),
}));

vi.mock("thermoworks-sdk", () => ({
	ThermoworksCloud: class {
		getTemperatureGuide = mockGetTemperatureGuide;
	},
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { showTemperatureGuide } from "../src/temperature-guide";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMocks() {
	const credentialStore = {
		getCredentials: vi.fn(),
		storeCredentials: vi.fn(),
		deleteCredentials: vi.fn(),
	};
	const clientManager = {
		getClient: vi.fn(() => ({
			getTemperatureGuide: mockGetTemperatureGuide,
		})),
		close: vi.fn(),
	};
	return { credentialStore, clientManager };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("showTemperatureGuide", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows error when not authenticated", async () => {
		const { credentialStore, clientManager } = createMocks();
		credentialStore.getCredentials.mockResolvedValue(null);

		await showTemperatureGuide(clientManager as any, credentialStore as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith(
			"ThermoWorks: Sign in to view the temperature guide.",
		);
		expect(mockShowQuickPick).not.toHaveBeenCalled();
	});

	it("shows error when API call fails", async () => {
		const { credentialStore, clientManager } = createMocks();
		credentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "x" });
		mockGetTemperatureGuide.mockRejectedValue(new Error("Network error"));

		await showTemperatureGuide(clientManager as any, credentialStore as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith(
			"ThermoWorks: Failed to load temperature guide.",
		);
		expect(mockShowQuickPick).not.toHaveBeenCalled();
	});

	it("shows informational message when categories are empty", async () => {
		const { credentialStore, clientManager } = createMocks();
		credentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "x" });
		mockGetTemperatureGuide.mockResolvedValue({ categories: [] });

		await showTemperatureGuide(clientManager as any, credentialStore as any);

		expect(mockShowInformationMessage).toHaveBeenCalledWith(
			"ThermoWorks: Temperature guide is empty.",
		);
		expect(mockShowQuickPick).not.toHaveBeenCalled();
	});

	it("renders categories with label, icon, and warnings", async () => {
		const { credentialStore, clientManager } = createMocks();
		credentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "x" });
		mockGetTemperatureGuide.mockResolvedValue({
			categories: [
				{
					label: "Beef",
					icon: "\uD83E\uDD69",
					warning: "145\u00B0F minimum",
					pullWarning: "Remove at 140\u00B0F",
				},
				{
					label: "Poultry",
					icon: "\uD83C\uDF57",
					warning: "165\u00B0F minimum",
					pullWarning: null,
				},
				{
					label: "Fish",
					icon: "\uD83D\uDC1F",
					warning: null,
					pullWarning: null,
				},
			],
		});

		await showTemperatureGuide(clientManager as any, credentialStore as any);

		expect(mockShowQuickPick).toHaveBeenCalledTimes(1);
		const items = mockShowQuickPick.mock.calls[0][0];
		expect(items).toHaveLength(3);

		// Beef: both warnings
		expect(items[0].label).toBe("\uD83E\uDD69 Beef");
		expect(items[0].detail).toBe("145\u00B0F minimum | Pull: Remove at 140\u00B0F");

		// Poultry: only warning
		expect(items[1].label).toBe("\uD83C\uDF57 Poultry");
		expect(items[1].detail).toBe("165\u00B0F minimum");

		// Fish: no warnings
		expect(items[2].label).toBe("\uD83D\uDC1F Fish");
		expect(items[2].detail).toBeUndefined();
	});

	it("passes matchOnDetail option to QuickPick", async () => {
		const { credentialStore, clientManager } = createMocks();
		credentialStore.getCredentials.mockResolvedValue({ email: "a@b.com", password: "x" });
		mockGetTemperatureGuide.mockResolvedValue({
			categories: [{ label: "Pork", icon: "\uD83D\uDC37", warning: null, pullWarning: null }],
		});

		await showTemperatureGuide(clientManager as any, credentialStore as any);

		const options = mockShowQuickPick.mock.calls[0][1];
		expect(options.matchOnDetail).toBe(true);
		expect(options.placeHolder).toBe("Cooking temperature guide");
	});
});
