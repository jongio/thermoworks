import { useState } from "react";
import { AppLayout } from "./components/AppLayout.tsx";
import { LandingPage } from "./components/LandingPage.tsx";
import { LoginForm } from "./components/LoginForm.tsx";
import { OnboardingWizard, shouldShowOnboarding } from "./components/OnboardingWizard.tsx";
import { TemperatureUnitProvider } from "./context/TemperatureUnitContext.tsx";
import { ThermoworksWebClient } from "./lib/api.ts";

// Try to restore session from sessionStorage on app load
function createRestoredClient(): ThermoworksWebClient | null {
	const client = new ThermoworksWebClient();
	return client.isAuthenticated ? client : null;
}

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
		</TemperatureUnitProvider>
	);
}
