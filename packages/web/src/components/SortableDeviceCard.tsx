import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { DeviceWithChannels, ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";
import { DeviceCard } from "./DeviceCard.tsx";

interface SortableDeviceCardProps {
	item: DeviceWithChannels;
	client: ThermoworksWebClient;
}

/**
 * Wrapper around DeviceCard that integrates with @dnd-kit/sortable.
 * Renders a drag handle and applies transform/transition styles during drag.
 */
export function SortableDeviceCard({ item, client }: SortableDeviceCardProps) {
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
		<div ref={setNodeRef} style={style} {...attributes}>
			{/* Drag handle */}
			<button
				ref={setActivatorNodeRef}
				type="button"
				aria-label="Drag to reorder"
				className={cn(
					"absolute top-2 right-2 z-10 p-1.5 rounded-md",
					"text-muted-foreground hover:text-foreground",
					"hover:bg-muted cursor-grab active:cursor-grabbing",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					"touch-none",
				)}
				{...listeners}
			>
				<GripVertical className="h-4 w-4" />
			</button>
			<DeviceCard item={item} client={client} />
		</div>
	);
}
