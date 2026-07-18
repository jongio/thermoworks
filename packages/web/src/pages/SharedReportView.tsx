import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { CookReport } from "../components/CookReport.tsx";
import { ShareError, ShareHeader } from "../components/ShareLayout.tsx";
import { decodeCookReportPayload, parseCookReportSharePayload } from "../lib/cook-annotations.ts";

export function SharedReportView() {
	const [params] = useSearchParams();
	const encoded = params.get("data");
	const decoded = useMemo(() => {
		if (!encoded) return null;
		try {
			return parseCookReportSharePayload(decodeCookReportPayload(encoded));
		} catch {
			return null;
		}
	}, [encoded]);

	if (!encoded) {
		return <ShareError message="Invalid report link." />;
	}

	if (!decoded) {
		return <ShareError message="Cook report link could not be decoded." />;
	}

	return (
		<div className="min-h-screen">
			<ShareHeader />
			<main className="mx-auto max-w-4xl px-4 py-6">
				<CookReport
					archive={decoded.archive}
					readOnly
					initialAnnotations={decoded.annotations}
					initialTargetTemp={decoded.targetTemp}
					initialTargetTolerance={decoded.targetTolerance}
				/>
			</main>
		</div>
	);
}
