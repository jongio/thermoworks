import { useState } from "react";
import { AuthError, ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";

interface LoginFormProps {
	onLogin: (client: ThermoworksWebClient) => void;
	onBack: () => void;
}

const isLocalhost =
	typeof window !== "undefined" &&
	(window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

export function LoginForm({ onLogin, onBack }: LoginFormProps) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!email.trim() || !password.trim()) return;

		setIsLoading(true);
		setError(null);

		try {
			const client = new ThermoworksWebClient();
			await client.login(email.trim(), password);
			onLogin(client);
		} catch (err) {
			if (err instanceof AuthError) {
				if (err.reason === "INVALID_LOGIN_CREDENTIALS" || err.reason === "EMAIL_NOT_FOUND") {
					setError("Invalid email or password.");
				} else if (err.reason === "TOO_MANY_ATTEMPTS_TRY_LATER") {
					setError("Too many attempts. Please try again later.");
				} else {
					setError("Invalid email or password.");
				}
			} else {
				setError("Login failed. Please try again.");
			}
		} finally {
			setIsLoading(false);
		}
	}

	if (!isLocalhost) {
		return (
			<div className="flex min-h-screen items-center justify-center p-4">
				<div className="w-full max-w-sm space-y-6 text-center">
					<h1 className="text-2xl font-bold tracking-tight">ThermoWorks Dashboard</h1>
					<p className="text-sm text-muted-foreground">
						Sign-in requires running the dashboard locally due to Firebase API restrictions.
					</p>
					<div className="rounded-lg border border-border bg-muted/50 p-4 text-left">
						<p className="text-xs font-medium text-muted-foreground mb-2">Run locally:</p>
						<code className="block text-sm font-mono">
							git clone https://github.com/jongio/thermoworks.git
						</code>
						<code className="block text-sm font-mono mt-1">cd thermoworks && pnpm install</code>
						<code className="block text-sm font-mono mt-1">pnpm --filter thermoworks-web dev</code>
					</div>
					<p className="text-xs text-muted-foreground">
						Then open{" "}
						<a href="http://localhost:4200" className="text-primary hover:underline">
							http://localhost:4200
						</a>
					</p>
					<button
						type="button"
						onClick={onBack}
						className="text-sm text-primary hover:underline"
					>
						← Back
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<div className="w-full max-w-sm space-y-6">
				<div className="text-center">
					<h1 className="text-2xl font-bold tracking-tight">ThermoWorks Dashboard</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Sign in with your ThermoWorks Cloud account
					</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<label htmlFor="email" className="text-sm font-medium leading-none">
							Email
						</label>
						<input
							id="email"
							type="email"
							autoComplete="email"
							required
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							disabled={isLoading}
							placeholder="you@example.com"
							className={cn(
								"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2",
								"text-sm placeholder:text-muted-foreground",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								"disabled:cursor-not-allowed disabled:opacity-50",
							)}
						/>
					</div>

					<div className="space-y-2">
						<label htmlFor="password" className="text-sm font-medium leading-none">
							Password
						</label>
						<input
							id="password"
							type="password"
							autoComplete="current-password"
							required
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							disabled={isLoading}
							className={cn(
								"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2",
								"text-sm placeholder:text-muted-foreground",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								"disabled:cursor-not-allowed disabled:opacity-50",
							)}
						/>
					</div>

					{error && (
						<p className="text-sm text-destructive" role="alert">
							{error}
						</p>
					)}

					<button
						type="submit"
						disabled={isLoading}
						className={cn(
							"inline-flex h-10 w-full items-center justify-center rounded-md",
							"bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
							"hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							"disabled:pointer-events-none disabled:opacity-50",
						)}
					>
						{isLoading ? "Signing in..." : "Sign in"}
					</button>
				</form>

				<p className="text-center text-xs text-muted-foreground">
					Credentials are stored in memory only and never persisted.
				</p>
			</div>
		</div>
	);
}
