import { useCallback, useEffect, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ExportFrequency = "daily" | "weekly" | "monthly";

export interface ChannelSelection {
	/** Device serial number. */
	deviceSerial: string;
	/** Channel number identifier. */
	channelNumber: string;
}

export interface ExportSchedule {
	id: string;
	name: string;
	frequency: ExportFrequency;
	channels: ChannelSelection[];
	createdAt: string;
	lastRunAt: string | null;
	enabled: boolean;
}

export interface ExportHistoryEntry {
	id: string;
	scheduleId: string;
	scheduleName: string;
	ranAt: string;
	channelCount: number;
	status: "completed" | "failed";
	error?: string;
}

interface ExportSchedulerState {
	schedules: ExportSchedule[];
	history: ExportHistoryEntry[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "thermoworks-export-schedules";

const FREQUENCY_MS: Record<ExportFrequency, number> = {
	daily: 24 * 60 * 60 * 1000,
	weekly: 7 * 24 * 60 * 60 * 1000,
	monthly: 30 * 24 * 60 * 60 * 1000,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadState(): ExportSchedulerState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { schedules: [], history: [] };
		return JSON.parse(raw) as ExportSchedulerState;
	} catch {
		return { schedules: [], history: [] };
	}
}

function persistState(state: ExportSchedulerState): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Storage unavailable or quota exceeded — silent fail.
	}
}

/** Determine if a schedule is due for execution. */
export function isScheduleDue(schedule: ExportSchedule): boolean {
	if (!schedule.enabled) return false;

	const intervalMs = FREQUENCY_MS[schedule.frequency];
	const lastRun = schedule.lastRunAt ? new Date(schedule.lastRunAt).getTime() : 0;
	const now = Date.now();

	return now - lastRun >= intervalMs;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseExportSchedulerResult {
	schedules: ExportSchedule[];
	history: ExportHistoryEntry[];
	addSchedule: (
		name: string,
		frequency: ExportFrequency,
		channels: ChannelSelection[],
	) => ExportSchedule;
	removeSchedule: (id: string) => void;
	toggleSchedule: (id: string) => void;
	markRun: (scheduleId: string, status: "completed" | "failed", error?: string) => void;
	getDueSchedules: () => ExportSchedule[];
	clearHistory: () => void;
}

export function useExportScheduler(): UseExportSchedulerResult {
	const [state, setState] = useState<ExportSchedulerState>(loadState);

	// Persist on every state change.
	useEffect(() => {
		persistState(state);
	}, [state]);

	const addSchedule = useCallback(
		(name: string, frequency: ExportFrequency, channels: ChannelSelection[]): ExportSchedule => {
			const schedule: ExportSchedule = {
				id: generateId(),
				name,
				frequency,
				channels,
				createdAt: new Date().toISOString(),
				lastRunAt: null,
				enabled: true,
			};
			setState((prev) => ({
				...prev,
				schedules: [...prev.schedules, schedule],
			}));
			return schedule;
		},
		[],
	);

	const removeSchedule = useCallback((id: string) => {
		setState((prev) => ({
			...prev,
			schedules: prev.schedules.filter((s) => s.id !== id),
		}));
	}, []);

	const toggleSchedule = useCallback((id: string) => {
		setState((prev) => ({
			...prev,
			schedules: prev.schedules.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
		}));
	}, []);

	const markRun = useCallback(
		(scheduleId: string, status: "completed" | "failed", error?: string) => {
			const now = new Date().toISOString();
			setState((prev) => {
				const schedule = prev.schedules.find((s) => s.id === scheduleId);
				const entry: ExportHistoryEntry = {
					id: generateId(),
					scheduleId,
					scheduleName: schedule?.name ?? "Unknown",
					ranAt: now,
					channelCount: schedule?.channels.length ?? 0,
					status,
					error,
				};
				return {
					schedules: prev.schedules.map((s) =>
						s.id === scheduleId ? { ...s, lastRunAt: now } : s,
					),
					history: [entry, ...prev.history].slice(0, 100),
				};
			});
		},
		[],
	);

	const getDueSchedules = useCallback((): ExportSchedule[] => {
		return state.schedules.filter(isScheduleDue);
	}, [state.schedules]);

	const clearHistory = useCallback(() => {
		setState((prev) => ({ ...prev, history: [] }));
	}, []);

	return {
		schedules: state.schedules,
		history: state.history,
		addSchedule,
		removeSchedule,
		toggleSchedule,
		markRun,
		getDueSchedules,
		clearHistory,
	};
}
