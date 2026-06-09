import { Share2 } from "lucide-react";
import { useState } from "react";
import type { ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";
import { ShareManager } from "./ShareManager.tsx";

interface ShareButtonProps {
	serial: string;
	archiveId?: string;
	client: ThermoworksWebClient;
}

export function ShareButton({ serial, archiveId, client }: ShareButtonProps) {
	const [showModal, setShowModal] = useState(false);

	return (
		<>
			<button
				type="button"
				onClick={() => setShowModal(true)}
				aria-label={`Share ${archiveId ? "archive" : "device"}`}
				title="Share"
				className={cn(
					"rounded-md p-1 hover:bg-muted",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					"transition-colors text-muted-foreground hover:text-foreground",
				)}
			>
				<Share2 className="h-3.5 w-3.5" />
			</button>
			{showModal && (
				<ShareManager
					serial={serial}
					archiveId={archiveId}
					client={client}
					onClose={() => setShowModal(false)}
				/>
			)}
		</>
	);
}
