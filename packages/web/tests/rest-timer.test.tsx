import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RestTimerControls } from "../src/components/RestTimerControls.tsx";
import { SessionControls } from "../src/components/SessionControls.tsx";
import {
	cancelRestTimer,
	formatRestRemaining,
	getRestTimerEnd,
	isRestTimerActive,
	REST_TIMER_STORAGE_KEY,
	startRestTimer,
	useRestTimer,
} from "../src/hooks/useRestTimer.ts";
import type { ThermoworksWebClient } from "../src/lib/api.ts";

// ─── localStorage mock ───────────────────────────────────────────────────────

let localStorageStore: Record<string, string>;

// ─── Notification API mock ───────────────────────────────────────────────────

let notificationInstances: Array<{
	title: string;
	options: NotificationOptions;
	onclick: (() => void) | null;
	close: () => void;
}>;
let mockPermission: NotificationPermission;

class MockNotification {
	static get permission() {
		return mockPermission;
	}
	static requestPermission = vi.fn().mockResolvedValue("granted");

	title: string;
	options: NotificationOptions;
	onclick: (() => void) | null = null;
	close = vi.fn();

	constructor(title: string, options: NotificationOptions = {}) {
		this.title = title;
		this.options = options;
		notificationInstances.push(this);
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		startSession: vi.fn().mockResolvedValue({ success: true }),
		endSession: vi.fn().mockResolvedValue({ success: true }),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
	vi.useFakeTimers();

	localStorageStore = {};
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => localStorageStore[key] ?? null,
		setItem: (key: string, value: string) => {
			localStorageStore[key] = value;
		},
		removeItem: (key: string) => {
			delete localStorageStore[key];
		},
	});

	notificationInstances = [];
	mockPermission = "granted";
	vi.stubGlobal("Notification", MockNotification);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

// ─── formatRestRemaining ─────────────────────────────────────────────────────

describe("formatRestRemaining", () => {
	it('returns "0:00" for zero', () => {
		expect(formatRestRemaining(0)).toBe("0:00");
	});

	it('returns "0:00" for negative values', () => {
		expect(formatRestRemaining(-5000)).toBe("0:00");
	});

	it("formats seconds under a minute", () => {
		expect(formatRestRemaining(5000)).toBe("0:05");
	});

	it("formats full minutes", () => {
		expect(formatRestRemaining(600_000)).toBe("10:00");
	});

	it("formats minutes and seconds", () => {
		expect(formatRestRemaining(65_000)).toBe("1:05");
	});

	it("formats one hour as H:MM:SS", () => {
		expect(formatRestRemaining(3_600_000)).toBe("1:00:00");
	});

	it("formats hours with minutes and seconds", () => {
		expect(formatRestRemaining(3_661_000)).toBe("1:01:01");
	});
});

// ─── startRestTimer / cancelRestTimer / getRestTimerEnd / isRestTimerActive ──

