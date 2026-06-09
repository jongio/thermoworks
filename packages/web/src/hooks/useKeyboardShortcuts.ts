import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { navigationItems } from "../lib/navigation.ts";

export interface Shortcut {
	key: string;
	description: string;
	action: () => void;
}

/** Returns true if focus is inside an input, textarea, or contenteditable. */
function isEditing(): boolean {
	const el = document.activeElement;
	if (!el) return false;
	const tag = el.tagName.toLowerCase();
	if (tag === "input" || tag === "textarea" || tag === "select") return true;
	if ((el as HTMLElement).isContentEditable) return true;
	return false;
}

/**
 * Global keyboard shortcuts for the dashboard.
 * Returns the shortcuts list and a toggle for the help overlay.
 */
export function useKeyboardShortcuts() {
	const navigate = useNavigate();
	const [showHelp, setShowHelp] = useState(false);

	const shortcuts: Shortcut[] = [
		{ key: "r", description: "Refresh page", action: () => window.location.reload() },
		{
			key: "/",
			description: "Focus search bar",
			action: () => {
				const searchInput = document.querySelector<HTMLInputElement>("[data-search-input]");
				searchInput?.focus();
			},
		},
		{ key: "?", description: "Show shortcuts help", action: () => setShowHelp((prev) => !prev) },
		{ key: "Escape", description: "Close modals/panels", action: () => setShowHelp(false) },
		...navigationItems.map((item, i) => ({
			key: String(i + 1),
			description: `Navigate to ${item.label}`,
			action: () => navigate(item.path),
		})),
	];

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (isEditing()) return;
			if (e.ctrlKey || e.metaKey || e.altKey) return;

			const shortcut = shortcuts.find((s) => s.key === e.key);
			if (shortcut) {
				e.preventDefault();
				shortcut.action();
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	});

	return { shortcuts, showHelp, setShowHelp };
}
