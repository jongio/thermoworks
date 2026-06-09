import { useState } from "react";
import { AppLayout } from "./components/AppLayout.tsx";
import { LandingPage } from "./components/LandingPage.tsx";
import { LoginForm } from "./components/LoginForm.tsx";
import { OnboardingWizard, shouldShowOnboarding } from "./components/OnboardingWizard.tsx";
import { OfflineCacheProvider } from "./context/OfflineCacheContext.tsx";
import { TemperatureUnitProvider } from "./context/TemperatureUnitContext.tsx";
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

	function handleLogin(nextClient: ThermoworksWebClient) {
		setAppState({
			client: nextClient,
			showOnboarding: shouldShowOnboarding(),
		});
		setShowLogin(false);
	}

	function handleLogout() {
		client?.logout();
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
				<AppLayout client={client} onLogout={handleLogout} />
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
