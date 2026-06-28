import { Outlet } from "react-router-dom";
import type { StoredAccount } from "../hooks/useAccounts.ts";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts.ts";
import type { StoredAccount } from "../hooks/useAccounts.ts";
import type { ThermoworksWebClient } from "../lib/api.ts";
import { BottomNav } from "./BottomNav.tsx";
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp.tsx";
import { OfflineBanner } from "./OfflineBanner.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { Toaster } from "./Toast.tsx";

export interface AppOutletContext {
	client: ThermoworksWebClient;
}

interface AppLayoutProps {
	client: ThermoworksWebClient;
	onLogout: () => void;
	accounts: StoredAccount[];
	activeAccountId: string | null;
	onSwitchAccount: (id: string) => void;
	onAddAccount: () => void;
	onRemoveAccount: (id: string) => void;
	onSignOutAll: () => void;
}

export function AppLayout({
	client,
	onLogout,
	accounts,
	activeAccountId,
	onSwitchAccount,
	onAddAccount,
	onRemoveAccount,
	onSignOutAll,
}: AppLayoutProps) {
	const context: AppOutletContext = { client };
	const { shortcuts, showHelp, setShowHelp } = useKeyboardShortcuts();

	return (
		<div className="flex h-screen overflow-hidden">
			<Sidebar
				onLogout={onLogout}
				accounts={accounts}
				activeAccountId={activeAccountId}
				onSwitchAccount={onSwitchAccount}
				onAddAccount={onAddAccount}
				onRemoveAccount={onRemoveAccount}
				onSignOutAll={onSignOutAll}
			/>

			<main className="flex-1 overflow-y-auto pb-20 md:pb-0">
				<div className="mx-auto max-w-7xl px-4 py-6">
					<OfflineBanner />
					<Outlet context={context} />
				</div>
			</main>

			<BottomNav />
			<Toaster />
			{showHelp && (
				<KeyboardShortcutsHelp shortcuts={shortcuts} onClose={() => setShowHelp(false)} />
			)}
		</div>
	);
}
