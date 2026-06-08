import { Activity } from "lucide-react";

export function Events() {
	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
				<Activity className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
				<h1 className="text-lg font-semibold tracking-tight">Events</h1>
			</div>
			<p className="text-sm text-muted-foreground">
				Alarm history and temperature events will appear here. This feature is coming in a
				future update.
			</p>
		</div>
	);
}
