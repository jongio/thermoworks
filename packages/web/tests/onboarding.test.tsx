import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Device } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ONBOARDING_COMPLETE_STORAGE_KEY,
	OnboardingWizard,
} from "../src/components/OnboardingWizard.tsx";
import {
	TEMPERATURE_UNIT_STORAGE_KEY,
	TemperatureUnitProvider,
} from "../src/context/TemperatureUnitContext.tsx";
import { NOTIFICATION_PREFERENCE_STORAGE_KEY } from "../src/hooks/useAlarmNotifications.ts";
import type { ThermoworksWebClient } from "../src/lib/api.ts";

let notificationPermission: NotificationPermission = "default";

class MockNotification {
	static get permission() {
		return notificationPermission;
	}

	static requestPermission = vi.fn().mockResolvedValue("granted");
}

function makeDevice(overrides: Partial<Device> = {}): Device {
	return {
		serial: "TW-001",
		deviceId: null,
		label: "Backyard Probe",
		type: "Signals",
		device: "signals",
		status: "online",
		battery: null,
		batteryState: null,
		wifiStrength: null,
		firmware: null,
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
		...overrides,
	};
}

function makeMockClient(
	devices: Device[] = [
		makeDevice(),
		makeDevice({
			serial: "TW-002",
			label: "Kitchen Probe",
			type: "Smoke",
			device: "smoke",
		}),
	],
): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		getDevices: vi.fn().mockResolvedValue(devices),
		logout: vi.fn(),
	} as unknown as ThermoworksWebClient;
}

function renderWizard(client = makeMockClient()) {
	const onComplete = vi.fn();
	render(
		<TemperatureUnitProvider>
			<OnboardingWizard client={client} onComplete={onComplete} />
		</TemperatureUnitProvider>,
	);
	return { client, onComplete };
}

async function goToStep(step: 1 | 2 | 3) {
	const headings = [
		/your devices at a glance/i,
		/set alarms for your cook/i,
		/stay ahead with notifications/i,
	];

	for (let index = 0; index < step; index++) {
		fireEvent.click(screen.getByRole("button", { name: /next/i }));
		await screen.findByRole("heading", { name: headings[index] });
	}
}

async function renderAppWithAuthenticatedClient() {
	vi.resetModules();
	vi.doMock("../src/components/AppLayout.tsx", () => ({
		AppLayout: () => <div data-testid="app-layout">App layout</div>,
	}));
	vi.doMock("../src/components/LandingPage.tsx", () => ({
		LandingPage: () => <div>Landing</div>,
	}));
	vi.doMock("../src/components/LoginForm.tsx", () => ({
		LoginForm: () => <div>Login</div>,
	}));
	vi.doMock("../src/lib/api.ts", () => ({
		ThermoworksWebClient: class {
			isAuthenticated = true;
			getDevices = vi.fn().mockResolvedValue([makeDevice()]);
			logout = vi.fn();
		},
	}));

	const { App } = await import("../src/App.tsx");
	return render(<App />);
}

describe("Onboarding wizard gating", () => {
	beforeEach(() => {
		localStorage.clear();
		notificationPermission = "default";
		MockNotification.requestPermission.mockResolvedValue("granted");
		vi.stubGlobal("Notification", MockNotification);
	});

	afterEach(() => {
		localStorage.clear();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		vi.resetModules();
	});

	it("shows on first login when no onboarding flag or preferences exist", async () => {
		await renderAppWithAuthenticatedClient();

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: /choose your temperature unit/i }),
			).toBeInTheDocument();
		});
	});

	it("does not show when onboarding is already complete", async () => {
		localStorage.setItem(ONBOARDING_COMPLETE_STORAGE_KEY, "true");

		await renderAppWithAuthenticatedClient();

		await waitFor(() => {
			expect(screen.getByTestId("app-layout")).toBeInTheDocument();
		});
		expect(
			screen.queryByRole("heading", { name: /choose your temperature unit/i }),
		).not.toBeInTheDocument();
	});

	it("does not show when a saved preference already exists", async () => {
		localStorage.setItem(TEMPERATURE_UNIT_STORAGE_KEY, "F");

		await renderAppWithAuthenticatedClient();

		await waitFor(() => {
			expect(screen.getByTestId("app-layout")).toBeInTheDocument();
		});
		expect(
			screen.queryByRole("heading", { name: /choose your temperature unit/i }),
		).not.toBeInTheDocument();
	});
});

describe("OnboardingWizard", () => {
	beforeEach(() => {
		localStorage.clear();
		notificationPermission = "default";
		MockNotification.requestPermission.mockResolvedValue("granted");
		vi.stubGlobal("Notification", MockNotification);
	});

	afterEach(() => {
		localStorage.clear();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("renders each step and updates preferences", async () => {
		renderWizard();

		expect(
			screen.getByRole("heading", { name: /choose your temperature unit/i }),
		).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /use celsius/i }));
		await waitFor(() => {
			expect(localStorage.getItem(TEMPERATURE_UNIT_STORAGE_KEY)).toBe("C");
		});

		fireEvent.click(screen.getByRole("button", { name: /next/i }));
		expect(
			await screen.findByRole("heading", { name: /your devices at a glance/i }),
		).toBeInTheDocument();
		expect(await screen.findByText("Backyard Probe")).toBeInTheDocument();
		expect(screen.getByText("First device")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /next/i }));
		expect(
			await screen.findByRole("heading", { name: /set alarms for your cook/i }),
		).toBeInTheDocument();
		expect(screen.getByText(/high alarms/i)).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /next/i }));
		expect(
			await screen.findByRole("heading", { name: /stay ahead with notifications/i }),
		).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /enable notifications/i }));
		await waitFor(() => {
			expect(MockNotification.requestPermission).toHaveBeenCalledOnce();
			expect(localStorage.getItem(NOTIFICATION_PREFERENCE_STORAGE_KEY)).toBe("true");
		});
	});

	it("sets the completion flag when finished", async () => {
		const { onComplete } = renderWizard();

		await goToStep(3);
		fireEvent.click(screen.getByRole("button", { name: /finish/i }));

		expect(localStorage.getItem(ONBOARDING_COMPLETE_STORAGE_KEY)).toBe("true");
		expect(onComplete).toHaveBeenCalledOnce();
	});

	it.each([
		{ step: 0, title: /choose your temperature unit/i },
		{ step: 1, title: /your devices at a glance/i },
		{ step: 2, title: /set alarms for your cook/i },
		{ step: 3, title: /stay ahead with notifications/i },
	])("allows skipping from step $step", async ({ step, title }) => {
		const { onComplete } = renderWizard();

		if (step === 1) await goToStep(1);
		if (step === 2) await goToStep(2);
		if (step === 3) await goToStep(3);

		expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /skip onboarding/i }));

		expect(localStorage.getItem(ONBOARDING_COMPLETE_STORAGE_KEY)).toBe("true");
		expect(onComplete).toHaveBeenCalledOnce();
	});
});
