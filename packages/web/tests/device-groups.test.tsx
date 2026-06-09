import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeviceGroups } from "../src/components/DeviceGroups.tsx";
import type { DeviceGroup, DeviceWithChannels } from "../src/lib/api.ts";

function makeDevice(serial: string, label: string): DeviceWithChannels {
	return {
		device: {
			serial,
			deviceId: `dev-${serial}`,
			label,
			type: "ThermaQ WiFi",
			device: "thermaq",
			status: "online",
			battery: 85,
			batteryState: null,
			wifiStrength: -42,
			firmware: "2.1.0",
			color: null,
			thumbnail: null,
			deviceDisplayUnits: null,
			iotDeviceId: null,
			iotCoreDeviceBlocked: null,
			recordingIntervalInSeconds: null,
			transmitIntervalInSeconds: null,
			readInterval: null,
			heartbeatInterval: null,
			temperatureDeltaTrigger: null,
			pendingLoad: null,
			batteryAlertSent: null,
			lastSeen: null,
			lastTelemetrySaved: null,
			latestReading: null,
			lastWifiConnection: null,
			lastBluetoothConnection: null,
			sessionStart: null,
			sessionLabel: null,
			lastArchive: null,
			lastPurged: null,
			assignedToAccountOn: null,
			accountId: null,
			notes: null,
			public: null,
			publicLink: null,
			searModeEnabled: null,
			showSensorChannels: null,
			ringColors: null,
			gateway: null,
			fan: null,
			bigQuery: null,
		},
		channels: [],
	};
}

const mockDevices: DeviceWithChannels[] = [
	makeDevice("ABC-001", "Kitchen Probe"),
	makeDevice("ABC-002", "Smoker"),
	makeDevice("ABC-003", "Outdoor Grill"),
];

const mockGroups: DeviceGroup[] = [
	{ id: "grp-1", name: "Kitchen", devices: ["ABC-001"] },
	{ id: "grp-2", name: "BBQ Setup", devices: ["ABC-002", "ABC-003"] },
];

