/**
 * Cook planner: back-calculate when to start each item of a cook so that they
 * all finish at a shared serve time. Pure functions with no network access, so
 * they can be reused by the CLI, MCP, and web surfaces and unit tested directly.
 */

/** A built-in cooking-time profile for a common cut. */
export interface MeatProfile {
	/** Canonical display name. */
	readonly name: string;
	/** Cook time per pound in hours, or null for cuts planned by fixed time. */
	readonly hoursPerPound: number | null;
	/** Fixed cook time in hours when weight is not the driver, or null. */
	readonly fixedHours: number | null;
	/** Recommended rest time in minutes after the cook. */
	readonly restMinutes: number;
	/** Reference smoker/pit temperature in Fahrenheit. */
	readonly pitTempF: number;
	/**
	 * Recommended internal temperature in Fahrenheit to pull the cut at, or
	 * null for cuts judged by feel (for example ribs by the bend test).
	 */
	readonly targetTempF: number | null;
	/** Short note describing how to tell the cut is done. */
	readonly doneness: string;
}

/** Input describing one item to plan. */
export interface CookPlanItemInput {
	/** Meat profile key or alias (e.g. "brisket", "pork butt"). */
	readonly meat?: string;
	/** Explicit cook time in hours, overriding any profile estimate. */
	readonly hours?: number;
	/** Weight in pounds, used with per-pound profiles. */
	readonly weightLb?: number;
	/** Rest time in minutes, overriding the profile default. */
	readonly restMinutes?: number;
	/** Display label; defaults to the meat name or "item". */
	readonly label?: string;
}

/** A fully resolved item in a cook plan. */
export interface CookPlanItem {
	readonly label: string;
	readonly meat: string | null;
	readonly cookMinutes: number;
	readonly restMinutes: number;
	/** When to put the item on. */
	readonly startAt: Date;
	/** When to pull the item off (ready minus rest). */
	readonly removeAt: Date;
	/** Shared serve time. */
	readonly readyAt: Date;
}

/** A complete cook plan. */
export interface CookPlan {
	readonly readyAt: Date;
	/** Items sorted by earliest start time first. */
	readonly items: CookPlanItem[];
}

/** Options for {@link planCook}. */
export interface PlanCookOptions {
	/** The shared time everything should be ready to serve. */
	readonly readyAt: Date;
}

const PROFILES: MeatProfile[] = [
	{
		name: "Brisket",
		hoursPerPound: 1.25,
		fixedHours: null,
		restMinutes: 60,
		pitTempF: 250,
		targetTempF: 203,
		doneness: "Probe-tender, around 203\u00B0F in the flat",
	},
	{
		name: "Pork Butt",
		hoursPerPound: 1.5,
		fixedHours: null,
		restMinutes: 45,
		pitTempF: 250,
		targetTempF: 203,
		doneness: "Pull-apart tender, 200-205\u00B0F",
	},
	{
		name: "Pork Ribs",
		hoursPerPound: null,
		fixedHours: 5.5,
		restMinutes: 15,
		pitTempF: 250,
		targetTempF: null,
		doneness: "Bend test; bones start to pull, around 200-203\u00B0F",
	},
	{
		name: "Baby Back Ribs",
		hoursPerPound: null,
		fixedHours: 5,
		restMinutes: 15,
		pitTempF: 250,
		targetTempF: null,
		doneness: "Bend test; tender at around 200-203\u00B0F",
	},
	{
		name: "Whole Chicken",
		hoursPerPound: null,
		fixedHours: 3.5,
		restMinutes: 15,
		pitTempF: 275,
		targetTempF: 165,
		doneness: "165\u00B0F in the breast, 175\u00B0F in the thigh",
	},
	{
		name: "Chicken Wings",
		hoursPerPound: null,
		fixedHours: 1.5,
		restMinutes: 5,
		pitTempF: 375,
		targetTempF: 175,
		doneness: "175\u00B0F for rendered, crisp skin",
	},
	{
		name: "Turkey",
		hoursPerPound: 0.5,
		fixedHours: null,
		restMinutes: 30,
		pitTempF: 275,
		targetTempF: 165,
		doneness: "165\u00B0F in the breast, 175\u00B0F in the thigh",
	},
	{
		name: "Tri-Tip",
		hoursPerPound: null,
		fixedHours: 1.5,
		restMinutes: 15,
		pitTempF: 250,
		targetTempF: 130,
		doneness: "130-135\u00B0F for medium-rare, then rest",
	},
	{
		name: "Salmon",
		hoursPerPound: null,
		fixedHours: 1,
		restMinutes: 5,
		pitTempF: 225,
		targetTempF: 125,
		doneness: "125-130\u00B0F for moist, flaky fillets",
	},
	{
		name: "Beef Short Ribs",
		hoursPerPound: 1.5,
		fixedHours: null,
		restMinutes: 30,
		pitTempF: 250,
		targetTempF: 203,
		doneness: "Probe-tender, around 203\u00B0F",
	},
];

