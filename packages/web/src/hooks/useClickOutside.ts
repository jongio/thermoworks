import { useEffect } from "react";
import type { RefObject } from "react";

/** Close a dropdown or popover when a click occurs outside the referenced element. */
export function useClickOutside(ref: RefObject<HTMLElement | null>, onClickOutside: () => void): void {
	useEffect(() => {
		function handlePointerDown(event: PointerEvent) {
			if (ref.current && !ref.current.contains(event.target as Node)) {
				onClickOutside();
			}
		}
		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, [ref, onClickOutside]);
}
