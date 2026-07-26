import { Eye, EyeOff, Loader2, Star, ThermometerSun } from "lucide-react";
import { useMemo } from "react";
import { Link, useOutletContext } from "react-router";
import type { AppOutletContext } from "../components/AppLayout.tsx";
import { useDevices } from "../hooks/useDevices.ts";
import { useDeviceVisibility } from "../hooks/useDeviceVisibility.ts";
import type { DeviceWithChannels } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";

export function Devices() {
	const { client } = useOutletContext<AppOutletContext>();
	const { data, isLoading, error } = useDevices(client);
	const { favorites, hiddenSerials, showHidden, setShowHidden, toggleFavorite, toggleHidden } =
		useDeviceVisibility();

	// Filter hidden devices and sort favorites first
	const visibleData = useMemo(() => {
		const filtered = showHidden ? data : data.filter((d) => !hiddenSerials.has(d.device.serial));

		if (favorites.size === 0) return filtered;

		const favs: DeviceWithChannels[] = [];
		const rest: DeviceWithChannels[] = [];
		for (const d of filtered) {
			if (favorites.has(d.device.serial)) {
				favs.push(d);
			} else {
				rest.push(d);
			}
		}
		return [...favs, ...rest];
	}, [data, favorites, hiddenSerials, showHidden]);

	const hiddenCount = useMemo(
		() => data.filter((d) => hiddenSerials.has(d.device.serial)).length,
		[data, hiddenSerials],
	);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<ThermometerSun className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
					<h1 className="text-lg font-semibold tracking-tight">Devices</h1>
				</div>
				{hiddenCount > 0 && (
					<button
						type="button"
						onClick={() => setShowHidden(!showHidden)}
						aria-label={showHidden ? "Hide hidden devices" : "Show hidden devices"}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5",
							"text-sm text-muted-foreground hover:text-foreground",
							"border border-border hover:bg-muted",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							showHidden && "bg-muted text-foreground",
						)}
					>
						{showHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
						{showHidden ? "Hide hidden" : `Show hidden (${hiddenCount})`}
					</button>
				)}
			</div>

			{error && (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4" role="alert">
					<p className="text-sm text-destructive">{error}</p>
				</div>
			)}

			{isLoading && data.length === 0 && (
				<div className="flex items-center justify-center py-12">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					<span className="ml-2 text-sm text-muted-foreground">Loading devices...</span>
				</div>
			)}

			{!isLoading && data.length === 0 && !error && (
				<p className="text-sm text-muted-foreground py-8 text-center">
					No devices found. Make sure your ThermoWorks Cloud account has registered devices.
				</p>
			)}

			{visibleData.length > 0 && (
				<div className="overflow-hidden rounded-lg border border-border">
					<table className="w-full text-sm">
						<thead className="bg-muted/50">
							<tr>
								<th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
								<th className="px-4 py-2 text-left font-medium text-muted-foreground">Serial</th>
								<th className="px-4 py-2 text-left font-medium text-muted-foreground">Type</th>
								<th className="px-4 py-2 text-left font-medium text-muted-foreground">Channels</th>
								<th className="w-20 px-4 py-2 text-right font-medium text-muted-foreground">
									Actions
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{visibleData.map((item) => {
								const serial = item.device.serial;
								const name = item.device.label ?? serial;
								const fav = favorites.has(serial);
								const hidden = hiddenSerials.has(serial);

								return (
									<tr
										key={serial}
										className={cn("hover:bg-muted/30 transition-colors", hidden && "opacity-60")}
									>
										<td className="px-4 py-2">
											<div className="flex items-center gap-1.5">
												{fav && (
													<Star className="h-3.5 w-3.5 shrink-0 fill-yellow-500 text-yellow-500" />
												)}
												<Link
													to={`/device/${serial}`}
													className={cn(
														"font-medium text-primary hover:underline",
														"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded",
													)}
												>
													{name}
												</Link>
											</div>
										</td>
										<td className="px-4 py-2 font-mono text-xs text-muted-foreground">{serial}</td>
										<td className="px-4 py-2 text-muted-foreground">
											{item.device.type ?? item.device.device ?? "Unknown"}
										</td>
										<td className="px-4 py-2 text-muted-foreground">{item.channels.length}</td>
										<td className="px-4 py-2">
											<div className="flex items-center justify-end gap-1">
												<button
													type="button"
													onClick={() => toggleFavorite(serial)}
													aria-label={
														fav ? `Remove ${name} from favorites` : `Add ${name} to favorites`
													}
													className={cn(
														"inline-flex items-center justify-center rounded-md p-1",
														"text-muted-foreground hover:text-foreground",
														"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
														"transition-colors",
														fav && "text-yellow-500 hover:text-yellow-600",
													)}
												>
													<Star className={cn("h-3.5 w-3.5", fav && "fill-current")} />
												</button>
												<button
													type="button"
													onClick={() => toggleHidden(serial)}
													aria-label={hidden ? `Unhide ${name}` : `Hide ${name}`}
													className={cn(
														"inline-flex items-center justify-center rounded-md p-1",
														"text-muted-foreground hover:text-foreground",
														"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
														"transition-colors",
													)}
												>
													{hidden ? (
														<Eye className="h-3.5 w-3.5" />
													) : (
														<EyeOff className="h-3.5 w-3.5" />
													)}
												</button>
											</div>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			{/* All-hidden empty state */}
			{!isLoading && data.length > 0 && visibleData.length === 0 && !error && (
				<div className="text-center py-12">
					<EyeOff className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
					<p className="text-muted-foreground">All devices are hidden.</p>
					<p className="text-sm text-muted-foreground mt-1">
						Use the "Show hidden" button to reveal them.
					</p>
				</div>
			)}
		</div>
	);
}
