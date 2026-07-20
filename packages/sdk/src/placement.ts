import { getMeatProfiles, resolveMeatProfile } from "./plan.js";

/** Probe placement guidance for one built-in cut. */
export interface ProbePlacement {
	/** Canonical meat profile name. */
	readonly meat: string;
	/** Where to place the food probe. */
	readonly meatProbe: string;
	/** Where to place the pit or ambient probe. */
	readonly pitProbe: string;
	/** Common placement mistakes to avoid. */
	readonly avoid: readonly string[];
	/** Extra cook-specific placement notes. */
	readonly notes: readonly string[];
}

const PLACEMENTS: Record<string, Omit<ProbePlacement, "meat">> = {
	Brisket: {
		meatProbe: "Center of the flat, from the side, with the tip in the thickest lean section.",
		pitProbe: "Clipped to the grate near the brisket, shielded from direct radiant heat.",
		avoid: ["Fat seams", "the point", "touching the grate", "the firebox side of an offset smoker"],
		notes: ["Use a second probe in the point if you want to track both muscles."],
	},
	"Pork Butt": {
		meatProbe: "Deep in the money muscle or thickest center, angled away from the blade bone.",
		pitProbe: "At grate level beside the butt, not above the dome thermometer.",
		avoid: ["Blade bone", "large fat pockets", "the outer bark"],
		notes: ["Probe tenderness in several spots near the end because shoulders finish unevenly."],
	},
	"Pork Ribs": {
		meatProbe: "Between bones in the thickest center rack section if using a probe.",
		pitProbe: "At grate level beside the rack, with the clip clear of sauce or foil.",
		avoid: ["Touching bone", "thin end bones", "pinching the cable under a lid"],
		notes: ["Ribs are still best judged by bend, pullback, and probe tenderness."],
	},
	"Baby Back Ribs": {
		meatProbe: "Between bones in the thickest center of the rack, parallel to the bones.",
		pitProbe: "At grate level beside the rack and away from direct flame.",
		avoid: ["Bone contact", "the narrow tail end", "placing the pit probe above a water pan edge"],
		notes: ["Use temperature as a trend. Tenderness matters more than a single number."],
	},
	"Whole Chicken": {
		meatProbe: "Deep in the breast from the side, tip centered and not touching the cavity.",
		pitProbe: "At grate level beside the bird, away from dripping flare-ups.",
		avoid: ["Bone", "the cavity", "skin-only shallow placement"],
		notes: ["Spot-check the thigh separately. It should finish hotter than the breast."],
	},
	"Chicken Wings": {
		meatProbe: "Use the largest drumette or flat if monitoring, with the tip centered in meat.",
		pitProbe: "At grate level near the wing pile or basket.",
		avoid: ["Bone", "skin folds", "tiny pieces that over-read quickly"],
		notes: ["Wings are small, so spot checks are often more reliable than a leave-in probe."],
	},
	Turkey: {
		meatProbe: "Deep in the breast from the side, tip centered and clear of the rib cage.",
		pitProbe: "At grate level beside the turkey, not high in the dome.",
		avoid: ["Rib bones", "the cavity", "stuffing", "touching a roasting rack"],
		notes: ["Track the breast and spot-check the thigh so dark meat has time to finish."],
	},
	"Tri-Tip": {
		meatProbe: "Into the thickest center from the side, following the grain line.",
		pitProbe: "At grate level beside the roast, away from the sear zone.",
		avoid: ["The tapered tip", "surface fat", "direct radiant heat during a reverse sear"],
		notes: ["Move or remove the probe before a hard sear if cable heat is a risk."],
	},
	Salmon: {
		meatProbe: "Into the thickest fillet section from the side, shallow enough to stay centered.",
		pitProbe: "At grate level beside the fillet or plank.",
		avoid: ["Thin tail sections", "touching the plank", "pushing through the fillet"],
		notes: ["Salmon changes quickly near the end. Pair the probe with visual flake checks."],
	},
	"Beef Short Ribs": {
		meatProbe: "Centered in the thickest meat between bones, inserted from the side.",
		pitProbe: "At grate level beside the ribs, clear of the bone side and water pan edge.",
		avoid: ["Bone", "fat pockets", "the membrane side"],
		notes: ["Probe each rib for tenderness because thickness varies across the plate."],
	},
};

function copyPlacement(meat: string, placement: Omit<ProbePlacement, "meat">): ProbePlacement {
	return {
		meat,
		meatProbe: placement.meatProbe,
		pitProbe: placement.pitProbe,
		avoid: [...placement.avoid],
		notes: [...placement.notes],
	};
}

/** Return probe placement guidance for every built-in meat profile. */
export function getProbePlacements(): ProbePlacement[] {
	return getMeatProfiles().map((profile) => {
		const placement = PLACEMENTS[profile.name];
		if (!placement) throw new Error(`Missing probe placement for ${profile.name}`);
		return copyPlacement(profile.name, placement);
	});
}

/** Resolve a meat name or alias to probe placement guidance. */
export function resolveProbePlacement(meat: string): ProbePlacement | null {
	const profile = resolveMeatProfile(meat);
	if (!profile) return null;
	const placement = PLACEMENTS[profile.name];
	return placement ? copyPlacement(profile.name, placement) : null;
}