describe("rest timer persistence", () => {
	it("persists an end time to localStorage", () => {
		startRestTimer("TW-001", 10);
		const raw = localStorageStore[REST_TIMER_STORAGE_KEY];
		expect(raw).toBeDefined();
		const parsed = JSON.parse(raw);
		expect(typeof parsed["TW-001"]).toBe("number");
		expect(parsed["TW-001"]).toBeGreaterThan(Date.now());
	});

	it("getRestTimerEnd returns the stored end time", () => {
		startRestTimer("TW-001", 20);
		const end = getRestTimerEnd("TW-001");
		expect(end).not.toBeNull();
		// Should be approximately 20 minutes from now
		const expected = Date.now() + 20 * 60 * 1000;
		expect(Math.abs((end as number) - expected)).toBeLessThan(100);
	});

	it("getRestTimerEnd returns null for unknown serial", () => {
		expect(getRestTimerEnd("UNKNOWN")).toBeNull();
	});

	it("cancelRestTimer removes the entry", () => {
		startRestTimer("TW-001", 10);
		expect(getRestTimerEnd("TW-001")).not.toBeNull();
		cancelRestTimer("TW-001");
		expect(getRestTimerEnd("TW-001")).toBeNull();
	});

	it("isRestTimerActive returns true when timer is running", () => {
		startRestTimer("TW-001", 10);
		expect(isRestTimerActive("TW-001")).toBe(true);
	});

	it("isRestTimerActive returns false when timer has expired", () => {
		startRestTimer("TW-001", 10);
		const future = Date.now() + 11 * 60 * 1000;
		expect(isRestTimerActive("TW-001", future)).toBe(false);
	});

	it("isRestTimerActive returns false for unknown serial", () => {
		expect(isRestTimerActive("UNKNOWN")).toBe(false);
	});

	it("survives page refresh by reading back from localStorage", () => {
		startRestTimer("TW-001", 30);
		// Simulate reading from a fresh load
		const end = getRestTimerEnd("TW-001");
		expect(end).not.toBeNull();
		expect(isRestTimerActive("TW-001")).toBe(true);
	});

	it("handles corrupted localStorage gracefully", () => {
		localStorageStore[REST_TIMER_STORAGE_KEY] = "not-valid-json";
		expect(getRestTimerEnd("TW-001")).toBeNull();
		expect(isRestTimerActive("TW-001")).toBe(false);
	});

	it("handles non-object localStorage value gracefully", () => {
		localStorageStore[REST_TIMER_STORAGE_KEY] = JSON.stringify([1, 2, 3]);
		expect(getRestTimerEnd("TW-001")).toBeNull();
	});

	it("supports multiple devices independently", () => {
		startRestTimer("TW-001", 10);
		startRestTimer("TW-002", 20);
		expect(isRestTimerActive("TW-001")).toBe(true);
		expect(isRestTimerActive("TW-002")).toBe(true);

		cancelRestTimer("TW-001");
		expect(isRestTimerActive("TW-001")).toBe(false);
		expect(isRestTimerActive("TW-002")).toBe(true);
	});
});

// ─── useRestTimer hook ───────────────────────────────────────────────────────

describe("useRestTimer hook", () => {
	it("starts with no active timer", () => {
		const { result } = renderHook(() => useRestTimer("TW-001"));
		expect(result.current.isResting).toBe(false);
		expect(result.current.remainingMs).toBe(0);
		expect(result.current.remainingFormatted).toBe("0:00");
	});

	it("restores an active timer from localStorage on mount", () => {
		// Pre-populate localStorage with an active timer (10 minutes from now)
		const endTime = Date.now() + 10 * 60 * 1000;
		localStorageStore[REST_TIMER_STORAGE_KEY] = JSON.stringify({ "TW-001": endTime });

		const { result } = renderHook(() => useRestTimer("TW-001"));
		expect(result.current.isResting).toBe(true);
		expect(result.current.remainingMs).toBeGreaterThan(0);
	});

	it("counts down every second", () => {
		const { result } = renderHook(() => useRestTimer("TW-001"));

		act(() => {
			result.current.start(1); // 1 minute
		});

		expect(result.current.isResting).toBe(true);
		const initialRemaining = result.current.remainingMs;

		act(() => {
			vi.advanceTimersByTime(3000);
		});

		expect(result.current.remainingMs).toBeLessThan(initialRemaining);
		// Should have decreased by roughly 3 seconds
		expect(initialRemaining - result.current.remainingMs).toBeGreaterThanOrEqual(2000);
	});

	it("fires notification when timer completes", () => {
		const { result } = renderHook(() => useRestTimer("TW-001"));

		act(() => {
			result.current.start(1); // 1 minute
		});

		expect(notificationInstances).toHaveLength(0);

		act(() => {
			vi.advanceTimersByTime(61_000); // Advance past the 1-minute mark
		});

		expect(result.current.isResting).toBe(false);
		expect(notificationInstances).toHaveLength(1);
		expect(notificationInstances[0].title).toBe("Rest Timer Complete");
		expect(notificationInstances[0].options.body).toContain("TW-001");
		expect(notificationInstances[0].options.tag).toBe("rest-complete:TW-001");
	});

	it("does not fire notification when notifications are disabled", () => {
		localStorageStore["thermoworks-notifications-enabled"] = "false";

		const { result } = renderHook(() => useRestTimer("TW-001"));

		act(() => {
			result.current.start(1);
		});

		act(() => {
			vi.advanceTimersByTime(61_000);
		});

		expect(notificationInstances).toHaveLength(0);
	});

	it("does not fire notification when permission is denied", () => {
		mockPermission = "denied";

		const { result } = renderHook(() => useRestTimer("TW-001"));

		act(() => {
			result.current.start(1);
		});

		act(() => {
			vi.advanceTimersByTime(61_000);
		});

		expect(notificationInstances).toHaveLength(0);
	});

	it("cancel stops the timer and clears storage", () => {
		const { result } = renderHook(() => useRestTimer("TW-001"));

		act(() => {
			result.current.start(10);
		});

		expect(result.current.isResting).toBe(true);

		act(() => {
			result.current.cancel();
		});

		expect(result.current.isResting).toBe(false);
		expect(result.current.remainingMs).toBe(0);
		expect(getRestTimerEnd("TW-001")).toBeNull();
	});

	it("cleans up interval on unmount", () => {
		const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

		const { result, unmount } = renderHook(() => useRestTimer("TW-001"));

		act(() => {
			result.current.start(10);
		});

		unmount();

		// clearInterval should have been called during cleanup
		expect(clearIntervalSpy).toHaveBeenCalled();
	});

	it("does not notify on expired timer found at mount", () => {
		// Timer that already expired before mount
		const endTime = Date.now() - 1000;
		localStorageStore[REST_TIMER_STORAGE_KEY] = JSON.stringify({ "TW-001": endTime });

		renderHook(() => useRestTimer("TW-001"));

		expect(notificationInstances).toHaveLength(0);
	});
});

