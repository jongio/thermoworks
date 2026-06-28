import { Check, Copy, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";

interface ShareManagerProps {
	serial: string;
	archiveId?: string;
	client: ThermoworksWebClient;
	onClose: () => void;
}

export function ShareManager({ serial, archiveId, client, onClose }: ShareManagerProps) {
	const [shareUrl, setShareUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [copied, setCopied] = useState(false);
	const dialogRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let cancelled = false;

		async function generateLink() {
			setIsLoading(true);
			setError(null);
			try {
				const result = archiveId
					? await client.shareArchive(serial, archiveId)
					: await client.shareDevice(serial);
				if (!cancelled) {
					setShareUrl(result.shareUrl);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Failed to generate share link");
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		}

		generateLink();
		return () => {
			cancelled = true;
		};
	}, [client, serial, archiveId]);

	// Close on Escape key
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	// Close on backdrop click
	const handleBackdropClick = useCallback(
		(e: React.MouseEvent) => {
			if (e.target === e.currentTarget) onClose();
		},
		[onClose],
	);

	const handleCopy = async () => {
		if (!shareUrl) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Fallback: select text in input for manual copy
			const input = dialogRef.current?.querySelector("input");
			if (input) {
				input.select();
			}
		}
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={handleBackdropClick}
			onKeyDown={(e) => {
				if (e.key === "Escape") handleBackdropClick(e as unknown as React.MouseEvent);
			}}
			role="dialog"
			aria-modal="true"
			aria-label="Share device"
		>
			<div
				ref={dialogRef}
				className={cn(
					"w-full max-w-md mx-4 rounded-lg border border-border bg-card p-5 shadow-lg",
					"animate-in fade-in-0 zoom-in-95",
				)}
			>
				{/* Header */}
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-sm font-semibold">Share {archiveId ? "Archive" : "Device"}</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close share dialog"
						className={cn(
							"rounded-md p-1 hover:bg-muted",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							"transition-colors",
						)}
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				{/* Content */}
				{isLoading && (
					<div className="flex items-center justify-center py-6">
						<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
					</div>
				)}

				{error && <p className="text-sm text-destructive py-2">{error}</p>}

				{shareUrl && !isLoading && (
					<div className="space-y-3">
						<p className="text-xs text-muted-foreground">
							Anyone with this link can view the {archiveId ? "archive" : "device"} readings.
						</p>
						<div className="flex items-center gap-2">
							<input
								type="text"
								readOnly
								value={shareUrl}
								className={cn(
									"flex-1 min-w-0 rounded-md border border-border bg-muted px-3 py-1.5",
									"text-xs font-mono truncate",
									"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								)}
								onClick={(e) => (e.target as HTMLInputElement).select()}
							/>
							<button
								type="button"
								onClick={handleCopy}
								aria-label={copied ? "Copied" : "Copy share link"}
								className={cn(
									"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5",
									"text-xs font-medium shrink-0",
									"border border-border",
									"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									"transition-colors",
									copied ? "bg-green-500/10 text-green-600 border-green-500/30" : "hover:bg-muted",
								)}
							>
								{copied ? (
									<>
										<Check className="h-3.5 w-3.5" />
										Copied!
									</>
								) : (
									<>
										<Copy className="h-3.5 w-3.5" />
										Copy
									</>
								)}
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
