/**
 * Fake but realistic data for demo/screenshot mode.
 * Inspired by real ThermoWorks device types but uses no real user information.
 */
import type { Archive, Device, DeviceChannel, User } from "thermoworks-sdk";
import {
	FIXTURE_ARCHIVES,
	FIXTURE_DEVICES,
	FIXTURE_LATEST_FIRMWARE,
	type FixtureDemoMode,
	getFixtureChannels,
} from "thermoworks-sdk/testing";
import type { ChartPayload, ChartPoint, ChartSeries } from "./chart-protocol";

export const DEMO_ARCHIVES: Record<string, Archive[]> = FIXTURE_ARCHIVES;
export const DEMO_DEVICES: Device[] = FIXTURE_DEVICES;
export const DEMO_LATEST_FIRMWARE: Record<string, string> = FIXTURE_LATEST_FIRMWARE;

export const DEMO_USER: User = {
	userId: "demo-user-001",
	accountId: "demo-account-001",
	email: "pitmaster@example.com",
	displayName: "Demo User",
	timeZone: "America/Denver",
	preferredUnits: "F",
	locale: "en-US",
	photoUrl: null,
	use24Time: false,
	lastLogin: new Date(),
	appVersion: "3.5.0",
	accountRoles: { owner: true },
	roles: { admin: true },
	notificationSettings: {
		enabled: true,
		continuousAlerts: true,
		emailNotification: true,
		smsNotification: false,
		deviceNotification: true,
	},
};

const now = new Date();

type DemoMode = FixtureDemoMode;

export function getDemoChannels(serial: string, mode: DemoMode): DeviceChannel[] {
	return getFixtureChannels(serial, mode);
}

// ─── Demo sessions, archives + chart data ────────────────────────────────────

interface DemoChannelSpec {
	id: string;
	label: string;
	color: string;
	from: number;
	to: number;
	units?: string;
	high?: number;
	low?: number;
	wobble?: number;
}

interface DemoSessionSpec {
	label: string;
	/** How long the cook lasted, in minutes. */
	durationMin: number;
	/** How long ago the cook ended, in minutes (0 = ends "now"). */
	endedMinAgo: number;
	/** Chart reference lines (e.g. pit target or pull temperature). */
	high: number | null;
	low: number | null;
	channels: DemoChannelSpec[];
}

/** Sessions per device; the first entry is the active / most-recent cook. */
const DEMO_SESSIONS: Record<string, DemoSessionSpec[]> = {
	"DEMO-SIGNALS-4CH": [
		{
			label: "Sunday Brisket",
			durationMin: 180,
			endedMinAgo: 0,
			high: 275,
			low: 200,
			channels: [
				{
					id: "pit",
					label: "Pit",
					color: "#FF6B35",
					from: 78,
					to: 232,
					high: 275,
					low: 200,
					wobble: 4,
				},
				{
					id: "brisket",
					label: "Brisket",
					color: "#4ECDC4",
					from: 41,
					to: 168,
					high: 203,
					wobble: 1,
				},
				{ id: "ambient", label: "Ambient", color: "#95E1D3", from: 69, to: 73, wobble: 1 },
			],
		},
		{
			// Reverse-seared steak: hot grate, meat pulled at 125°F (medium-rare).
			label: "Grilled Steak",
			durationMin: 24,
			endedMinAgo: 2 * 24 * 60,
			high: 125,
			low: null,
			channels: [
				{ id: "grill", label: "Grill", color: "#FF6B35", from: 455, to: 515, wobble: 12 },
				{
					id: "steak",
					label: "Steak",
					color: "#E84855",
					from: 52,
					to: 125,
					high: 125,
					wobble: 0.6,
				},
			],
		},
	],
	"DEMO-SMOKE-2CH": [
		{
			label: "Easter Brisket",
			durationMin: 200,
			endedMinAgo: 0,
			high: 285,
			low: 220,
			channels: [
				{
					id: "pit",
					label: "Pit",
					color: "#4ECDC4",
					from: 84,
					to: 250,
					high: 285,
					low: 220,
					wobble: 5,
				},
				{
					id: "brisket",
					label: "Brisket",
					color: "#FFE66D",
					from: 44,
					to: 198,
					high: 203,
					wobble: 1,
				},
			],
		},
	],
	"DEMO-NODE-1CH": [
		{
			label: "Garage Fridge",
			durationMin: 180,
			endedMinAgo: 0,
			high: 45,
			low: 32,
			channels: [
				{
					id: "internal",
					label: "Internal",
					color: "#6C5CE7",
					from: 39,
					to: 37,
					high: 45,
					low: 32,
					wobble: 1,
				},
			],
		},
	],
};

const DEMO_SESSION_POINTS = 70;

/** Stable archive id for a demo session. */
function demoArchiveId(serial: string, index: number): string {
	return `demo-${serial}-${index}`;
}

interface SessionTiming {
	points: number;
	stepMs: number;
	endTime: number;
	startTime: number;
}

function sessionTiming(spec: DemoSessionSpec): SessionTiming {
	const points = DEMO_SESSION_POINTS;
	const endTime = now.getTime() - spec.endedMinAgo * 60_000;
	const durationMs = spec.durationMin * 60_000;
	return { points, stepMs: durationMs / (points - 1), endTime, startTime: endTime - durationMs };
}

/** Generate a smooth temperature curve (ease-out) ending near `spec.to`. */
function genCurve(spec: DemoChannelSpec, timing: SessionTiming): ChartPoint[] {
	const { points, stepMs, endTime } = timing;
	const result: ChartPoint[] = [];
	for (let i = 0; i < points; i++) {
		const progress = i / (points - 1);
		const eased = 1 - (1 - progress) ** 2;
		const base = spec.from + (spec.to - spec.from) * eased;
		const noise = (spec.wobble ?? 0) * Math.sin(i * 1.27);
		const y = Math.round((base + noise) * 10) / 10;
		const t = endTime - (points - 1 - i) * stepMs;
		result.push({ t, y });
	}
	return result;
}

function sessionSeries(spec: DemoSessionSpec): ChartSeries[] {
	const timing = sessionTiming(spec);
	return spec.channels.map((ch) => ({
		id: ch.id,
		label: ch.label,
		color: ch.color,
		units: ch.units ?? "F",
		points: genCurve(ch, timing),
	}));
}

/** True for synthetic demo device serials. */
export function isDemoSerial(serial: string): boolean {
	return serial.startsWith("DEMO-");
}

/** Find a demo session by archive id, or the current session when none is given. */
function findDemoSession(serial: string, archiveId?: string): DemoSessionSpec | null {
	const sessions = DEMO_SESSIONS[serial];
	if (!sessions || sessions.length === 0) return null;
	if (!archiveId) return sessions[0] ?? null;
	const idx = sessions.findIndex((_, i) => demoArchiveId(serial, i) === archiveId);
	return sessions[idx >= 0 ? idx : 0] ?? null;
}

/** Build a chart payload for a demo device's current session, or a specific past session. */
export function getDemoChartPayload(serial: string, archiveId?: string): ChartPayload | null {
	const session = findDemoSession(serial, archiveId);
	if (!session) return null;
	const device = DEMO_DEVICES.find((d) => d.serial === serial);
	return {
		deviceLabel: device?.label ?? serial,
		units: "F",
		source: "history",
		series: sessionSeries(session),
		thresholds: { high: session.high, low: session.low },
	};
}

/** The series id whose tail is animated live in a demo (current-session) chart. */
export function getDemoLiveSeriesId(serial: string): string | null {
	return DEMO_SESSIONS[serial]?.[0]?.channels[0]?.id ?? null;
}