describe("DeviceGroups", () => {
	it("renders 'All Devices' button and group buttons", () => {
		render(
			<DeviceGroups
				groups={mockGroups}
				devices={mockDevices}
				activeGroupId={null}
				onSelectGroup={vi.fn()}
				onCreateGroup={vi.fn()}
				onDeleteGroup={vi.fn()}
			/>,
		);

		expect(screen.getByText("All Devices")).toBeInTheDocument();
		expect(screen.getByText("Kitchen")).toBeInTheDocument();
		expect(screen.getByText("BBQ Setup")).toBeInTheDocument();
	});

	it("highlights 'All Devices' when no group is active", () => {
		render(
			<DeviceGroups
				groups={mockGroups}
				devices={mockDevices}
				activeGroupId={null}
				onSelectGroup={vi.fn()}
				onCreateGroup={vi.fn()}
				onDeleteGroup={vi.fn()}
			/>,
		);

		const allBtn = screen.getByText("All Devices");
		expect(allBtn.className).toContain("bg-primary");
	});

	it("highlights active group button", () => {
		render(
			<DeviceGroups
				groups={mockGroups}
				devices={mockDevices}
				activeGroupId="grp-1"
				onSelectGroup={vi.fn()}
				onCreateGroup={vi.fn()}
				onDeleteGroup={vi.fn()}
			/>,
		);

		const kitchenBtn = screen.getByText("Kitchen");
		expect(kitchenBtn.className).toContain("bg-primary");

		const allBtn = screen.getByText("All Devices");
		expect(allBtn.className).not.toContain("bg-primary");
	});

	it("calls onSelectGroup with null when 'All Devices' is clicked", () => {
		const onSelectGroup = vi.fn();
		render(
			<DeviceGroups
				groups={mockGroups}
				devices={mockDevices}
				activeGroupId="grp-1"
				onSelectGroup={onSelectGroup}
				onCreateGroup={vi.fn()}
				onDeleteGroup={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByText("All Devices"));
		expect(onSelectGroup).toHaveBeenCalledWith(null);
	});

	it("calls onSelectGroup with group id when group button is clicked", () => {
		const onSelectGroup = vi.fn();
		render(
			<DeviceGroups
				groups={mockGroups}
				devices={mockDevices}
				activeGroupId={null}
				onSelectGroup={onSelectGroup}
				onCreateGroup={vi.fn()}
				onDeleteGroup={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByText("Kitchen"));
		expect(onSelectGroup).toHaveBeenCalledWith("grp-1");
	});

	it("calls onDeleteGroup when delete button is clicked", () => {
		const onDeleteGroup = vi.fn().mockResolvedValue(undefined);
		render(
			<DeviceGroups
				groups={mockGroups}
				devices={mockDevices}
				activeGroupId={null}
				onSelectGroup={vi.fn()}
				onCreateGroup={vi.fn()}
				onDeleteGroup={onDeleteGroup}
			/>,
		);

		const deleteButtons = screen.getAllByTitle(/Delete group/);
		fireEvent.click(deleteButtons[0]);
		expect(onDeleteGroup).toHaveBeenCalledWith("grp-1");
	});

	it("shows device count in group buttons", () => {
		render(
			<DeviceGroups
				groups={mockGroups}
				devices={mockDevices}
				activeGroupId={null}
				onSelectGroup={vi.fn()}
				onCreateGroup={vi.fn()}
				onDeleteGroup={vi.fn()}
			/>,
		);

		expect(screen.getByText("(1)")).toBeInTheDocument();
		expect(screen.getByText("(2)")).toBeInTheDocument();
	});

	it("opens create group dialog when 'New Group' is clicked", () => {
		render(
			<DeviceGroups
				groups={[]}
				devices={mockDevices}
				activeGroupId={null}
				onSelectGroup={vi.fn()}
				onCreateGroup={vi.fn()}
				onDeleteGroup={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByText("New Group"));
		expect(screen.getByText("Create Device Group")).toBeInTheDocument();
		expect(screen.getByLabelText("Group Name")).toBeInTheDocument();
	});

	it("shows device checkboxes in create dialog", () => {
		render(
			<DeviceGroups
				groups={[]}
				devices={mockDevices}
				activeGroupId={null}
				onSelectGroup={vi.fn()}
				onCreateGroup={vi.fn()}
				onDeleteGroup={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByText("New Group"));

		expect(screen.getByText("Kitchen Probe")).toBeInTheDocument();
		expect(screen.getByText("Smoker")).toBeInTheDocument();
		expect(screen.getByText("Outdoor Grill")).toBeInTheDocument();
	});

	it("calls onCreateGroup with name and selected devices on submit", async () => {
		const onCreateGroup = vi.fn().mockResolvedValue(undefined);
		render(
			<DeviceGroups
				groups={[]}
				devices={mockDevices}
				activeGroupId={null}
				onSelectGroup={vi.fn()}
				onCreateGroup={onCreateGroup}
				onDeleteGroup={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByText("New Group"));

		const nameInput = screen.getByLabelText("Group Name");
		fireEvent.change(nameInput, { target: { value: "My Group" } });

		// Select first two devices
		const checkboxes = screen.getAllByRole("checkbox");
		fireEvent.click(checkboxes[0]);
		fireEvent.click(checkboxes[1]);

		fireEvent.click(screen.getByText("Create Group"));

		await waitFor(() => {
			expect(onCreateGroup).toHaveBeenCalledWith("My Group", ["ABC-001", "ABC-002"]);
		});
	});

	it("disables submit when name is empty", () => {
		render(
			<DeviceGroups
				groups={[]}
				devices={mockDevices}
				activeGroupId={null}
				onSelectGroup={vi.fn()}
				onCreateGroup={vi.fn()}
				onDeleteGroup={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByText("New Group"));

		// Select a device but leave name empty
		const checkboxes = screen.getAllByRole("checkbox");
		fireEvent.click(checkboxes[0]);

		const submitBtn = screen.getByText("Create Group");
		expect(submitBtn).toBeDisabled();
	});

	it("disables submit when no devices are selected", () => {
		render(
			<DeviceGroups
				groups={[]}
				devices={mockDevices}
				activeGroupId={null}
				onSelectGroup={vi.fn()}
				onCreateGroup={vi.fn()}
				onDeleteGroup={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByText("New Group"));

		const nameInput = screen.getByLabelText("Group Name");
		fireEvent.change(nameInput, { target: { value: "My Group" } });

		const submitBtn = screen.getByText("Create Group");
		expect(submitBtn).toBeDisabled();
	});

	it("closes dialog when Cancel is clicked", () => {
		render(
			<DeviceGroups
				groups={[]}
				devices={mockDevices}
				activeGroupId={null}
				onSelectGroup={vi.fn()}
				onCreateGroup={vi.fn()}
				onDeleteGroup={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByText("New Group"));
		expect(screen.getByText("Create Device Group")).toBeInTheDocument();

		fireEvent.click(screen.getByText("Cancel"));
		expect(screen.queryByText("Create Device Group")).not.toBeInTheDocument();
	});
});