// ─── RestTimerControls component ─────────────────────────────────────────────

describe("RestTimerControls", () => {
	it("shows preset buttons when no timer is active", () => {
		const { result } = renderHook(() => useRestTimer("TW-001"));
		render(<RestTimerControls timer={result.current} />);

		expect(screen.getByLabelText(/start 10 minute rest timer/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/start 20 minute rest timer/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/start 30 minute rest timer/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/start 60 minute rest timer/i)).toBeInTheDocument();
	});

	it("shows custom minute input", () => {
		const { result } = renderHook(() => useRestTimer("TW-001"));
		render(<RestTimerControls timer={result.current} />);

		expect(screen.getByLabelText(/custom rest timer minutes/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/start custom rest timer/i)).toBeInTheDocument();
	});

	it("shows countdown when timer is active", () => {
		const endTime = Date.now() + 10 * 60 * 1000;
		localStorageStore[REST_TIMER_STORAGE_KEY] = JSON.stringify({ "TW-001": endTime });

		const { result } = renderHook(() => useRestTimer("TW-001"));
		render(<RestTimerControls timer={result.current} />);

		expect(screen.getByRole("timer", { name: /rest time remaining/i })).toBeInTheDocument();
		expect(screen.getByText(/resting/i)).toBeInTheDocument();
	});

	it("shows cancel button when timer is active", () => {
		const endTime = Date.now() + 10 * 60 * 1000;
		localStorageStore[REST_TIMER_STORAGE_KEY] = JSON.stringify({ "TW-001": endTime });

		const { result } = renderHook(() => useRestTimer("TW-001"));
		render(<RestTimerControls timer={result.current} />);

		expect(screen.getByLabelText(/cancel rest timer/i)).toBeInTheDocument();
	});

	it("disables custom start button when input is empty", () => {
		const { result } = renderHook(() => useRestTimer("TW-001"));
		render(<RestTimerControls timer={result.current} />);

		const startBtn = screen.getByLabelText(/start custom rest timer/i);
		expect(startBtn).toBeDisabled();
	});
});

// ─── SessionControls integration ─────────────────────────────────────────────

describe("SessionControls rest timer integration", () => {
	it("shows rest timer controls when session is inactive", () => {
		const client = makeMockClient();
		render(
			<SessionControls client={client} serial="TW-001" sessionStart={null} sessionLabel={null} />,
		);

		expect(screen.getByText(/rest timer/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/start 10 minute rest timer/i)).toBeInTheDocument();
	});

	it("shows rest timer controls when session is active", () => {
		const client = makeMockClient();
		render(
			<SessionControls
				client={client}
				serial="TW-001"
				sessionStart={new Date()}
				sessionLabel={null}
			/>,
		);

		expect(screen.getByText(/rest timer/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/start 10 minute rest timer/i)).toBeInTheDocument();
	});

	it("shows rest timer countdown on device card when active", () => {
		const endTime = Date.now() + 10 * 60 * 1000;
		localStorageStore[REST_TIMER_STORAGE_KEY] = JSON.stringify({ "TW-001": endTime });

		const client = makeMockClient();
		render(
			<SessionControls client={client} serial="TW-001" sessionStart={null} sessionLabel={null} />,
		);

		expect(screen.getByRole("timer", { name: /rest time remaining/i })).toBeInTheDocument();
	});
});
