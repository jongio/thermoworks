import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { DeviceWithChannels, ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";
import { DeviceCard } from "./DeviceCard.tsx";

interface SortableDeviceCardProps {
	item: DeviceWithChannels;
	client: ThermoworksWebClient;
	/** Whether this device is marked as a favorite. */
	isFavorite?: boolean;
	/** Whether this device is hidden (shown only via "Show hidden" toggle). */
	isHidden?: boolean;
	/** Callback to toggle this device's favorite status. */
	onToggleFavorite?: (serial: string) => void;
	/** Callback to toggle this device's hidden status. */
	onToggleHidden?: (serial: string) => void;
}

/**
 * Wrapper around DeviceCard that integrates with @dnd-kit/sortable.
 * Renders a drag handle and applies transform/transition styles during drag.
 */
export function SortableDeviceCard({
	item,
	client,
	isFavorite,
	isHidden,
	onToggleFavorite,
	onToggleHidden,
}: SortableDeviceCardProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: item.device.serial });

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : undefined,
		position: "relative" as const,
	};

	return (
		<div ref={setNodeRef} style={style} className="flex">
			{/* Drag handle */}
			<button
				ref={setActivatorNodeRef}
				type="button"
				aria-label="Drag to reorder"
				className={cn(
					"flex items-center px-1.5 shrink-0 rounded-l-lg",
					"text-muted-foreground hover:text-foreground",
					"hover:bg-muted cursor-grab active:cursor-grabbing",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					"touch-none",
				)}
				{...attributes}
				{...listeners}
			>
				<GripVertical className="h-4 w-4" />
			</button>
			<div className="flex-1 min-w-0">
				<DeviceCard
					item={item}
					client={client}
					isFavorite={isFavorite}
					isHidden={isHidden}
					onToggleFavorite={onToggleFavorite}
					onToggleHidden={onToggleHidden}
				/>
			</div>
		</div>
	);
}
