import { Loader2 } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle.tsx";

/** Shared header for public share views. */
export function ShareHeader() {
	return (
		<header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
				<h1 className="text-lg font-semibold tracking-tight">
					<span className="mr-1.5">🔥</span>
					ThermoWorks
				</h1>
				<ThemeToggle />
			</div>
		</header>
	);
}

/** Full-page loading spinner with shared header. */
export function ShareLoading() {
	return (
		<div className="min-h-screen">
			<ShareHeader />
			<div className="flex items-center justify-center py-20">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		</div>
	);
}

/** Full-page error message with shared header. */
export function ShareError({ message }: { message: string }) {
	return (
		<div className="min-h-screen">
			<ShareHeader />
			<div className="mx-auto max-w-2xl px-4 py-20 text-center">
				<p className="text-sm text-destructive">{message}</p>
			</div>
		</div>
	);
}
