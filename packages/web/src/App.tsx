import { useState } from "react";
import { AppLayout } from "./components/AppLayout.tsx";
import { LandingPage } from "./components/LandingPage.tsx";
import { LoginForm } from "./components/LoginForm.tsx";
import { OnboardingWizard, shouldShowOnboarding } from "./components/OnboardingWizard.tsx";
import { OfflineCacheProvider } from "./context/OfflineCacheContext.tsx";
import { TemperatureUnitProvider } from "./context/TemperatureUnitContext.tsx";
import { useAccounts } from "./hooks/useAccounts.ts";
import { ThermoworksWebClient } from "./lib/api.ts";
import { clearStaleCache } from "./lib/offline-store.ts";

// Try to restore session from sessionStorage on app load
function createRestoredClient(): ThermoworksWebClient | null {
	const client = new ThermoworksWebClient();
	return client.isAuthenticated ? client : null;
}

// Clear stale IndexedDB cache entries on app startup
clearStaleCache().catch(() => {});

function createInitialAppState() {
	const client = createRestoredClient();
	return {
		client,
		showOnboarding: client !== null && shouldShowOnboarding(),
	};
}

export function App() {
	const [{ client, showOnboarding }, setAppState] = useState(createInitialAppState);
	const [showLogin, setShowLogin] = useState(false);

	const {
		accounts,
		activeAccountId,
		addAccount,
		switchAccount,
		removeAccount,
		clearAllAccounts,
	} = useAccounts();

	function handleLogin(nextClient: ThermoworksWebClient, email: string) {
		addAccount(email, nextClient);
		setAppState({
			client: nextClient,
			showOnboarding: shouldShowOnboarding(),
		});
		setShowLogin(false);
	}

	function handleLogout() {
		client?.logout();
		// Remove only the current account; if others remain, switch to them
		if (activeAccountId && accounts.length > 1) {
			removeAccount(activeAccountId);
			// After remove, switch to the next most recently used account
			const remaining = accounts.filter((a) => a.id !== activeAccountId);
			if (remaining.length > 0) {
				const sorted = [...remaining].sort((a, b) => b.lastUsed - a.lastUsed);
				const nextClient = switchAccount(sorted[0]!.id);
				setAppState({
					client: nextClient,
					showOnboarding: false,
				});
				return;
			}
		}
		// Single account or no accounts — full logout
		clearAllAccounts();
		setAppState({
			client: null,
			showOnboarding: false,
		});
		setShowLogin(false);
	}

	function handleSwitchAccount(id: string) {
		const nextClient = switchAccount(id);
		if (nextClient) {
			setAppState({
				client: nextClient,
				showOnboarding: false,
			});
		}
	}

	function handleAddAccount() {
		setShowLogin(true);
	}

	function handleRemoveAccount(id: string) {
		if (id === activeAccountId) {
			handleLogout();
		} else {
			removeAccount(id);
		}
	}

	function handleSignOutAll() {
		client?.logout();
		clearAllAccounts();
		setAppState({
			client: null,
			showOnboarding: false,
		});
		setShowLogin(false);
	}

	if (!client) {
		if (showLogin) {
			return <LoginForm onLogin={handleLogin} onBack={() => setShowLogin(false)} />;
		}
		return <LandingPage onSignIn={() => setShowLogin(true)} />;
	}

	return (
		<TemperatureUnitProvider>
			<OfflineCacheProvider>
				<AppLayout
					client={client}
					onLogout={handleLogout}
					accounts={accounts}
					activeAccountId={activeAccountId}
					onSwitchAccount={handleSwitchAccount}
					onAddAccount={handleAddAccount}
					onRemoveAccount={handleRemoveAccount}
					onSignOutAll={handleSignOutAll}
				/>
				{showOnboarding && (
					<OnboardingWizard
						client={client}
						onComplete={() =>
							setAppState((current) => ({
								...current,
								showOnboarding: false,
							}))
						}
					/>
				)}
			</OfflineCacheProvider>
		</TemperatureUnitProvider>
	);
}
