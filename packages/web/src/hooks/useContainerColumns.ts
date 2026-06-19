import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tailwind-aligned breakpoints for responsive column count.
 * Maps container width to the number of grid columns to render.
 *
 * - < 768px:  1 column  (sm/default)
 * - 768-1023: 2 columns (md)
 * - >= 1024:  3 columns (lg)
 */
function widthToColumns(width: number): number {
	if (width >= 1024) return 3;
	if (width >= 768) return 2;
	return 1;
}

/**
 * Observes a container element's width and returns the responsive column count.
 * Returns `{ ref, columns }` where `ref` should be attached to the container element.
 */
export function useContainerColumns(): {
	ref: (node: HTMLElement | null) => void;
	columns: number;
} {
	const [columns, setColumns] = useState(1);
	const observerRef = useRef<ResizeObserver | null>(null);
	const nodeRef = useRef<HTMLElement | null>(null);

	const ref = useCallback((node: HTMLElement | null) => {
		// Disconnect old observer
		if (observerRef.current) {
			observerRef.current.disconnect();
			observerRef.current = null;
		}

		nodeRef.current = node;

		if (!node) return;

		// Set initial value
		setColumns(widthToColumns(node.clientWidth));

		// Observe for resize
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const width = entry.contentRect.width;
			setColumns(widthToColumns(width));
		});

		observer.observe(node);
		observerRef.current = observer;
	}, []);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (observerRef.current) {
				observerRef.current.disconnect();
			}
		};
	}, []);

	return { ref, columns };
}
