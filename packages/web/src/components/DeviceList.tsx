import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	rectSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Eye, EyeOff, ListRestart, RefreshCw } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useDeviceOrder } from "../hooks/useDeviceOrder.ts";
import { useDeviceVisibility } from "../hooks/useDeviceVisibility.ts";
import type { DeviceWithChannels, ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";
import { DeviceListSkeleton } from "./Skeleton.tsx";
import { SortableDeviceCard } from "./SortableDeviceCard.tsx";
import { VirtualizedDeviceGrid } from "./VirtualizedDeviceGrid.tsx";

/** Device count threshold above which virtualization is enabled. */
const VIRTUALIZATION_THRESHOLD = 20;

interface DeviceListProps {
	data: DeviceWithChannels[];
	isLoading: boolean;
	error: string | null;
	lastUpdated: Date | null;
	onRefresh: () => void;
	client: ThermoworksWebClient;
	/** When true, the empty state reflects a search filter with no matches. */
	isFiltering?: boolean;
}

export function DeviceList({
	data,
	isLoading,
	error,
	lastUpdated,
	onRefresh,
	client,
	isFiltering = false,
}: DeviceListProps) {
	const { orderedDevices, hasCustomOrder, saveOrder, resetOrder } = useDeviceOrder(data);
	const {
		favorites,
		hiddenSerials,
		showHidden,
		setShowHidden,
		toggleFavorite,
		toggleHidden,
		isFavorite,
		isHidden,
	} = useDeviceVisibility();

	// Filter hidden devices and sort favorites first, composing with existing order
	const visibleDevices = useMemo(() => {
		const filtered = showHidden
			? orderedDevices
			: orderedDevices.filter((d) => !hiddenSerials.has(d.device.serial));

		if (favorites.size === 0) return filtered;

		// Stable partition: favorites keep their relative order, then non-favorites
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
	}, [orderedDevices, favorites, hiddenSerials, showHidden]);

	const visibleIds = useMemo(() => visibleDevices.map((d) => d.device.serial), [visibleDevices]);

	const hiddenCount = useMemo(
		() => data.filter((d) => hiddenSerials.has(d.device.serial)).length,
		[data, hiddenSerials],
	);

	const useVirtualization = visibleDevices.length > VIRTUALIZATION_THRESHOLD;

	// Configure DnD sensors: pointer (desktop) + touch (mobile, long-press activation)
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 8 },
		}),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 250, tolerance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			if (!over || active.id === over.id) return;

			const oldIndex = visibleIds.indexOf(active.id as string);
			const newIndex = visibleIds.indexOf(over.id as string);
			if (oldIndex === -1 || newIndex === -1) return;

			const reordered = arrayMove(visibleIds, oldIndex, newIndex);
			saveOrder(reordered);
		},
		[visibleIds, saveOrder],
	);

	return (
		<div className="space-y-4">
			{/* Status bar */}
			<div className="flex items-center justify-between">
				<div className="text-sm text-muted-foreground">
					{data.length > 0 && (
						<>
							<span>
								{visibleDevices.length} device
								{visibleDevices.length !== 1 ? "s" : ""}
							</span>
							{hiddenCount > 0 && !showHidden && (
								<span className="ml-1">({hiddenCount} hidden)</span>
							)}
						</>
					)}
					{lastUpdated && (
						<span className="ml-2">- Updated {lastUpdated.toLocaleTimeString()}</span>
					)}
				</div>
				<div className="flex items-center gap-2">
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
					{hasCustomOrder && !useVirtualization && (
						<button
							type="button"
							onClick={resetOrder}
							title="Reset to alphabetical order"
							className={cn(
								"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5",
								"text-sm text-muted-foreground hover:text-foreground",
								"border border-border hover:bg-muted",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							)}
						>
							<ListRestart className="h-3.5 w-3.5" />
							Reset Order
						</button>
					)}
					<button
						type="button"
						onClick={onRefresh}
						disabled={isLoading}
						title="Refresh now"
						className={cn(
							"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5",
							"text-sm text-muted-foreground hover:text-foreground",
							"border border-border hover:bg-muted",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							"disabled:opacity-50 disabled:pointer-events-none",
						)}
					>
						<RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
						Refresh
					</button>
				</div>
			</div>

			{/* Error state */}
			{error && (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4" role="alert">
					<p className="text-sm text-destructive">{error}</p>
				</div>
			)}

			{/* Loading state (initial) */}
			{isLoading && data.length === 0 && !error && <DeviceListSkeleton />}

			{/* Empty state */}
			{!isLoading && data.length === 0 && !error && (
				<div className="text-center py-12">
					<p className="text-muted-foreground">
						{isFiltering ? "No devices match your search." : "No devices found."}
					</p>
					{!isFiltering && (
						<p className="text-sm text-muted-foreground mt-1">
							Make sure your devices are registered in ThermoWorks Cloud.
						</p>
					)}
				</div>
			)}

			{/* All-hidden empty state */}
			{!isLoading && data.length > 0 && visibleDevices.length === 0 && !error && (
				<div className="text-center py-12">
					<EyeOff className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
					<p className="text-muted-foreground">All devices are hidden.</p>
					<p className="text-sm text-muted-foreground mt-1">
						Use the "Show hidden" button to reveal them.
					</p>
				</div>
			)}

			{/* Device grid: virtualized for large lists, sortable for small */}
			{visibleDevices.length > 0 &&
				(useVirtualization ? (
					<VirtualizedDeviceGrid
						data={visibleDevices}
						client={client}
						favorites={favorites}
						hiddenSerials={hiddenSerials}
						onToggleFavorite={toggleFavorite}
						onToggleHidden={toggleHidden}
					/>
				) : (
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={handleDragEnd}
					>
						<SortableContext items={visibleIds} strategy={rectSortingStrategy}>
							<div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
								{visibleDevices.map((item) => (
									<SortableDeviceCard
										key={item.device.serial}
										item={item}
										client={client}
										isFavorite={isFavorite(item.device.serial)}
										isHidden={isHidden(item.device.serial)}
										onToggleFavorite={toggleFavorite}
										onToggleHidden={toggleHidden}
									/>
								))}
							</div>
						</SortableContext>
					</DndContext>
				))}
		</div>
	);
}
