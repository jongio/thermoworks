import { useState } from "react";
import { AppLayout } from "./components/AppLayout.tsx";
import { LandingPage } from "./components/LandingPage.tsx";
import { LoginForm } from "./components/LoginForm.tsx";
import { TemperatureUnitProvider } from "./context/TemperatureUnitContext.tsx";
import { ThermoworksWebClient } from "./lib/api.ts";

// Try to restore session from sessionStorage on app load
function createRestoredClient(): ThermoworksWebClient | null {
	const client = new ThermoworksWebClient();
	return client.isAuthenticated ? client : null;
}

export function App() {
	const [client, setClient] = useState<ThermoworksWebClient | null>(createRestoredClient);
	const [showLogin, setShowLogin] = useState(false);

	function handleLogout() {
		client?.logout();
		setClient(null);
		setShowLogin(false);
	}

	if (!client) {
		if (showLogin) {
			return <LoginForm onLogin={setClient} onBack={() => setShowLogin(false)} />;
		}
		return <LandingPage onSignIn={() => setShowLogin(true)} />;
	}

	return (
		<TemperatureUnitProvider>
			<AppLayout client={client} onLogout={handleLogout} />
		</TemperatureUnitProvider>
	);
}
