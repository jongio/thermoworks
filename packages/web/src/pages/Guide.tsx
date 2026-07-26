import { Beef, Bird, Drumstick, Fish, Search, Thermometer } from "lucide-react";
import { useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import type { AppOutletContext } from "../components/AppLayout.tsx";
import { useTemperatureGuide } from "../hooks/useTemperatureGuide.ts";
import { useTemperatureUnit } from "../hooks/useTemperatureUnit.ts";
import type { TemperatureCategory } from "../lib/api.ts";
import { guideWithFallback } from "../lib/temperatureGuide.ts";

// ─── Category icon mapping ───────────────────────────────────────────────────

function getCategoryIcon(name: string) {
	const lower = name.toLowerCase();
	if (lower.includes("beef")) return Beef;
	if (lower.includes("poultry") || lower.includes("chicken") || lower.includes("turkey"))
		return Bird;
	if (lower.includes("pork")) return Drumstick;
	if (lower.includes("fish") || lower.includes("seafood")) return Fish;
	return Thermometer;
}

// ─── Category section component ──────────────────────────────────────────────

function CategorySection({ category }: { category: TemperatureCategory }) {
	const { formatTemp } = useTemperatureUnit();

	const Icon = getCategoryIcon(category.name);

	return (
		<section className="rounded-lg border border-border bg-card p-4">
			<div className="mb-3 flex items-center gap-2">
				<Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
				<h2 className="text-base font-semibold">{category.name}</h2>
			</div>
			<div className="grid gap-2">
				{category.items.map((item) => (
					<div
						key={`${item.name}-${item.temp}`}
						className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
					>
						<span className="text-sm">
							{item.name}
							{item.doneness ? (
								<span className="ml-1 text-xs text-muted-foreground">({item.doneness})</span>
							) : null}
						</span>
						<span className="font-mono text-sm font-medium">
							{formatTemp(item.temp, item.units)}
						</span>
					</div>
				))}
			</div>
		</section>
	);
}

// ─── Guide page ──────────────────────────────────────────────────────────────

export function Guide() {
	const { client } = useOutletContext<AppOutletContext>();
	const { data, isLoading, error } = useTemperatureGuide(client);
	const [search, setSearch] = useState("");

	// Use API data if it has categories, otherwise fall back to hardcoded guide
	const guide = guideWithFallback(data);

	const filteredCategories = useMemo(() => {
		if (!search.trim()) return guide.categories;
		const term = search.toLowerCase();
		return guide.categories
			.map((cat) => ({
				...cat,
				items: cat.items.filter(
					(item) =>
						item.name.toLowerCase().includes(term) ||
						(item.doneness?.toLowerCase().includes(term) ?? false) ||
						cat.name.toLowerCase().includes(term),
				),
			}))
			.filter((cat) => cat.items.length > 0);
	}, [guide.categories, search]);

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
				<Thermometer className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
				<h1 className="text-lg font-semibold tracking-tight">Temperature Guide</h1>
			</div>

			{error ? <p className="text-sm text-destructive">{error}</p> : null}

			<div className="relative">
				<Search
					className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
					aria-hidden="true"
				/>
				<input
					type="search"
					placeholder="Search by food name..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					aria-label="Search temperature guide"
				/>
			</div>

			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading guide...</p>
			) : filteredCategories.length === 0 ? (
				<p className="text-sm text-muted-foreground">No results found for "{search}"</p>
			) : (
				<div className="grid gap-4 md:grid-cols-2">
					{filteredCategories.map((cat) => (
						<CategorySection key={cat.name} category={cat} />
					))}
				</div>
			)}
		</div>
	);
}