/** Aliases mapping user input to a canonical profile name. */
const ALIASES: Record<string, string> = {
	brisket: "Brisket",
	"pork butt": "Pork Butt",
	"pork-butt": "Pork Butt",
	porkbutt: "Pork Butt",
	"pork shoulder": "Pork Butt",
	"pulled pork": "Pork Butt",
	ribs: "Pork Ribs",
	"pork ribs": "Pork Ribs",
	"spare ribs": "Pork Ribs",
	"st louis ribs": "Pork Ribs",
	"baby back ribs": "Baby Back Ribs",
	"baby back": "Baby Back Ribs",
	babyback: "Baby Back Ribs",
	chicken: "Whole Chicken",
	"whole chicken": "Whole Chicken",
	wings: "Chicken Wings",
	"chicken wings": "Chicken Wings",
	turkey: "Turkey",
	"tri tip": "Tri-Tip",
	"tri-tip": "Tri-Tip",
	tritip: "Tri-Tip",
	salmon: "Salmon",
	"short ribs": "Beef Short Ribs",
	"beef short ribs": "Beef Short Ribs",
};

/** Return the built-in meat profiles. */
export function getMeatProfiles(): MeatProfile[] {
	return PROFILES.map((p) => ({ ...p }));
}

/** Resolve a meat name or alias to a profile, or null if unknown. */
export function resolveMeatProfile(name: string): MeatProfile | null {
	const key = name.trim().toLowerCase();
	const canonical = ALIASES[key];
	if (canonical) {
		return PROFILES.find((p) => p.name === canonical) ?? null;
	}
	return PROFILES.find((p) => p.name.toLowerCase() === key) ?? null;
}

function cookHoursFor(item: CookPlanItemInput): {
	hours: number;
	restMinutes: number;
	meat: string | null;
} {
	if (typeof item.hours === "number") {
		if (!Number.isFinite(item.hours) || item.hours <= 0) {
			throw new Error(`Cook time must be a positive number of hours, got: ${item.hours}`);
		}
		return {
			hours: item.hours,
			restMinutes: item.restMinutes ?? 0,
			meat: item.meat ? (resolveMeatProfile(item.meat)?.name ?? item.meat) : null,
		};
	}

	if (!item.meat) {
		throw new Error("Each item needs either a meat type or an explicit cook time in hours.");
	}

	const profile = resolveMeatProfile(item.meat);
	if (!profile) {
		throw new Error(
			`Unknown meat: "${item.meat}". Use one of the built-in profiles or pass hours.`,
		);
	}

	let hours: number;
	if (profile.hoursPerPound != null) {
		if (
			typeof item.weightLb !== "number" ||
			!Number.isFinite(item.weightLb) ||
			item.weightLb <= 0
		) {
			if (profile.fixedHours != null) {
				hours = profile.fixedHours;
			} else {
				throw new Error(
					`${profile.name} is planned per pound. Pass a weight, e.g. "${item.meat}=12".`,
				);
			}
		} else {
			hours = profile.hoursPerPound * item.weightLb;
		}
	} else if (profile.fixedHours != null) {
		hours = profile.fixedHours;
	} else {
		throw new Error(`${profile.name} has no cook-time estimate. Pass explicit hours.`);
	}

	return { hours, restMinutes: item.restMinutes ?? profile.restMinutes, meat: profile.name };
}

/**
 * Build a cook plan. For each item, the start time is the shared ready time
 * minus rest minus cook time. Items are returned sorted by earliest start.
 *
 * @throws Error if readyAt is invalid or an item cannot be resolved.
 */
export function planCook(items: CookPlanItemInput[], options: PlanCookOptions): CookPlan {
	const readyAt = options.readyAt;
	if (!(readyAt instanceof Date) || Number.isNaN(readyAt.getTime())) {
		throw new Error("A valid ready time is required.");
	}
	if (items.length === 0) {
		throw new Error("Plan at least one item.");
	}

	const planned: CookPlanItem[] = items.map((item, index) => {
		const { hours, restMinutes, meat } = cookHoursFor(item);
		const cookMinutes = Math.round(hours * 60);
		const removeAt = new Date(readyAt.getTime() - restMinutes * 60_000);
		const startAt = new Date(removeAt.getTime() - cookMinutes * 60_000);
		return {
			label: item.label ?? meat ?? `Item ${index + 1}`,
			meat,
			cookMinutes,
			restMinutes,
			startAt,
			removeAt,
			readyAt,
		};
	});

	planned.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
	return { readyAt, items: planned };
}
