import { LogOut } from "lucide-react";
import { useState } from "react";
import { DeviceList } from "./components/DeviceList.tsx";
import { LoginForm } from "./components/LoginForm.tsx";
import { ThemeToggle } from "./components/ThemeToggle.tsx";
import { useDevices } from "./hooks/useDevices.ts";
import type { ThermoworksWebClient } from "./lib/api.ts";
import { cn } from "./lib/utils.ts";

export function App() {
	const [client, setClient] = useState<ThermoworksWebClient | null>(null);
	const { data, isLoading, error, lastUpdated, refresh } = useDevices(client);

	function handleLogout() {
		client?.logout();
		setClient(null);
	}

	if (!client) {
		return <LoginForm onLogin={setClient} />;
	}

	return (
		<div className="min-h-screen">
			{/* Header */}
			<header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
					<h1 className="text-lg font-semibold tracking-tight">
						<span className="mr-1.5">🔥</span>
						ThermoWorks
					</h1>
					<div className="flex items-center gap-2">
						<ThemeToggle />
						<button
							type="button"
							onClick={handleLogout}
							title="Sign out"
							className={cn(
								"inline-flex h-9 w-9 items-center justify-center rounded-md",
								"border border-border hover:bg-muted",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							)}
						>
							<LogOut className="h-4 w-4" />
						</button>
					</div>
				</div>
			</header>

			{/* Main content */}
			<main className="mx-auto max-w-7xl px-4 py-6">
				<DeviceList
					data={data}
					isLoading={isLoading}
					error={error}
					lastUpdated={lastUpdated}
					onRefresh={refresh}
					client={client}
				/>
			</main>
		</div>
	);
}
