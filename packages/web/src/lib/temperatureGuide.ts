import type { TemperatureGuide, TemperatureGuideItem } from "./api.ts";

export const FALLBACK_TEMPERATURE_GUIDE: TemperatureGuide = {
	categories: [
		{
			name: "Beef",
			items: [
				{ name: "Rare", temp: 125, units: "F" },
				{ name: "Medium Rare", temp: 135, units: "F" },
				{ name: "Medium", temp: 145, units: "F" },
				{ name: "Well Done", temp: 160, units: "F" },
			],
		},
		{
			name: "Poultry",
			items: [
				{ name: "Chicken Breast", temp: 165, units: "F" },
				{ name: "Chicken Thigh", temp: 175, units: "F" },
				{ name: "Turkey", temp: 165, units: "F" },
			],
		},
		{
			name: "Pork",
			items: [
				{ name: "Pork Chop", temp: 145, units: "F" },
				{ name: "Pulled Pork", temp: 203, units: "F" },
				{ name: "Pork Tenderloin", temp: 145, units: "F" },
			],
		},
		{
			name: "Fish",
			items: [
				{ name: "Salmon", temp: 125, units: "F" },
				{ name: "Tuna (rare)", temp: 115, units: "F" },
			],
		},
	],
};

export interface CookPreset {
	id: string;
	category: string;
	item: TemperatureGuideItem;
	label: string;
	sessionLabel: string;
}

export function guideWithFallback(data: TemperatureGuide | null): TemperatureGuide {
	return data && data.categories.length > 0 ? data : FALLBACK_TEMPERATURE_GUIDE;
}

export function buildCookPresets(guide: TemperatureGuide): CookPreset[] {
	return guide.categories.flatMap((category) =>
		category.items
			.filter((item) => item.name.trim() !== "" && Number.isFinite(item.temp))
			.map((item) => {
				const doneness = item.doneness ? ` (${item.doneness})` : "";
				const sessionLabel = `${item.name}${doneness}`;
				return {
					id: `${category.name}-${item.name}-${item.doneness ?? ""}-${item.temp}-${item.units}`,
					category: category.name,
					item,
					label: `${category.name} - ${sessionLabel}`,
					sessionLabel,
				};
			}),
	);
}
