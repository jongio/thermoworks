import { Clock, Square, Timer } from "lucide-react";
import { useState } from "react";
import { useSession } from "../hooks/useSession.ts";
import type { ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";

interface SessionControlsProps {
	client: ThermoworksWebClient;
	serial: string;
	sessionStart: Date | null;
	sessionLabel: string | null;
}

export function SessionControls({
	client,
	serial,
	sessionStart,
	sessionLabel,
}: SessionControlsProps) {
	const { isActive, elapsed, label, startSession, endSession, error } = useSession(
		client,
		serial,
		sessionStart,
		sessionLabel,
	);
	const [inputLabel, setInputLabel] = useState("");
	const [showConfirm, setShowConfirm] = useState(false);

	const handleStart = async () => {
		await startSession(inputLabel.trim() || undefined);
		setInputLabel("");
	};

	const handleEndClick = () => {
		setShowConfirm(true);
	};

	const handleConfirmEnd = async () => {
		await endSession();
		setShowConfirm(false);
	};

	const handleCancelEnd = () => {
		setShowConfirm(false);
	};

	if (isActive) {
		return (
			<div className="mt-3 rounded-md border border-border bg-muted/50 p-2.5">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-1.5 min-w-0">
						<Timer className="h-3.5 w-3.5 text-green-500 shrink-0" aria-hidden="true" />
						<span
							className="text-xs font-mono font-medium tabular-nums"
							role="timer"
							aria-label="Session elapsed time"
						>
							{elapsed}
						</span>
						{label && (
							<span className="text-xs text-muted-foreground truncate" title={label}>
								- {label}
							</span>
						)}
					</div>
					{!showConfirm && (
						<button
							type="button"
							onClick={handleEndClick}
							className={cn(
								"inline-flex items-center gap-1 rounded px-2 py-1",
								"text-xs text-destructive hover:bg-destructive/10",
								"border border-destructive/30",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								"transition-colors",
							)}
						>
							<Square className="h-3 w-3" aria-hidden="true" />
							End
						</button>
					)}
				</div>
				{showConfirm && (
					<div className="mt-2 flex items-center gap-2">
						<span className="text-xs text-muted-foreground">End session?</span>
						<button
							type="button"
							onClick={handleConfirmEnd}
							className={cn(
								"rounded px-2 py-0.5 text-xs",
								"bg-destructive text-destructive-foreground hover:bg-destructive/90",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								"transition-colors",
							)}
						>
							Confirm
						</button>
						<button
							type="button"
							onClick={handleCancelEnd}
							className={cn(
								"rounded px-2 py-0.5 text-xs",
								"border border-border hover:bg-muted",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								"transition-colors",
							)}
						>
							Cancel
						</button>
					</div>
				)}
				{error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
			</div>
		);
	}

	return (
		<div className="mt-3">
			<div className="flex items-center gap-2">
				<input
					type="text"
					value={inputLabel}
					onChange={(e) => setInputLabel(e.target.value)}
					placeholder="Session label (optional)"
					className={cn(
						"flex-1 min-w-0 rounded-md border border-border bg-background px-2 py-1",
						"text-xs placeholder:text-muted-foreground",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					)}
					onKeyDown={(e) => {
						if (e.key === "Enter") handleStart();
					}}
				/>
				<button
					type="button"
					onClick={handleStart}
					className={cn(
						"inline-flex items-center gap-1 rounded-md px-2.5 py-1",
						"text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"transition-colors shrink-0",
					)}
				>
					<Clock className="h-3 w-3" aria-hidden="true" />
					Start Session
				</button>
			</div>
			{error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
		</div>
	);
}
