import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportScheduler } from "../src/components/ExportScheduler.tsx";

// Mock useDevices to return controlled device data.
vi.mock("../src/hooks/useDevices.ts", () => ({
	useDevices: () => ({
		data: [
			{
				device: { serial: "TW-001", label: "Smoker" },
				channels: [
					{ number: "1", label: "Probe 1", enabled: true, color: "#ff0000", value: 225, units: "F" },
					{ number: "2", label: "Probe 2", enabled: true, color: "#00ff00", value: 165, units: "F" },
				],
			},
			{
				device: { serial: "TW-002", label: "Oven" },
				channels: [
					{ number: "1", label: "Internal", enabled: true, color: "#0000ff", value: 350, units: "F" },
				],
			},
		],
		isLoading: false,
		error: null,
		lastUpdated: new Date(),
		refresh: vi.fn(),
	}),
}));

// Create a mock client.
function createMockClient() {
	return {
		isAuthenticated: true,
		getDevicesWithChannels: vi.fn().mockResolvedValue([]),
	} as unknown as Parameters<typeof ExportScheduler>[0]["client"];
}

const STORAGE_KEY = "thermoworks-export-schedules";

describe("ExportScheduler", () => {
	beforeEach(() => {
		localStorage.clear();
		// Mock URL for download triggers during auto-export on mount.
		vi.stubGlobal("URL", {
			createObjectURL: vi.fn(() => "blob:mock-url"),
			revokeObjectURL: vi.fn(),
		});
	});

	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders the page header", () => {
		render(<ExportScheduler client={createMockClient()} />);
		expect(screen.getByText("Export Schedules")).toBeInTheDocument();
	});

	it("shows empty state when no schedules exist", () => {
		render(<ExportScheduler client={createMockClient()} />);
		expect(
			screen.getByText("No schedules configured. Create one to start automatic exports."),
		).toBeInTheDocument();
	});

	it("shows the create form when 'New Schedule' is clicked", () => {
		render(<ExportScheduler client={createMockClient()} />);

		fireEvent.click(screen.getByText("New Schedule"));
		expect(screen.getByText("New Export Schedule")).toBeInTheDocument();
		expect(screen.getByLabelText("Schedule Name")).toBeInTheDocument();
	});

	it("hides the form when cancel is clicked", () => {
		render(<ExportScheduler client={createMockClient()} />);

		fireEvent.click(screen.getByText("New Schedule"));
		expect(screen.getByText("New Export Schedule")).toBeInTheDocument();

		fireEvent.click(screen.getByText("Cancel"));
		expect(screen.queryByText("New Export Schedule")).not.toBeInTheDocument();
	});

	it("displays device channel options in the form", () => {
		render(<ExportScheduler client={createMockClient()} />);

		fireEvent.click(screen.getByText("New Schedule"));
		expect(screen.getByText("Smoker")).toBeInTheDocument();
		expect(screen.getByText("Probe 1")).toBeInTheDocument();
		expect(screen.getByText("Probe 2")).toBeInTheDocument();
		expect(screen.getByText("Oven")).toBeInTheDocument();
		expect(screen.getByText("Internal")).toBeInTheDocument();
	});

	it("creates a schedule and shows it in the list", () => {
		render(<ExportScheduler client={createMockClient()} />);

		fireEvent.click(screen.getByText("New Schedule"));

		// Fill in name.
		const nameInput = screen.getByLabelText("Schedule Name");
		fireEvent.change(nameInput, { target: { value: "Daily Smoker" } });

		// Select a channel.
		fireEvent.click(screen.getByText("Probe 1"));

		// Submit.
		fireEvent.click(screen.getByText("Create Schedule"));

		// Form should close and schedule should appear.
		expect(screen.queryByText("New Export Schedule")).not.toBeInTheDocument();
		expect(screen.getAllByText("Daily Smoker").length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText("Every day")).toBeInTheDocument();
	});

	it("persists schedule to localStorage on creation", () => {
		render(<ExportScheduler client={createMockClient()} />);

		fireEvent.click(screen.getByText("New Schedule"));
		fireEvent.change(screen.getByLabelText("Schedule Name"), {
			target: { value: "Weekly Export" },
		});
		fireEvent.click(screen.getByText("weekly"));
		fireEvent.click(screen.getByText("Internal"));
		fireEvent.click(screen.getByText("Create Schedule"));

		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
		expect(stored.schedules).toHaveLength(1);
		expect(stored.schedules[0].name).toBe("Weekly Export");
		expect(stored.schedules[0].frequency).toBe("weekly");
	});

	it("removes a schedule when delete is clicked", () => {
		// Pre-populate localStorage with a schedule (recently run so it won't auto-trigger).
		const state = {
			schedules: [
				{
					id: "test-1",
					name: "To Delete",
					frequency: "daily",
					channels: [{ deviceSerial: "TW-001", channelNumber: "1" }],
					createdAt: "2026-06-09T00:00:00Z",
					lastRunAt: new Date().toISOString(),
					enabled: true,
				},
			],
			history: [],
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

		render(<ExportScheduler client={createMockClient()} />);

		expect(screen.getByText("To Delete")).toBeInTheDocument();

		fireEvent.click(screen.getByLabelText("Delete To Delete"));

		expect(screen.queryByText("To Delete")).not.toBeInTheDocument();
	});

	it("toggles a schedule on/off", () => {
		const state = {
			schedules: [
				{
					id: "test-1",
					name: "Toggleable",
					frequency: "daily",
					channels: [{ deviceSerial: "TW-001", channelNumber: "1" }],
					createdAt: "2026-06-09T00:00:00Z",
					lastRunAt: new Date().toISOString(),
					enabled: true,
				},
			],
			history: [],
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

		render(<ExportScheduler client={createMockClient()} />);

		const toggleBtn = screen.getByLabelText("Disable Toggleable");
		expect(toggleBtn).toHaveTextContent("On");

		fireEvent.click(toggleBtn);

		const enableBtn = screen.getByLabelText("Enable Toggleable");
		expect(enableBtn).toHaveTextContent("Off");
	});

	it("shows info banner about how scheduling works", () => {
		render(<ExportScheduler client={createMockClient()} />);
		expect(
			screen.getByText(/Scheduled exports run automatically when you open the app/),
		).toBeInTheDocument();
	});

	it("shows empty history message initially", () => {
		render(<ExportScheduler client={createMockClient()} />);
		expect(screen.getByText("No exports have run yet.")).toBeInTheDocument();
	});

	it("shows history entries when they exist", () => {
		const state = {
			schedules: [],
			history: [
				{
					id: "h1",
					scheduleId: "s1",
					scheduleName: "Morning Export",
					ranAt: "2026-06-09T08:00:00Z",
					channelCount: 3,
					status: "completed",
				},
			],
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

		render(<ExportScheduler client={createMockClient()} />);
		expect(screen.getByText("Morning Export")).toBeInTheDocument();
		expect(screen.getByText(/3 channels/)).toBeInTheDocument();
	});

	it("disables create button when name is empty", () => {
		render(<ExportScheduler client={createMockClient()} />);

		fireEvent.click(screen.getByText("New Schedule"));
		// Select a channel but don't enter a name.
		fireEvent.click(screen.getByText("Probe 1"));

		const submitBtn = screen.getByText("Create Schedule");
		expect(submitBtn).toBeDisabled();
	});

	it("disables create button when no channels are selected", () => {
		render(<ExportScheduler client={createMockClient()} />);

		fireEvent.click(screen.getByText("New Schedule"));
		// Enter a name but don't select channels.
		fireEvent.change(screen.getByLabelText("Schedule Name"), {
			target: { value: "Test" },
		});

		const submitBtn = screen.getByText("Create Schedule");
		expect(submitBtn).toBeDisabled();
	});
});
