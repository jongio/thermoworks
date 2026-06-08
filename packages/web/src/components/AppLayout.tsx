import { Outlet } from "react-router-dom";
import type { ThermoworksWebClient } from "../lib/api.ts";
import { BottomNav } from "./BottomNav.tsx";
import { Sidebar } from "./Sidebar.tsx";

export interface AppOutletContext {
	client: ThermoworksWebClient;
}

interface AppLayoutProps {
	client: ThermoworksWebClient;
	onLogout: () => void;
}

export function AppLayout({ client, onLogout }: AppLayoutProps) {
	const context: AppOutletContext = { client };

	return (
		<div className="flex h-screen overflow-hidden">
			<Sidebar onLogout={onLogout} />

			<main className="flex-1 overflow-y-auto pb-16 md:pb-0">
				<div className="mx-auto max-w-7xl px-4 py-6">
					<Outlet context={context} />
				</div>
			</main>

			<BottomNav />
		</div>
	);
}
