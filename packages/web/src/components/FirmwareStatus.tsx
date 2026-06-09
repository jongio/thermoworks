import { AlertTriangle, CheckCircle, Signal } from "lucide-react";
import type { ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";
import { useFirmwareStatus } from "../hooks/useFirmwareStatus.ts";

interface FirmwareStatusProps {
	currentVersion: string;
	deviceType: string | null;
	client: ThermoworksWebClient;
}

/**
 * Displays firmware version with update status.
 * Shows an orange warning when an update is available,
 * green check when up to date, or plain version when status is unknown.
 */
export function FirmwareStatus({ currentVersion, deviceType, client }: FirmwareStatusProps) {
	const { state, latestVersion, isLoading } = useFirmwareStatus(
		client,
		deviceType,
		currentVersion,
	);

	if (isLoading) {
		return (
			<span className="inline-flex items-center gap-1">
				<Signal className="h-3 w-3" />v{currentVersion}
			</span>
		);
	}

	if (state === "update-available" && latestVersion) {
		return (
			<span
				className={cn(
					"inline-flex items-center gap-1",
					"text-orange-600 dark:text-orange-400",
				)}
				title={`Update available: v${latestVersion}`}
				role="status"
				aria-label={`Firmware update available. Current: v${currentVersion}, latest: v${latestVersion}`}
			>
				<AlertTriangle className="h-3 w-3" />
				<span>v{currentVersion}</span>
				<span className="text-[10px] font-medium">(v{latestVersion} available)</span>
			</span>
		);
	}

	if (state === "up-to-date") {
		return (
			<span
				className={cn(
					"inline-flex items-center gap-1",
					"text-green-600 dark:text-green-400",
				)}
				title="Firmware is up to date"
				role="status"
				aria-label={`Firmware v${currentVersion} is up to date`}
			>
				<CheckCircle className="h-3 w-3" />
				<span>v{currentVersion}</span>
			</span>
		);
	}

	// Unknown state: show plain version (graceful degradation)
	return (
		<span className="inline-flex items-center gap-1">
			<Signal className="h-3 w-3" />v{currentVersion}
		</span>
	);
}
