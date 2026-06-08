import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	ChartSkeleton,
	DeviceCardSkeleton,
	DeviceListSkeleton,
	EventListSkeleton,
	Skeleton,
} from "../src/components/Skeleton.tsx";

describe("Skeleton", () => {
	it("renders with base classes", () => {
		const { container } = render(<Skeleton />);
		const el = container.firstElementChild as HTMLElement;
		expect(el.tagName).toBe("DIV");
		expect(el.className).toContain("animate-pulse");
		expect(el.className).toContain("rounded-md");
		expect(el.className).toContain("bg-muted");
	});

	it("merges custom className", () => {
		const { container } = render(<Skeleton className="h-5 w-32" />);
		const el = container.firstElementChild as HTMLElement;
		expect(el.className).toContain("h-5");
		expect(el.className).toContain("w-32");
		expect(el.className).toContain("animate-pulse");
	});

	it("sets aria-hidden for accessibility", () => {
		const { container } = render(<Skeleton />);
		const el = container.firstElementChild as HTMLElement;
		expect(el).toHaveAttribute("aria-hidden", "true");
	});
});

describe("DeviceCardSkeleton", () => {
	it("renders as an article element", () => {
		render(<DeviceCardSkeleton />);
		const article = screen.getByRole("article", { hidden: true });
		expect(article).toBeInTheDocument();
	});

	it("contains multiple skeleton placeholders", () => {
		const { container } = render(<DeviceCardSkeleton />);
		const skeletons = container.querySelectorAll("[aria-hidden='true']");
		// Header (2) + status (1) + badges (3) + channels (2) + button (1) = 9
		expect(skeletons.length).toBe(9);
	});
});

describe("DeviceListSkeleton", () => {
	it("renders default count of 4 cards", () => {
		const { container } = render(<DeviceListSkeleton />);
		const articles = container.querySelectorAll("article");
		expect(articles.length).toBe(4);
	});

	it("renders custom count", () => {
		const { container } = render(<DeviceListSkeleton count={2} />);
		const articles = container.querySelectorAll("article");
		expect(articles.length).toBe(2);
	});

	it("uses grid layout classes", () => {
		const { container } = render(<DeviceListSkeleton />);
		const grid = container.firstElementChild as HTMLElement;
		expect(grid.className).toContain("grid");
		expect(grid.className).toContain("gap-4");
	});
});

describe("ChartSkeleton", () => {
	it("renders chart area and legend placeholders", () => {
		const { container } = render(<ChartSkeleton />);
		const skeletons = container.querySelectorAll("[aria-hidden='true']");
		// 1 chart area + 3 legend items = 4
		expect(skeletons.length).toBe(4);
	});

	it("chart area has correct height", () => {
		const { container } = render(<ChartSkeleton />);
		const chartArea = container.querySelector("[aria-hidden='true']") as HTMLElement;
		expect(chartArea.className).toContain("h-48");
		expect(chartArea.className).toContain("w-full");
	});
});

describe("EventListSkeleton", () => {
	it("renders default count of 5 items", () => {
		const { container } = render(<EventListSkeleton />);
		const items = container.querySelectorAll("[aria-hidden='true']");
		// Each item has: avatar (1) + title (1) + subtitle (1) + timestamp (1) = 4 per item
		// 5 items * 4 = 20
		expect(items.length).toBe(20);
	});

	it("renders custom count", () => {
		const { container } = render(<EventListSkeleton count={3} />);
		const items = container.querySelectorAll("[aria-hidden='true']");
		expect(items.length).toBe(12);
	});

	it("all skeleton elements are aria-hidden", () => {
		const { container } = render(<EventListSkeleton count={1} />);
		const skeletons = container.querySelectorAll("[aria-hidden='true']");
		for (const skeleton of skeletons) {
			expect(skeleton).toHaveAttribute("aria-hidden", "true");
		}
	});
});
