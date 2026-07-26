import { Settings as SettingsIcon } from "lucide-react";
import { useOutletContext } from "react-router";
import { AccountPanel } from "../components/AccountPanel.tsx";
import type { AppOutletContext } from "../components/AppLayout.tsx";
import { NotificationPrefs } from "../components/NotificationPrefs.tsx";
import { UserManagement } from "../components/UserManagement.tsx";
import { useTemperatureUnit } from "../hooks/useTemperatureUnit.ts";

export function Settings() {
	const { client } = useOutletContext<AppOutletContext>();
	const { unit, toggleUnit } = useTemperatureUnit();

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
				<SettingsIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
				<h1 className="text-lg font-semibold tracking-tight">Settings</h1>
			</div>

			<AccountPanel client={client} />

			{/* Temperature Unit */}
			<section className="rounded-lg border border-border bg-card p-4">
				<h2 className="text-sm font-medium mb-3">Temperature Unit</h2>
				<div className="flex items-center gap-3">
					<button
						type="button"
						onClick={() => {
							if (unit !== "F") toggleUnit();
						}}
						className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${unit === "F" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80"}`}
						aria-pressed={unit === "F"}
					>
						°F Fahrenheit
					</button>
					<button
						type="button"
						onClick={() => {
							if (unit !== "C") toggleUnit();
						}}
						className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${unit === "C" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80"}`}
						aria-pressed={unit === "C"}
					>
						°C Celsius
					</button>
				</div>
				<p className="mt-2 text-xs text-muted-foreground">
					All temperatures across the dashboard will display in your selected unit.
				</p>
			</section>

			<NotificationPrefs client={client} />

			<UserManagement client={client} />
		</div>
	);
}
