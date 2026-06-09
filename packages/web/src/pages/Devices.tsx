import { ThermometerSun } from "lucide-react";

export function Devices() {
	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
				<ThermometerSun className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
				<h1 className="text-lg font-semibold tracking-tight">Devices</h1>
			</div>
			<p className="text-sm text-muted-foreground">
				Detailed device management is coming in a future update. Use the Dashboard for live
				readings.
			</p>
		</div>
	);
}
