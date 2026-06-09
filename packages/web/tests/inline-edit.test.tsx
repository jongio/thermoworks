import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InlineEdit } from "../src/components/InlineEdit.tsx";

describe("InlineEdit", () => {
	describe("display mode", () => {
		it("renders the value as text", () => {
			render(<InlineEdit value="Kitchen Probe" onSave={vi.fn()} />);

			expect(screen.getByText("Kitchen Probe")).toBeInTheDocument();
		});

		it("shows a rename button with accessible label", () => {
			render(<InlineEdit value="Kitchen Probe" onSave={vi.fn()} />);

			const button = screen.getByRole("button", { name: /rename kitchen probe/i });
			expect(button).toBeInTheDocument();
		});

		it("enters edit mode on click", () => {
			render(<InlineEdit value="Kitchen Probe" onSave={vi.fn()} />);

			fireEvent.click(screen.getByRole("button", { name: /rename kitchen probe/i }));

			expect(screen.getByRole("textbox", { name: /device name/i })).toBeInTheDocument();
		});
	});

	describe("edit mode", () => {
		it("populates input with current value", () => {
			render(<InlineEdit value="Kitchen Probe" onSave={vi.fn()} />);
			fireEvent.click(screen.getByRole("button", { name: /rename/i }));

			const input = screen.getByRole("textbox", { name: /device name/i });
			expect(input).toHaveValue("Kitchen Probe");
		});

		it("saves on Enter key", async () => {
			const onSave = vi.fn().mockResolvedValue({ success: true });
			render(<InlineEdit value="Kitchen Probe" onSave={onSave} />);
			fireEvent.click(screen.getByRole("button", { name: /rename/i }));

			const input = screen.getByRole("textbox", { name: /device name/i });
			fireEvent.change(input, { target: { value: "Smoker Probe" } });

			await act(async () => {
				fireEvent.keyDown(input, { key: "Enter" });
			});

			expect(onSave).toHaveBeenCalledWith("Smoker Probe");
		});

		it("cancels on Escape key without saving", () => {
			const onSave = vi.fn();
			render(<InlineEdit value="Kitchen Probe" onSave={onSave} />);
			fireEvent.click(screen.getByRole("button", { name: /rename/i }));

			const input = screen.getByRole("textbox", { name: /device name/i });
			fireEvent.change(input, { target: { value: "Something else" } });
			fireEvent.keyDown(input, { key: "Escape" });

			expect(onSave).not.toHaveBeenCalled();
			// Should return to display mode with original value
			expect(screen.getByText("Kitchen Probe")).toBeInTheDocument();
		});

		it("saves on confirm button click", async () => {
			const onSave = vi.fn().mockResolvedValue({ success: true });
			render(<InlineEdit value="Kitchen Probe" onSave={onSave} />);
			fireEvent.click(screen.getByRole("button", { name: /rename/i }));

			const input = screen.getByRole("textbox", { name: /device name/i });
			fireEvent.change(input, { target: { value: "New Name" } });

			await act(async () => {
				fireEvent.click(screen.getByRole("button", { name: /save name/i }));
			});

			expect(onSave).toHaveBeenCalledWith("New Name");
		});

		it("cancels on cancel button click", () => {
			const onSave = vi.fn();
			render(<InlineEdit value="Kitchen Probe" onSave={onSave} />);
			fireEvent.click(screen.getByRole("button", { name: /rename/i }));

			fireEvent.click(screen.getByRole("button", { name: /cancel editing/i }));

			expect(onSave).not.toHaveBeenCalled();
			expect(screen.getByText("Kitchen Probe")).toBeInTheDocument();
		});

		it("does not call onSave when value unchanged", async () => {
			const onSave = vi.fn().mockResolvedValue({ success: true });
			render(<InlineEdit value="Kitchen Probe" onSave={onSave} />);
			fireEvent.click(screen.getByRole("button", { name: /rename/i }));

			const input = screen.getByRole("textbox", { name: /device name/i });

			await act(async () => {
				fireEvent.keyDown(input, { key: "Enter" });
			});

			expect(onSave).not.toHaveBeenCalled();
		});
	});

	describe("validation", () => {
		it("shows error for empty input", async () => {
			const onSave = vi.fn();
			render(<InlineEdit value="Kitchen Probe" onSave={onSave} />);
			fireEvent.click(screen.getByRole("button", { name: /rename/i }));

			const input = screen.getByRole("textbox", { name: /device name/i });
			fireEvent.change(input, { target: { value: "   " } });

			await act(async () => {
				fireEvent.keyDown(input, { key: "Enter" });
			});

			expect(screen.getByRole("alert")).toHaveTextContent(/cannot be empty/i);
			expect(onSave).not.toHaveBeenCalled();
		});

		it("shows error when exceeding max length", async () => {
			const onSave = vi.fn();
			render(<InlineEdit value="Probe" onSave={onSave} maxLength={10} />);
			fireEvent.click(screen.getByRole("button", { name: /rename/i }));

			const input = screen.getByRole("textbox", { name: /device name/i });
			fireEvent.change(input, { target: { value: "A very long name that exceeds" } });

			await act(async () => {
				fireEvent.keyDown(input, { key: "Enter" });
			});

			expect(screen.getByRole("alert")).toHaveTextContent(/10 characters or fewer/i);
			expect(onSave).not.toHaveBeenCalled();
		});

		it("trims whitespace before saving", async () => {
			const onSave = vi.fn().mockResolvedValue({ success: true });
			render(<InlineEdit value="Probe" onSave={onSave} />);
			fireEvent.click(screen.getByRole("button", { name: /rename/i }));

			const input = screen.getByRole("textbox", { name: /device name/i });
			fireEvent.change(input, { target: { value: "  New Name  " } });

			await act(async () => {
				fireEvent.keyDown(input, { key: "Enter" });
			});

			expect(onSave).toHaveBeenCalledWith("New Name");
		});
	});

	describe("error handling", () => {
		it("shows error message when onSave returns failure", async () => {
			const onSave = vi.fn().mockResolvedValue({ success: false });
			render(<InlineEdit value="Kitchen Probe" onSave={onSave} />);
			fireEvent.click(screen.getByRole("button", { name: /rename/i }));

			const input = screen.getByRole("textbox", { name: /device name/i });
			fireEvent.change(input, { target: { value: "New Name" } });

			await act(async () => {
				fireEvent.keyDown(input, { key: "Enter" });
			});

			expect(screen.getByRole("alert")).toHaveTextContent(/failed to save/i);
			// Should remain in edit mode
			expect(screen.getByRole("textbox", { name: /device name/i })).toBeInTheDocument();
		});

		it("shows error message when onSave throws", async () => {
			const onSave = vi.fn().mockRejectedValue(new Error("Network error"));
			render(<InlineEdit value="Kitchen Probe" onSave={onSave} />);
			fireEvent.click(screen.getByRole("button", { name: /rename/i }));

			const input = screen.getByRole("textbox", { name: /device name/i });
			fireEvent.change(input, { target: { value: "New Name" } });

			await act(async () => {
				fireEvent.keyDown(input, { key: "Enter" });
			});

			expect(screen.getByRole("alert")).toHaveTextContent(/failed to save/i);
		});

		it("disables inputs during save", async () => {
			let resolvePromise: (v: { success: boolean }) => void;
			const onSave = vi.fn().mockImplementation(
				() => new Promise((resolve) => { resolvePromise = resolve; }),
			);
			render(<InlineEdit value="Kitchen Probe" onSave={onSave} />);
			fireEvent.click(screen.getByRole("button", { name: /rename/i }));

			const input = screen.getByRole("textbox", { name: /device name/i });
			fireEvent.change(input, { target: { value: "New Name" } });

			// Start save (don't await yet)
			act(() => {
				fireEvent.keyDown(input, { key: "Enter" });
			});

			await waitFor(() => {
				expect(input).toBeDisabled();
			});

			// Resolve the promise
			await act(async () => {
				resolvePromise!({ success: true });
			});
		});
	});
});
