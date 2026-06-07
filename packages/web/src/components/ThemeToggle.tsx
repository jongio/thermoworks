import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils.ts";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
	if (typeof window === "undefined") return "dark";
	const stored = window.localStorage.getItem("thermoworks-theme");
	if (stored === "light" || stored === "dark") return stored;
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
	const [theme, setTheme] = useState<Theme>(getInitialTheme);

	useEffect(() => {
		const root = document.documentElement;
		root.classList.remove("light", "dark");
		root.classList.add(theme);
		window.localStorage.setItem("thermoworks-theme", theme);
	}, [theme]);

	function toggle() {
		setTheme((prev) => (prev === "dark" ? "light" : "dark"));
	}

	return (
		<button
			type="button"
			onClick={toggle}
			title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
			aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
			className={cn(
				"inline-flex h-9 w-9 items-center justify-center rounded-md",
				"border border-border hover:bg-muted",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
			)}
		>
			{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
		</button>
	);
}
