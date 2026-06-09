import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef } from "react";
import { useContainerColumns } from "../hooks/useContainerColumns.ts";
import type { DeviceWithChannels, ThermoworksWebClient } from "../lib/api.ts";
import { DeviceCard } from "./DeviceCard.tsx";

interface VirtualizedDeviceGridProps {
	data: DeviceWithChannels[];
	client: ThermoworksWebClient;
}

/** Estimated height (px) per card row to reduce layout shift before measurement. */
const ESTIMATED_ROW_HEIGHT = 280;

/**
 * Virtualized grid renderer for large device lists (20+ devices).
 * Groups devices into rows matching the responsive column count,
 * then virtualizes the rows for smooth scrolling performance.
 */
export function VirtualizedDeviceGrid({ data, client }: VirtualizedDeviceGridProps) {
	const { ref: columnsRef, columns } = useContainerColumns();
	const scrollRef = useRef<HTMLDivElement>(null);
	const savedScrollTop = useRef(0);
	const prevDataLength = useRef(data.length);

	const rowCount = Math.ceil(data.length / columns);

	const virtualizer = useVirtualizer({
		count: rowCount,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		overscan: 3,
		measureElement: (element) => {
			// Measure actual rendered row height for accurate virtualization
			return element.getBoundingClientRect().height;
		},
	});

	// Save scroll position before data refresh (detected by data length change then restore)
	useEffect(() => {
		if (data.length !== prevDataLength.current) {
			// Data changed - restore saved scroll position
			const container = scrollRef.current;
			if (container && savedScrollTop.current > 0) {
				// Use requestAnimationFrame to ensure DOM has updated
				requestAnimationFrame(() => {
					container.scrollTop = savedScrollTop.current;
				});
			}
			prevDataLength.current = data.length;
		}
	}, [data.length]);

	// Track scroll position continuously so we can restore it after refresh
	const handleScroll = useCallback(() => {
		const container = scrollRef.current;
		if (container) {
			savedScrollTop.current = container.scrollTop;
		}
	}, []);

	// Reset virtualizer measurements when column count changes
	useEffect(() => {
		virtualizer.measure();
	}, [columns, virtualizer]);

	const virtualItems = virtualizer.getVirtualItems();

	return (
		<div ref={columnsRef}>
			<div
				ref={scrollRef}
				onScroll={handleScroll}
				className="max-h-[calc(100vh-16rem)] overflow-y-auto"
				role="list"
				aria-label="Device list"
			>
				<div
					className="relative w-full"
					style={{ height: `${virtualizer.getTotalSize()}px` }}
				>
					{virtualItems.map((virtualRow) => {
						const startIdx = virtualRow.index * columns;
						const rowDevices = data.slice(startIdx, startIdx + columns);

						return (
							<div
								key={virtualRow.key}
								ref={virtualizer.measureElement}
								data-index={virtualRow.index}
								className="absolute left-0 w-full"
								style={{ top: `${virtualRow.start}px` }}
							>
								<div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 pb-4">
									{rowDevices.map((item) => (
										<DeviceCard
											key={item.device.serial}
											item={item}
											client={client}
										/>
									))}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
