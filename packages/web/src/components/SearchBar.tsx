import { Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "../lib/utils.ts";

interface SearchBarProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}

/**
 * Search input with magnifying glass icon, clear button,
 * and Cmd/Ctrl+K keyboard shortcut to focus.
 */
export function SearchBar({ value, onChange, placeholder = "Search devices..." }: SearchBarProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if ((event.metaKey || event.ctrlKey) && event.key === "k") {
				event.preventDefault();
				inputRef.current?.focus();
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	return (
		<div className="relative">
			<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
			<input
				ref={inputRef}
				type="search"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				aria-label={placeholder}
				className={cn(
					"w-full rounded-md border border-border bg-background py-2 pl-9",
					value ? "pr-9" : "pr-3",
					"text-sm placeholder:text-muted-foreground",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				)}
			/>
			{value && (
				<button
					type="button"
					onClick={() => onChange("")}
					aria-label="Clear search"
					className={cn(
						"absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5",
						"text-muted-foreground hover:text-foreground",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					)}
				>
					<X className="h-4 w-4" />
				</button>
			)}
			<kbd
				className={cn(
					"absolute right-3 top-1/2 -translate-y-1/2 hidden md:inline-flex",
					"items-center gap-0.5 rounded border border-border px-1.5 py-0.5",
					"text-[10px] font-mono text-muted-foreground",
					value && "hidden md:hidden",
				)}
			>
				<span className="text-xs">⌘</span>K
			</kbd>
		</div>
	);
}
