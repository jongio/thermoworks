import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FirmwareStatus } from "../src/components/FirmwareStatus.tsx";
import { compareVersions } from "../src/hooks/useFirmwareStatus.ts";
import type { ThermoworksWebClient } from "../src/lib/api.ts";

function makeMockClient(
	firmwareResponse: { name: string; version: string; location: string; md5: string } | null = null,
	shouldReject = false,
): ThermoworksWebClient {
	const getFirmwareInfo = shouldReject
		? vi.fn().mockRejectedValue(new Error("Network error"))
		: vi.fn().mockResolvedValue(firmwareResponse);

	return {
		isAuthenticated: true,
		getFirmwareInfo,
	} as unknown as ThermoworksWebClient;
}

describe("compareVersions", () => {
	it("returns 0 for equal versions", () => {
		expect(compareVersions("2.1.0", "2.1.0")).toBe(0);
	});

	it("returns negative when a < b", () => {
		expect(compareVersions("2.1.0", "2.2.0")).toBeLessThan(0);
		expect(compareVersions("1.9.9", "2.0.0")).toBeLessThan(0);
		expect(compareVersions("2.1", "2.1.1")).toBeLessThan(0);
	});

	it("returns positive when a > b", () => {
		expect(compareVersions("2.2.0", "2.1.0")).toBeGreaterThan(0);
		expect(compareVersions("3.0.0", "2.9.9")).toBeGreaterThan(0);
	});

	it("handles versions with different segment counts", () => {
		expect(compareVersions("2.1", "2.1.0")).toBe(0);
		expect(compareVersions("2.1.0.1", "2.1.0")).toBeGreaterThan(0);
	});
});

describe("FirmwareStatus", () => {
	it("shows update available when current version is older", async () => {
		const client = makeMockClient({
			name: "ThermaQ WiFi",
			version: "2.3.0",
			location: "",
			md5: "",
		});

		await act(async () => {
			render(<FirmwareStatus currentVersion="2.1.0" deviceType="ThermaQ WiFi" client={client} />);
		});

		await waitFor(() => {
			expect(screen.getByRole("status")).toHaveAttribute(
				"aria-label",
				"Firmware update available. Current: v2.1.0, latest: v2.3.0",
			);
		});

		expect(screen.getByText("v2.1.0")).toBeInTheDocument();
		expect(screen.getByText("(v2.3.0 available)")).toBeInTheDocument();
	});

	it("shows up to date when current version matches latest", async () => {
		const client = makeMockClient({
			name: "ThermaQ WiFi",
			version: "2.1.0",
			location: "",
			md5: "",
		});

		await act(async () => {
			render(<FirmwareStatus currentVersion="2.1.0" deviceType="ThermaQ WiFi" client={client} />);
		});

		await waitFor(() => {
			expect(screen.getByRole("status")).toHaveAttribute(
				"aria-label",
				"Firmware v2.1.0 is up to date",
			);
		});

		expect(screen.getByText("v2.1.0")).toBeInTheDocument();
	});

	it("shows up to date when current version is newer than latest", async () => {
		const client = makeMockClient({
			name: "ThermaQ WiFi",
			version: "2.0.0",
			location: "",
			md5: "",
		});

		await act(async () => {
			render(<FirmwareStatus currentVersion="2.1.0" deviceType="ThermaQ WiFi" client={client} />);
		});

		await waitFor(() => {
			expect(screen.getByRole("status")).toHaveAttribute(
				"aria-label",
				"Firmware v2.1.0 is up to date",
			);
		});
	});

	it("shows plain version when firmware info is unavailable (null)", async () => {
		const client = makeMockClient(null);

		await act(async () => {
			render(<FirmwareStatus currentVersion="2.1.0" deviceType="ThermaQ WiFi" client={client} />);
		});

		await waitFor(() => {
			expect(screen.getByText("v2.1.0")).toBeInTheDocument();
		});

		// Should not have a role="status" element (graceful degradation)
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("shows plain version when fetch throws an error", async () => {
		const client = makeMockClient(null, true);

		await act(async () => {
			render(<FirmwareStatus currentVersion="2.1.0" deviceType="ThermaQ WiFi" client={client} />);
		});

		await waitFor(() => {
			expect(screen.getByText("v2.1.0")).toBeInTheDocument();
		});

		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("shows plain version when deviceType is null", () => {
		const client = makeMockClient(null);

		render(<FirmwareStatus currentVersion="2.1.0" deviceType={null} client={client} />);

		expect(screen.getByText("v2.1.0")).toBeInTheDocument();
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});
});
