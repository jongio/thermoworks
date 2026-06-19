import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfflineBanner } from "../src/components/OfflineBanner.tsx";
import {
	OfflineCacheProvider,
	useOfflineCacheContext,
} from "../src/context/OfflineCacheContext.tsx";

// Mock useOnlineStatus
vi.mock("../src/hooks/useOnlineStatus.ts", () => ({
	useOnlineStatus: vi.fn(() => true),
}));

// Import the mock so we can change its return value
import { useOnlineStatus } from "../src/hooks/useOnlineStatus.ts";

const mockedUseOnlineStatus = vi.mocked(useOnlineStatus);

function renderBanner() {
	return render(
		<OfflineCacheProvider>
			<OfflineBanner />
		</OfflineCacheProvider>,
	);
}

/** Helper component that sets cache state via context using useEffect. */
function CacheStateSetter({
	cachedAt,
	isFromCache,
}: {
	cachedAt: Date | null;
	isFromCache: boolean;
}) {
	const { setCacheState } = useOfflineCacheContext();
	React.useEffect(() => {
		setCacheState(cachedAt, isFromCache);
	}, [cachedAt, isFromCache, setCacheState]);
	return null;
}

describe("OfflineBanner", () => {
	beforeEach(() => {
		mockedUseOnlineStatus.mockReturnValue(true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders nothing when online", () => {
		const { container } = renderBanner();
		expect(container.firstChild).toBeNull();
	});

	it("shows generic offline message when no cache data", () => {
		mockedUseOnlineStatus.mockReturnValue(false);
		renderBanner();

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByText(/You're offline/)).toBeInTheDocument();
		expect(screen.getByText(/Data may be outdated/)).toBeInTheDocument();
	});

	it("shows 'Last updated X ago' when serving cached data", async () => {
		mockedUseOnlineStatus.mockReturnValue(false);

		render(
			<OfflineCacheProvider>
				<CacheStateSetter cachedAt={new Date(Date.now() - 5 * 60 * 1000)} isFromCache={true} />
				<OfflineBanner />
			</OfflineCacheProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText(/Last updated 5 minutes ago/)).toBeInTheDocument();
		});
	});

	it("shows hours when cache is older", async () => {
		mockedUseOnlineStatus.mockReturnValue(false);

		render(
			<OfflineCacheProvider>
				<CacheStateSetter cachedAt={new Date(Date.now() - 3 * 60 * 60 * 1000)} isFromCache={true} />
				<OfflineBanner />
			</OfflineCacheProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText(/Last updated 3 hours ago/)).toBeInTheDocument();
		});
	});

	it("shows generic message when online even with cached state", () => {
		mockedUseOnlineStatus.mockReturnValue(true);

		const { container } = render(
			<OfflineCacheProvider>
				<CacheStateSetter cachedAt={new Date(Date.now() - 5 * 60 * 1000)} isFromCache={true} />
				<OfflineBanner />
			</OfflineCacheProvider>,
		);

		// Banner should not render when online
		expect(container.querySelector("[role='alert']")).toBeNull();
	});
});
