import { resolveMeatProfile } from "./plan.js";

/** Temperature range where large barbecue cuts usually slice or pull cleanly. */
export interface ServingTemperatureRange {
	readonly minF: number;
	readonly maxF: number;
}

/** Rest-plan input accepted by {@link planRest}. */
export interface RestPlanOptions {
	/** Optional cut weight in pounds. Used to lengthen large-cut hold windows. */
	readonly weightLb?: number;
}

/** A rest plan for a cooked item before slicing, pulling, or serving. */
export interface RestPlan {
	readonly meat: string;
	readonly weightLb: number | null;
	readonly minMinutes: number;
	readonly maxMinutes: number;
	readonly servingTemperatureF: ServingTemperatureRange | null;
	readonly holdMethod: string;
	readonly note: string;
	readonly steps: readonly string[];
}

interface RestProfile {
	readonly minMinutes: number;
	readonly maxMinutes: number;
	readonly servingTemperatureF: ServingTemperatureRange | null;
	readonly holdMethod: string;
	readonly note: string;
	readonly steps: readonly string[];
	readonly longHold?: boolean;
}

const DEFAULT_SERVING_TEMP: ServingTemperatureRange = { minF: 150, maxF: 165 };

const PROFILES: Record<string, RestProfile> = {
	Brisket: {
		minMinutes: 60,
		maxMinutes: 240,
		servingTemperatureF: DEFAULT_SERVING_TEMP,
		holdMethod: "Keep it wrapped, then hold in a dry cooler or warm oven.",
		note: "Slice after the bark has set and the flat has relaxed.",
		steps: [
			"Vent for 5 to 10 minutes so carryover slows.",
			"Re-wrap tightly and insulate.",
			"Slice when the internal temperature falls into the serving range.",
		],
		longHold: true,
	},
	"Pork Butt": {
		minMinutes: 45,
		maxMinutes: 180,
		servingTemperatureF: DEFAULT_SERVING_TEMP,
		holdMethod: "Keep it wrapped and insulated until it is ready to pull.",
		note: "Pulling is easier after juices redistribute and the roast cools slightly.",
		steps: [
			"Vent for 5 minutes if the bark is soft.",
			"Hold wrapped in a dry cooler or warm oven.",
			"Pull when it is still hot enough to serve safely.",
		],
		longHold: true,
	},
	"Pork Ribs": {
		minMinutes: 10,
		maxMinutes: 30,
		servingTemperatureF: null,
		holdMethod: "Tent loosely with foil on a board or sheet pan.",
		note: "A short rest keeps the bark from steaming while juices settle.",
		steps: ["Rest uncovered for 5 minutes, then tent loosely.", "Slice between bones to serve."],
	},
	"Baby Back Ribs": {
		minMinutes: 10,
		maxMinutes: 25,
		servingTemperatureF: null,
		holdMethod: "Tent loosely with foil on a board or sheet pan.",
		note: "Shorter racks need only a brief rest before slicing.",
		steps: ["Rest uncovered for 5 minutes, then tent loosely.", "Slice between bones to serve."],
	},
	"Whole Chicken": {
		minMinutes: 10,
		maxMinutes: 20,
		servingTemperatureF: null,
		holdMethod: "Rest uncovered or loosely tented so the skin stays crisp.",
		note: "Carve after juices settle and the breast is still hot.",
		steps: ["Rest on a board.", "Carve breast meat last so it stays juicy."],
	},
	"Chicken Wings": {
		minMinutes: 5,
		maxMinutes: 10,
		servingTemperatureF: null,
		holdMethod: "Serve from a warm tray after a short rest.",
		note: "Long rests soften crisp skin.",
		steps: [
			"Rest just long enough for bubbling juices to settle.",
			"Sauce after the rest if desired.",
		],
	},
	Turkey: {
		minMinutes: 20,
		maxMinutes: 45,
		servingTemperatureF: null,
		holdMethod: "Rest uncovered or loosely tented before carving.",
		note: "Large birds carve cleaner after the breast relaxes.",
		steps: ["Rest breast-side up.", "Carve once juices stop running heavily."],
	},
	"Tri-Tip": {
		minMinutes: 10,
		maxMinutes: 20,
		servingTemperatureF: null,
		holdMethod: "Tent loosely with foil.",
		note: "Slice across the grain after a short rest.",
		steps: ["Rest on a board.", "Rotate the cut as the grain changes while slicing."],
	},
	Salmon: {
		minMinutes: 3,
		maxMinutes: 8,
		servingTemperatureF: null,
		holdMethod: "Rest uncovered on a warm plate.",
		note: "Fish keeps cooking quickly, so keep the rest short.",
		steps: ["Rest briefly.", "Serve before the flakes dry out."],
	},
	"Beef Short Ribs": {
		minMinutes: 30,
		maxMinutes: 120,
		servingTemperatureF: DEFAULT_SERVING_TEMP,
		holdMethod: "Keep wrapped and insulated until the ribs relax.",
		note: "A longer hold helps collagen finish softening.",
		steps: ["Vent for 5 minutes.", "Hold wrapped until probe-tender and ready to serve."],
		longHold: true,
	},
};

function adjustForWeight(
	profile: RestProfile,
	weightLb: number | undefined,
): {
	minMinutes: number;
	maxMinutes: number;
} {
	if (weightLb === undefined || !profile.longHold) {
		return { minMinutes: profile.minMinutes, maxMinutes: profile.maxMinutes };
	}

	if (weightLb >= 16) {
		return { minMinutes: profile.minMinutes + 30, maxMinutes: profile.maxMinutes + 120 };
	}
	if (weightLb >= 10) {
		return { minMinutes: profile.minMinutes + 15, maxMinutes: profile.maxMinutes + 60 };
	}
	if (weightLb <= 4) {
		return {
			minMinutes: Math.max(10, profile.minMinutes - 15),
			maxMinutes: Math.max(20, profile.maxMinutes - 30),
		};
	}

	return { minMinutes: profile.minMinutes, maxMinutes: profile.maxMinutes };
}

/**
 * Plan a rest window for a common barbecue cut.
 *
 * The result is offline and deterministic. It uses the same meat aliases as the
 * cook planner, then adds a cut-specific holding method and serving notes.
 *
 * @throws Error when the meat is unknown.
 * @throws RangeError when `weightLb` is present but not positive.
 */
export function planRest(meat: string, options: RestPlanOptions = {}): RestPlan {
	const profile = resolveMeatProfile(meat);
	if (!profile) {
		throw new Error(`Unknown meat: "${meat}"`);
	}
	if (
		options.weightLb !== undefined &&
		(!Number.isFinite(options.weightLb) || options.weightLb <= 0)
	) {
		throw new RangeError(`weightLb must be a positive number, got ${options.weightLb}`);
	}

	const restProfile = PROFILES[profile.name] ?? {
		minMinutes: profile.restMinutes,
		maxMinutes: profile.restMinutes,
		servingTemperatureF: null,
		holdMethod: "Rest loosely tented before serving.",
		note: profile.doneness,
		steps: ["Rest before slicing or serving."],
	};
	const { minMinutes, maxMinutes } = adjustForWeight(restProfile, options.weightLb);

	return {
		meat: profile.name,
		weightLb: options.weightLb ?? null,
		minMinutes,
		maxMinutes,
		servingTemperatureF: restProfile.servingTemperatureF,
		holdMethod: restProfile.holdMethod,
		note: restProfile.note,
		steps: restProfile.steps,
	};
}
