import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
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

	render(): ReactNode {
		if (this.state.hasError) {
			if (this.props.fallback) return this.props.fallback;
			return (
				<div className="min-h-screen flex items-center justify-center p-8">
					<div className="max-w-md text-center">
						<h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
						<p className="text-[var(--color-muted)] mb-6">
							The dashboard encountered an unexpected error. Try refreshing the page.
						</p>
						<pre className="text-xs text-left bg-[var(--color-card)] p-4 rounded-lg overflow-auto mb-6 border border-[var(--color-border)]">
							{this.state.error?.message}
						</pre>
						<button
							type="button"
							onClick={() => window.location.reload()}
							className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:opacity-90"
						>
							Reload
						</button>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}
