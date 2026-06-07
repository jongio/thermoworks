import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { App } from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import "./index.css";
import { SharedArchiveView } from "./pages/SharedArchiveView.tsx";
import { SharedDeviceView } from "./pages/SharedDeviceView.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
	<StrictMode>
		<ErrorBoundary>
			<BrowserRouter>
				<Routes>
					<Route path="/" element={<App />} />
					<Route path="/share/device/:serial" element={<SharedDeviceView />} />
					<Route path="/share/archive/:serial/:archiveId" element={<SharedArchiveView />} />
				</Routes>
			</BrowserRouter>
		</ErrorBoundary>
	</StrictMode>,
);
