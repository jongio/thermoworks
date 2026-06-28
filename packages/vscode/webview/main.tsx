import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
	appendLivePoint,
	type ChartInbound,
	type ChartPayload,
	type ChartRow,
	seriesToRows,
} from "../src/chart-protocol";
import { Chart } from "./Chart";
import "./styles.css";

interface VsCodeApi {
	postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

function App() {
	const [payload, setPayload] = useState<ChartPayload | null>(null);
	const [liveRows, setLiveRows] = useState<ChartRow[] | null>(null);
	const [streaming, setStreaming] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		function onMessage(event: MessageEvent<ChartInbound>) {
			const msg = event.data;
			switch (msg.type) {
				case "chart-data":
					setPayload(msg.payload);
					setLiveRows(seriesToRows(msg.payload.series));
					setError(null);
					break;
				case "live-point":
					setLiveRows((rows) => appendLivePoint(rows ?? [], msg.seriesId, msg.point));
					break;
				case "live-status":
					setStreaming(msg.streaming);
					break;
				case "error":
					setError(msg.message);
					break;
			}
		}

		window.addEventListener("message", onMessage);
		vscode.postMessage({ type: "ready" });
		return () => window.removeEventListener("message", onMessage);
	}, []);

	if (error) {
		return <div className="tw-message error">{error}</div>;
	}

	if (!payload) {
		return <div className="tw-message">Loading temperature data…</div>;
	}

	const pointCount = liveRows?.length ?? 0;
	const sourceLabel = payload.source === "history" ? "Full session" : "Recent archive";

	return (
		<>
			<div className="tw-header">
				<span className="tw-title">{payload.deviceLabel}</span>
				{streaming && (
					<span className="tw-badge live">
						<span className="tw-dot" />
						Live
					</span>
				)}
				<span className="tw-meta">
					{sourceLabel} · {pointCount} pts
				</span>
			</div>
			<Chart
				series={payload.series}
				liveRows={liveRows}
				thresholds={payload.thresholds}
				units={payload.units}
			/>
		</>
	);
}

const container = document.getElementById("root");
if (container) {
	createRoot(container).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
}
