import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShareButton } from "../src/components/ShareButton.tsx";
import { ShareManager } from "../src/components/ShareManager.tsx";
import type { ThermoworksWebClient } from "../src/lib/api.ts";

function makeMockClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		shareDevice: vi.fn().mockResolvedValue({ shareUrl: "http://localhost/#/share/device/TW-001" }),
		shareArchive: vi.fn().mockResolvedValue({
			shareUrl: "http://localhost/#/share/archive/TW-001/arc-1",
		}),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

describe("ShareManager", () => {
	it("generates and displays a device share link", async () => {
		const client = makeMockClient();
		const onClose = vi.fn();

		render(<ShareManager serial="TW-001" client={client} onClose={onClose} />);

		// Should show loading initially
		expect(screen.getByRole("dialog")).toBeInTheDocument();

		// Wait for the share link to appear
		await waitFor(() => {
			expect(
				screen.getByDisplayValue("http://localhost/#/share/device/TW-001"),
			).toBeInTheDocument();
		});

		expect(client.shareDevice).toHaveBeenCalledWith("TW-001");
		expect(screen.getByAltText("QR code for shared device link")).toHaveAttribute(
			"src",
			expect.stringContaining("data:image/svg+xml"),
		);
	});

	it("generates and displays an archive share link", async () => {
		const client = makeMockClient();
		const onClose = vi.fn();

		render(<ShareManager serial="TW-001" archiveId="arc-1" client={client} onClose={onClose} />);

		await waitFor(() => {
			expect(
				screen.getByDisplayValue("http://localhost/#/share/archive/TW-001/arc-1"),
			).toBeInTheDocument();
		});

		expect(client.shareArchive).toHaveBeenCalledWith("TW-001", "arc-1");
		expect(screen.getByAltText("QR code for shared archive link")).toHaveAttribute(
			"src",
			expect.stringContaining("data:image/svg+xml"),
		);
	});

	it("generates an encoded report share link without calling the archive API", async () => {
		const client = makeMockClient();
		const onClose = vi.fn();

		render(
			<ShareManager
				serial="TW-001"
				archiveId="arc-1"
				client={client}
				reportPayload={{
					archive: {
						id: "arc-1",
						start: "2026-01-01T00:00:00.000Z",
						end: "2026-01-01T01:00:00.000Z",
						count: 1,
						type: "session",
						label: "Brisket",
						deviceLabel: "Smoker",
						notes: null,
						createdOn: null,
						public: null,
						publicLink: null,
						filename: null,
						channels: null,
					},
					annotations: [{ id: "ann-1", timestamp: "2026-01-01T00:30:00.000Z", label: "Wrap" }],
					targetTemp: 225,
					targetTolerance: 5,
				}}
				onClose={onClose}
			/>,
		);

		await waitFor(() => {
			const input = screen.getByDisplayValue(/#\/share\/report\?data=/);
			expect(input).toBeInTheDocument();
		});
		expect(client.shareArchive).not.toHaveBeenCalled();
		expect(screen.getByText(/too long for QR code generation/i)).toBeInTheDocument();
	});

	it("shows error when share fails", async () => {
		const client = makeMockClient({
			shareDevice: vi.fn().mockRejectedValue(new Error("Network error")),
		});
		const onClose = vi.fn();

		render(<ShareManager serial="TW-001" client={client} onClose={onClose} />);

		await waitFor(() => {
			expect(screen.getByText("Network error")).toBeInTheDocument();
		});
	});

	it("copies share link to clipboard", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { clipboard: { writeText } });

		const client = makeMockClient();
		const onClose = vi.fn();

		render(<ShareManager serial="TW-001" client={client} onClose={onClose} />);

		await waitFor(() => {
			expect(
				screen.getByDisplayValue("http://localhost/#/share/device/TW-001"),
			).toBeInTheDocument();
		});

		await act(async () => {
			fireEvent.click(screen.getByLabelText("Copy share link"));
		});

		expect(writeText).toHaveBeenCalledWith("http://localhost/#/share/device/TW-001");

		await waitFor(() => {
			expect(screen.getByLabelText("Copied")).toBeInTheDocument();
		});
	});

	it("closes on Escape key", async () => {
		const client = makeMockClient();
		const onClose = vi.fn();

		render(<ShareManager serial="TW-001" client={client} onClose={onClose} />);

		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).toHaveBeenCalled();
	});

	it("closes on backdrop click", async () => {
		const client = makeMockClient();
		const onClose = vi.fn();

		render(<ShareManager serial="TW-001" client={client} onClose={onClose} />);

		// Click the backdrop (the outer div with role=dialog)
		fireEvent.click(screen.getByRole("dialog"));
		expect(onClose).toHaveBeenCalled();
	});

	it("closes via close button", async () => {
		const client = makeMockClient();
		const onClose = vi.fn();

		render(<ShareManager serial="TW-001" client={client} onClose={onClose} />);

		fireEvent.click(screen.getByLabelText("Close share dialog"));
		expect(onClose).toHaveBeenCalled();
	});
});

describe("ShareButton", () => {
	it("renders a share button with correct aria label", () => {
		const client = makeMockClient();
		render(<ShareButton serial="TW-001" client={client} />);

		expect(screen.getByLabelText("Share device")).toBeInTheDocument();
	});

	it("renders archive label when archiveId is provided", () => {
		const client = makeMockClient();
		render(<ShareButton serial="TW-001" archiveId="arc-1" client={client} />);

		expect(screen.getByLabelText("Share archive")).toBeInTheDocument();
	});

	it("opens ShareManager modal on click", async () => {
		const client = makeMockClient();
		render(<ShareButton serial="TW-001" client={client} />);

		fireEvent.click(screen.getByLabelText("Share device"));

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});
	});
});
