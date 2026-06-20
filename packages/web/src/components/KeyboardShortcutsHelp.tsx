import { Keyboard, X } from "lucide-react";
import type { Shortcut } from "../hooks/useKeyboardShortcuts.ts";
import { cn } from "../lib/utils.ts";

interface KeyboardShortcutsHelpProps {
	shortcuts: Shortcut[];
	onClose: () => void;
}

export function KeyboardShortcutsHelp({ shortcuts, onClose }: KeyboardShortcutsHelpProps) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
			role="dialog"
			aria-modal="true"
			aria-label="Keyboard shortcuts"
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: prevents click-to-dismiss propagation on dialog content */}
			<div
				className={cn(
					"bg-card border border-border rounded-xl shadow-xl p-6 max-w-sm w-full mx-4",
					"animate-in fade-in zoom-in-95 duration-150",
				)}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-2">
						<Keyboard className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
						<h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						aria-label="Close"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
				<ul className="space-y-2">
					{shortcuts.map((s) => (
						<li key={s.key} className="flex items-center justify-between text-sm">
							<span className="text-muted-foreground">{s.description}</span>
							<kbd className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
								{s.key}
							</kbd>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
