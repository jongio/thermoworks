import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import { App } from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { DeviceListSkeleton, EventListSkeleton, Skeleton } from "./components/Skeleton.tsx";
import "./index.css";

// Lazy-loaded pages for route-based code splitting
const Dashboard = lazy(() =>
	import("./pages/Dashboard.tsx").then((m) => ({ default: m.Dashboard })),
);
const DeviceDetail = lazy(() =>
	import("./pages/DeviceDetail.tsx").then((m) => ({ default: m.DeviceDetail })),
);
const Devices = lazy(() => import("./pages/Devices.tsx").then((m) => ({ default: m.Devices })));
const DataUsagePage = lazy(() =>
	import("./pages/DataUsage.tsx").then((m) => ({ default: m.DataUsage })),
);
const Events = lazy(() => import("./pages/Events.tsx").then((m) => ({ default: m.Events })));
const Guide = lazy(() => import("./pages/Guide.tsx").then((m) => ({ default: m.Guide })));
const Settings = lazy(() => import("./pages/Settings.tsx").then((m) => ({ default: m.Settings })));
const ExportSchedules = lazy(() =>
	import("./pages/ExportSchedules.tsx").then((m) => ({ default: m.ExportSchedules })),
);
const SharedArchiveView = lazy(() =>
	import("./pages/SharedArchiveView.tsx").then((m) => ({ default: m.SharedArchiveView })),
);
const SharedDeviceView = lazy(() =>
	import("./pages/SharedDeviceView.tsx").then((m) => ({ default: m.SharedDeviceView })),
);

function PageSkeleton() {
	return (
		<div className="space-y-4 p-4">
			<Skeleton className="h-8 w-48" />
			<DeviceListSkeleton count={3} />
		</div>
	);
}

function EventPageSkeleton() {
	return (
		<div className="space-y-4 p-4">
			<Skeleton className="h-8 w-48" />
			<EventListSkeleton count={5} />
		</div>
	);
}

/** Wraps a lazy page with per-route Suspense and ErrorBoundary. */
function RouteGuard({
	children,
	fallback,
}: {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}) {
	return (
		<ErrorBoundary>
			<Suspense fallback={fallback ?? <PageSkeleton />}>{children}</Suspense>
		</ErrorBoundary>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
	<StrictMode>
		<ErrorBoundary>
			<HashRouter>
				<Routes>
					<Route
						path="/share/device/:serial"
						element={
							<RouteGuard>
								<SharedDeviceView />
							</RouteGuard>
						}
					/>
					<Route
						path="/share/archive/:serial/:archiveId"
						element={
							<RouteGuard>
								<SharedArchiveView />
							</RouteGuard>
						}
					/>
					<Route element={<App />}>
						<Route
							index
							element={
								<RouteGuard>
									<Dashboard />
								</RouteGuard>
							}
						/>
						<Route
							path="devices"
							element={
								<RouteGuard>
									<Devices />
								</RouteGuard>
							}
						/>
						<Route
							path="device/:serial"
							element={
								<RouteGuard>
									<DeviceDetail />
								</RouteGuard>
							}
						/>
						<Route
							path="events"
							element={
								<RouteGuard fallback={<EventPageSkeleton />}>
									<Events />
								</RouteGuard>
							}
						/>
						<Route
							path="usage"
							element={
								<RouteGuard>
									<DataUsagePage />
								</RouteGuard>
							}
						/>
						<Route
							path="guide"
							element={
								<RouteGuard>
									<Guide />
								</RouteGuard>
							}
						/>
						<Route
							path="settings"
							element={
								<RouteGuard>
									<Settings />
								</RouteGuard>
							}
						/>
						<Route
							path="exports"
							element={
								<RouteGuard>
									<ExportSchedules />
								</RouteGuard>
							}
						/>
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
