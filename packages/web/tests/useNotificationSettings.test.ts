import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NotificationSettings } from "thermoworks-sdk";
import type { ThermoworksWebClient } from "../src/lib/api.ts";
import { useNotificationSettings } from "../src/hooks/useNotificationSettings.ts";

function createMockClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		getNotificationSettings: vi.fn().mockResolvedValue({
			enabled: true,
			continuousAlerts: false,
			emailNotification: true,
			smsNotification: false,
			deviceNotification: false,
		}),
		updateNotificationSettings: vi.fn().mockResolvedValue({ success: true }),
		login: vi.fn(),
		logout: vi.fn(),
		getUser: vi.fn(),
		getDevices: vi.fn(),
		getDeviceChannel: vi.fn(),
		getAllDeviceChannels: vi.fn(),
		getDevicesWithChannels: vi.fn(),
		getArchives: vi.fn(),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

describe("useNotificationSettings - branch coverage", () => {
	it("returns defaults when client is null", () => {
		const { result } = renderHook(() => useNotificationSettings(null));

		expect(result.current.settings).toEqual({
			enabled: false,
			continuousAlerts: false,
			emailNotification: false,
			smsNotification: false,
			deviceNotification: false,
		});
		expect(result.current.isLoading).toBe(false);
		expect(result.current.error).toBeNull();
	});

	it("returns defaults when client is not authenticated", () => {
		const client = createMockClient({
			isAuthenticated: false,
		} as unknown as Partial<ThermoworksWebClient>);

		const { result } = renderHook(() => useNotificationSettings(client));

		expect(result.current.settings).toEqual({
			enabled: false,
			continuousAlerts: false,
			emailNotification: false,
			smsNotification: false,
			deviceNotification: false,
		});
	});

	it("fetches settings when client is authenticated", async () => {
		const client = createMockClient();

		const { result } = renderHook(() => useNotificationSettings(client));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.settings.enabled).toBe(true);
		expect(result.current.settings.emailNotification).toBe(true);
		expect(result.current.error).toBeNull();
	});

	it("sets error when initial fetch fails with Error", async () => {
		const client = createMockClient({
			getNotificationSettings: vi.fn().mockRejectedValue(new Error("Auth expired")),
		});

		const { result } = renderHook(() => useNotificationSettings(client));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.error).toBe("Auth expired");
		expect(result.current.settings).toEqual({
			enabled: false,
			continuousAlerts: false,
			emailNotification: false,
			smsNotification: false,
			deviceNotification: false,
		});
	});

	it("sets generic error when initial fetch fails with non-Error", async () => {
		const client = createMockClient({
			getNotificationSettings: vi.fn().mockRejectedValue("string error"),
		});

		const { result } = renderHook(() => useNotificationSettings(client));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.error).toBe("Failed to load settings");
	});

	it("does not toggle when client is not authenticated", async () => {
		const updateNotificationSettings = vi.fn().mockResolvedValue({ success: true });
		const client = createMockClient({
			isAuthenticated: false,
			updateNotificationSettings,
		} as unknown as Partial<ThermoworksWebClient>);

		const { result } = renderHook(() => useNotificationSettings(client));

		await act(async () => {
			await result.current.toggle("enabled");
		});

		expect(updateNotificationSettings).not.toHaveBeenCalled();
	});

	it("does not toggle when settings are null (not yet loaded)", async () => {
		// Client returns a promise that never resolves (settings stay null)
		const updateNotificationSettings = vi.fn().mockResolvedValue({ success: true });
		const client = createMockClient({
			getNotificationSettings: vi.fn().mockReturnValue(new Promise(() => {})),
			updateNotificationSettings,
		});

		const { result } = renderHook(() => useNotificationSettings(client));

		// Try toggling before settings load
		await act(async () => {
			await result.current.toggle("enabled");
		});

		expect(updateNotificationSettings).not.toHaveBeenCalled();
	});

	it("optimistically updates setting and confirms on success", async () => {
		const client = createMockClient();

		const { result } = renderHook(() => useNotificationSettings(client));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.settings.continuousAlerts).toBe(false);

		await act(async () => {
			await result.current.toggle("continuousAlerts");
		});

		expect(result.current.settings.continuousAlerts).toBe(true);
		expect(result.current.savingField).toBeNull();
		expect(result.current.saveError).toBeNull();
	});

	it("reverts setting on toggle failure and sets saveError", async () => {
		const client = createMockClient({
			updateNotificationSettings: vi.fn().mockRejectedValue(new Error("Server error")),
		});

		const { result } = renderHook(() => useNotificationSettings(client));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.settings.enabled).toBe(true);

		await act(async () => {
			await result.current.toggle("enabled");
		});

		// Should revert to previous value
		expect(result.current.settings.enabled).toBe(true);
		expect(result.current.saveError).toBe("Server error");
		expect(result.current.savingField).toBeNull();
	});

	it("reverts setting when server returns success=false", async () => {
		const client = createMockClient({
			updateNotificationSettings: vi.fn().mockResolvedValue({ success: false }),
		});

		const { result } = renderHook(() => useNotificationSettings(client));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.settings.smsNotification).toBe(false);

		await act(async () => {
			await result.current.toggle("smsNotification");
		});

		// Should revert because success=false
		expect(result.current.settings.smsNotification).toBe(false);
		expect(result.current.saveError).toBe("Server rejected the update");
	});

	it("sets savingField during toggle operation", async () => {
		let resolveUpdate: () => void;
		const updatePromise = new Promise<{ success: boolean }>((resolve) => {
			resolveUpdate = () => resolve({ success: true });
		});

		const client = createMockClient({
			updateNotificationSettings: vi.fn().mockReturnValue(updatePromise),
		});

		const { result } = renderHook(() => useNotificationSettings(client));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		// Start toggle
		let togglePromise: Promise<void>;
		act(() => {
			togglePromise = result.current.toggle("emailNotification");
		});

		// Should be saving
		expect(result.current.savingField).toBe("emailNotification");

		// Complete the save
		await act(async () => {
			resolveUpdate!();
			await togglePromise!;
		});

		expect(result.current.savingField).toBeNull();
	});

	it("sets generic saveError for non-Error thrown values", async () => {
		const client = createMockClient({
			updateNotificationSettings: vi.fn().mockRejectedValue(42),
		});

		const { result } = renderHook(() => useNotificationSettings(client));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		await act(async () => {
			await result.current.toggle("enabled");
		});

		expect(result.current.saveError).toBe("Failed to save");
	});

	it("cancels in-flight fetch when client becomes null", async () => {
		const client = createMockClient();

		const { result, rerender } = renderHook(
			({ c }) => useNotificationSettings(c),
			{ initialProps: { c: client as ThermoworksWebClient | null } },
		);

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.settings.enabled).toBe(true);

		// Client goes away
		rerender({ c: null });

		// Settings should reset to defaults
		expect(result.current.settings).toEqual({
			enabled: false,
			continuousAlerts: false,
			emailNotification: false,
			smsNotification: false,
			deviceNotification: false,
		});
	});
});
