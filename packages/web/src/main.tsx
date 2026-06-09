import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import { App } from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import "./index.css";
import { Dashboard } from "./pages/Dashboard.tsx";
import { DeviceDetail } from "./pages/DeviceDetail.tsx";
import { Devices } from "./pages/Devices.tsx";
import { Events } from "./pages/Events.tsx";
import { Guide } from "./pages/Guide.tsx";
import { Settings } from "./pages/Settings.tsx";
import { SharedArchiveView } from "./pages/SharedArchiveView.tsx";
import { SharedDeviceView } from "./pages/SharedDeviceView.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
	<StrictMode>
		<ErrorBoundary>
			<HashRouter>
				<Routes>
					<Route path="/share/device/:serial" element={<SharedDeviceView />} />
					<Route path="/share/archive/:serial/:archiveId" element={<SharedArchiveView />} />
					<Route element={<App />}>
						<Route index element={<Dashboard />} />
						<Route path="devices" element={<Devices />} />
						<Route path="device/:serial" element={<DeviceDetail />} />
						<Route path="events" element={<Events />} />
						<Route path="guide" element={<Guide />} />
						<Route path="settings" element={<Settings />} />
					</Route>
				</Routes>
			</HashRouter>
		</ErrorBoundary>
	</StrictMode>,
);

// Register service worker for PWA offline support.
if ("serviceWorker" in navigator) {
	navigator.serviceWorker.register("./sw.js").catch(() => {
		// SW registration failed — app still works without it.
	});
}
