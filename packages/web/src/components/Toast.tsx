import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "../lib/utils.ts";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
	id: string;
	type: ToastType;
	message: string;
}

const DISMISS_MS = 4000;
const MAX_VISIBLE = 3;

let toastIdCounter = 0;
const listeners: Set<(toast: ToastItem) => void> = new Set();

/** Global toast trigger — call from anywhere. */
export function showToast(type: ToastType, message: string) {
	const toast: ToastItem = { id: String(++toastIdCounter), type, message };
	for (const listener of listeners) {
		listener(toast);
	}
}

function ToastIcon({ type }: { type: ToastType }) {
	switch (type) {
		case "success":
			return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" aria-hidden="true" />;
		case "error":
			return <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />;
		case "info":
			return <Info className="h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />;
	}
}

function ToastEntry({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
	useEffect(() => {
		const timer = setTimeout(() => onDismiss(toast.id), DISMISS_MS);
		return () => clearTimeout(timer);
	}, [toast.id, onDismiss]);

	return (
		<div
			role="alert"
			aria-live="assertive"
			className={cn(
				"flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg",
				"bg-card text-foreground border-border",
				"animate-in slide-in-from-bottom-2 fade-in duration-200",
			)}
		>
			<ToastIcon type={toast.type} />
			<span className="text-sm flex-1">{toast.message}</span>
			<button
				type="button"
				onClick={() => onDismiss(toast.id)}
				className="shrink-0 rounded-md p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label="Dismiss"
			>
				<X className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}

/** Render this once at the app root to display toasts. */
export function Toaster() {
	const [toasts, setToasts] = useState<ToastItem[]>([]);

	useEffect(() => {
		function handleToast(toast: ToastItem) {
			setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), toast]);
		}
		listeners.add(handleToast);
		return () => {
			listeners.delete(handleToast);
		};
	}, []);

	const dismiss = useCallback((id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	if (toasts.length === 0) return null;

	return (
		<div
			aria-label="Notifications"
			className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
		>
			{toasts.map((toast) => (
				<div key={toast.id} className="pointer-events-auto">
					<ToastEntry toast={toast} onDismiss={dismiss} />
				</div>
			))}
		</div>
	);
}
