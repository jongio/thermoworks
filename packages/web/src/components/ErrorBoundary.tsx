import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode, useState } from "react";
import { cn } from "../lib/utils.ts";

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
	onReset?: () => void;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

/** Collapsible section for technical error details. */
function TechnicalDetails({ error }: { error: Error }) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div className="w-full text-left">
			<button
				type="button"
				onClick={() => setExpanded((prev) => !prev)}
				className={cn(
					"flex items-center gap-1 text-xs text-muted-foreground",
					"hover:text-foreground transition-colors",
				)}
				aria-expanded={expanded}
				aria-controls="error-details"
			>
				{expanded ? (
					<ChevronDown className="h-3 w-3" aria-hidden="true" />
				) : (
					<ChevronRight className="h-3 w-3" aria-hidden="true" />
				)}
				Technical details
			</button>
			{expanded && (
				<pre
					id="error-details"
					className="mt-2 text-xs bg-card p-4 rounded-lg overflow-auto border border-border max-h-48"
				>
					{error.message}
					{error.stack && `\n\n${error.stack}`}
				</pre>
			)}
		</div>
	);
}

export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error("ThermoWorks dashboard error:", error, info.componentStack);
	}

	private handleReset = (): void => {
		this.setState({ hasError: false, error: null });
		this.props.onReset?.();
	};

	render(): ReactNode {
		if (this.state.hasError) {
			if (this.props.fallback) return this.props.fallback;
			return (
				<div className="min-h-screen flex items-center justify-center p-8">
					<div className="max-w-md w-full rounded-xl border border-border bg-card p-8 shadow-sm">
						<div className="flex flex-col items-center text-center">
							<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
								<AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
							</div>
							<h1 className="text-xl font-semibold text-foreground mb-2">Something went wrong</h1>
							<p className="text-sm text-muted-foreground mb-6">
								The dashboard encountered an unexpected error. You can try again or reload the page.
							</p>
							<div className="flex gap-3 mb-6">
								<button
									type="button"
									onClick={this.handleReset}
									className={cn(
										"inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
										"bg-accent text-accent-foreground hover:bg-accent/90",
										"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										"transition-colors",
									)}
								>
									<RefreshCw className="h-4 w-4" aria-hidden="true" />
									Try again
								</button>
								<button
									type="button"
									onClick={() => window.location.reload()}
									className={cn(
										"inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
										"border border-border text-foreground hover:bg-muted",
										"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										"transition-colors",
									)}
								>
									Reload page
								</button>
							</div>
							{this.state.error && <TechnicalDetails error={this.state.error} />}
						</div>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}
