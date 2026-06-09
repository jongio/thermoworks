import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StreamingIndicator } from "../src/components/StreamingIndicator.tsx";

describe("StreamingIndicator", () => {
	it("renders Live label when streaming", () => {
		render(<StreamingIndicator mode="stream" isStreaming={true} onToggle={vi.fn()} />);

		expect(screen.getByText("Live")).toBeInTheDocument();
	});

	it("renders Polling label when in poll mode", () => {
		render(<StreamingIndicator mode="poll" isStreaming={false} onToggle={vi.fn()} />);

		expect(screen.getByText("Polling (10s)")).toBeInTheDocument();
	});

	it("calls onToggle when clicked", () => {
		const onToggle = vi.fn();
		render(<StreamingIndicator mode="stream" isStreaming={true} onToggle={onToggle} />);

		fireEvent.click(screen.getByRole("button"));

		expect(onToggle).toHaveBeenCalledTimes(1);
	});

	it("shows pulsing dot when streaming", () => {
		const { container } = render(
			<StreamingIndicator mode="stream" isStreaming={true} onToggle={vi.fn()} />,
		);

		const dot = container.querySelector("span[aria-hidden]");
		expect(dot).toHaveClass("animate-pulse", "bg-green-500");
	});

	it("shows steady blue dot when polling", () => {
		const { container } = render(
			<StreamingIndicator mode="poll" isStreaming={false} onToggle={vi.fn()} />,
		);

		const dot = container.querySelector("span[aria-hidden]");
		expect(dot).toHaveClass("bg-blue-500");
		expect(dot).not.toHaveClass("animate-pulse");
	});

	it("has accessible label describing the mode", () => {
		render(<StreamingIndicator mode="stream" isStreaming={true} onToggle={vi.fn()} />);

		const button = screen.getByRole("button");
		expect(button).toHaveAccessibleName(/data refresh mode: live/i);
	});
});
