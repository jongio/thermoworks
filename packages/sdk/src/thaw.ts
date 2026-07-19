import { getMeatProfiles, resolveMeatProfile } from "./plan.js";

/** Supported thaw methods. */
export type ThawMethod = "fridge" | "cold-water";

/** Thaw timing reference data for one cut. */
export interface ThawProfile {
	readonly meat: string;
	readonly fridgeHoursPerPound: number;
	readonly coldWaterMinutesPerPound: number;
	readonly minFridgeHours: number;
	readonly minColdWaterMinutes: number;
	readonly note: string;
}

/** Options for {@link planThaw}. */
export interface ThawOptions {
	readonly method?: ThawMethod;
	readonly readyAt?: Date;
	readonly bufferHours?: number;
}

/** A thaw timing plan for one cut and weight. */
export interface ThawPlan {
	readonly meat: string;
	readonly weightLb: number;
	readonly method: ThawMethod;
	readonly thawHours: number;
	readonly bufferHours: number;
	readonly totalHours: number;
	readonly readyAt: Date | null;
	readonly startAt: Date | null;
	readonly note: string;
}

const DEFAULT_METHOD: ThawMethod = "fridge";
const DEFAULT_BUFFER_HOURS = 4;

const THAW_PROFILES: Record<string, Omit<ThawProfile, "meat">> = {
	Brisket: {
		fridgeHoursPerPound: 5,
		coldWaterMinutesPerPound: 30,
		minFridgeHours: 24,
		minColdWaterMinutes: 180,
		note: "Large dense cuts thaw slowly. Keep wrapped and on a rimmed tray.",
	},
	"Pork Butt": {
		fridgeHoursPerPound: 5,
		coldWaterMinutesPerPound: 30,
		minFridgeHours: 24,
		minColdWaterMinutes: 150,
		note: "Plan extra fridge time around the bone and thick center.",
	},
	"Pork Ribs": {
		fridgeHoursPerPound: 4,
		coldWaterMinutesPerPound: 25,
		minFridgeHours: 12,
		minColdWaterMinutes: 90,
		note: "Separate racks thaw faster than a tight cryovac stack.",
	},
	"Baby Back Ribs": {
		fridgeHoursPerPound: 4,
		coldWaterMinutesPerPound: 25,
		minFridgeHours: 12,
		minColdWaterMinutes: 75,
		note: "Lay racks flat so the center thaws evenly.",
	},
	"Whole Chicken": {
		fridgeHoursPerPound: 6,
		coldWaterMinutesPerPound: 30,
		minFridgeHours: 18,
		minColdWaterMinutes: 120,
		note: "Place breast side up in the fridge and drain any purge before seasoning.",
	},
	"Chicken Wings": {
		fridgeHoursPerPound: 4,
		coldWaterMinutesPerPound: 20,
		minFridgeHours: 8,
		minColdWaterMinutes: 45,
		note: "Spread wings in a shallow pan once pliable so clumps finish thawing.",
	},
	Turkey: {
		fridgeHoursPerPound: 6,
		coldWaterMinutesPerPound: 30,
		minFridgeHours: 24,
		minColdWaterMinutes: 240,
		note: "Use fridge thawing when possible. Cold-water thawing needs frequent water changes.",
	},
	"Tri-Tip": {
		fridgeHoursPerPound: 5,
		coldWaterMinutesPerPound: 25,
		minFridgeHours: 12,
		minColdWaterMinutes: 75,
		note: "A small roast can thaw overnight, but keep a buffer for thick ends.",
	},
	Salmon: {
		fridgeHoursPerPound: 4,
		coldWaterMinutesPerPound: 20,
		minFridgeHours: 8,
		minColdWaterMinutes: 30,
		note: "Keep fish cold and cook soon after thawing.",
	},
	"Beef Short Ribs": {
		fridgeHoursPerPound: 5,
		coldWaterMinutesPerPound: 30,
		minFridgeHours: 18,
		minColdWaterMinutes: 120,
		note: "Bone-in plates need extra time at the thickest rib.",
	},
};

function roundUpQuarterHour(hours: number): number {
	return Math.ceil(hours * 4) / 4;
}

function copyProfile(meat: string, profile: Omit<ThawProfile, "meat">): ThawProfile {
	return { meat, ...profile };
}

/** Return thaw timing reference data for every built-in meat profile. */
export function listThawProfiles(): ThawProfile[] {
	return getMeatProfiles().map((profile) => {
		const thaw = THAW_PROFILES[profile.name];
		if (!thaw) throw new Error(`Missing thaw profile for ${profile.name}`);
		return copyProfile(profile.name, thaw);
	});
}

/** Resolve thaw timing reference data by meat name or alias. */
export function resolveThawProfile(meat: string): ThawProfile | null {
	const profile = resolveMeatProfile(meat);
	if (!profile) return null;
	const thaw = THAW_PROFILES[profile.name];
	return thaw ? copyProfile(profile.name, thaw) : null;
}

/** Estimate thaw time and optional calendar start time for a frozen cut. */
export function planThaw(meat: string, weightLb: number, options: ThawOptions = {}): ThawPlan {
	if (!Number.isFinite(weightLb) || weightLb <= 0) {
		throw new Error(`Weight must be a positive number of pounds, got: ${weightLb}`);
	}
	const method = options.method ?? DEFAULT_METHOD;
	if (method !== "fridge" && method !== "cold-water") {
		throw new Error(`Unknown thaw method: ${method}`);
	}
	const bufferHours = options.bufferHours ?? DEFAULT_BUFFER_HOURS;
	if (!Number.isFinite(bufferHours) || bufferHours < 0) {
		throw new Error(`Buffer must be a non-negative number of hours, got: ${bufferHours}`);
	}
	if (options.readyAt && Number.isNaN(options.readyAt.getTime())) {
		throw new Error("Ready time must be a valid date.");
	}

	const profile = resolveThawProfile(meat);
	if (!profile) throw new Error(`Unknown meat: ${meat}`);

	const rawHours =
		method === "fridge"
			? Math.max(profile.minFridgeHours, weightLb * profile.fridgeHoursPerPound)
			: Math.max(profile.minColdWaterMinutes, weightLb * profile.coldWaterMinutesPerPound) / 60;
	const thawHours = roundUpQuarterHour(rawHours);
	const totalHours = roundUpQuarterHour(thawHours + bufferHours);
	const startAt = options.readyAt
		? new Date(options.readyAt.getTime() - totalHours * 60 * 60_000)
		: null;

	return {
		meat: profile.meat,
		weightLb,
		method,
		thawHours,
		bufferHours,
		totalHours,
		readyAt: options.readyAt ?? null,
		startAt,
		note: profile.note,
	};
}
