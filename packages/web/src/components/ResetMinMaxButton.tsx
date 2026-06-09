import { Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";

interface ResetMinMaxButtonProps {
	serial: string;
	channel: number;
	client: ThermoworksWebClient;
	onReset?: () => void;
}

export function ResetMinMaxButton({ serial, channel, client, onReset }: ResetMinMaxButtonProps) {
	const [showConfirm, setShowConfirm] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleReset = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const result = await client.resetMinMax(serial, channel);
			if (!result.success) {
				setError("Reset failed");
				return;
			}
			setShowConfirm(false);
			onReset?.();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Reset failed");
		} finally {
			setIsLoading(false);
		}
	};

	if (showConfirm) {
		return (
			<div className="flex items-center gap-1.5">
				<span className="text-xs text-muted-foreground">Reset?</span>
				<button
					type="button"
					onClick={handleReset}
					disabled={isLoading}
					className={cn(
						"rounded px-2 py-0.5 text-xs",
						"bg-destructive text-destructive-foreground hover:bg-destructive/90",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"disabled:opacity-50 disabled:cursor-not-allowed",
						"transition-colors",
					)}
				>
					{isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm"}
				</button>
				<button
					type="button"
					onClick={() => {
						setShowConfirm(false);
						setError(null);
					}}
					disabled={isLoading}
					className={cn(
						"rounded px-2 py-0.5 text-xs",
						"border border-border hover:bg-muted",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"disabled:opacity-50 disabled:cursor-not-allowed",
						"transition-colors",
					)}
				>
					Cancel
				</button>
				{error && <span className="text-xs text-destructive">{error}</span>}
			</div>
		);
	}

	return (
		<button
			type="button"
			onClick={() => setShowConfirm(true)}
			aria-label="Reset min/max"
			title="Reset min/max"
			className={cn(
				"rounded-md p-1 hover:bg-muted",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				"transition-colors text-muted-foreground hover:text-foreground",
			)}
		>
			<RotateCcw className="h-3.5 w-3.5" />
		</button>
	);
}
