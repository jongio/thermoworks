import { Settings as SettingsIcon } from "lucide-react";

export function Settings() {
	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
				<SettingsIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
				<h1 className="text-lg font-semibold tracking-tight">Settings</h1>
			</div>
			<p className="text-sm text-muted-foreground">
				Account preferences, notification settings, and display options will be configurable
				here in a future update.
			</p>
		</div>
	);
}
