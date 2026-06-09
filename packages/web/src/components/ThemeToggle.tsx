import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils.ts";

type ThemeMode = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "thermoworks-theme";

function getInitialMode(): ThemeMode {
	if (typeof window === "undefined") return "system";
	const stored = window.localStorage.getItem(STORAGE_KEY);
	if (stored === "light" || stored === "dark" || stored === "system") return stored;
	return "system";
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
	if (mode === "system") {
		return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	}
	return mode;
}

export function ThemeToggle() {
	const [mode, setMode] = useState<ThemeMode>(getInitialMode);
	const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(mode));

	useEffect(() => {
		const root = document.documentElement;
		const newResolved = resolveTheme(mode);
		setResolved(newResolved);
		root.classList.remove("light", "dark");
		root.classList.add(newResolved);
		window.localStorage.setItem(STORAGE_KEY, mode);
	}, [mode]);

	// Listen for system preference changes when in system mode
	useEffect(() => {
		if (mode !== "system") return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		function onChange() {
			const newResolved = resolveTheme("system");
			setResolved(newResolved);
			const root = document.documentElement;
			root.classList.remove("light", "dark");
			root.classList.add(newResolved);
		}
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [mode]);

	function cycle() {
		setMode((prev) => {
			if (prev === "system") return "light";
			if (prev === "light") return "dark";
			return "system";
		});
	}

	const label = mode === "system" ? `System (${resolved})` : mode === "light" ? "Light" : "Dark";

	const Icon = mode === "system" ? Monitor : resolved === "dark" ? Sun : Moon;

	return (
		<button
			type="button"
			onClick={cycle}
			title={`Theme: ${label}. Click to switch.`}
			aria-label={`Theme: ${label}. Click to switch.`}
			className={cn(
				"inline-flex h-9 w-9 items-center justify-center rounded-md",
				"border border-border hover:bg-muted",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
			)}
		>
			<Icon className="h-4 w-4" />
		</button>
	);
}
