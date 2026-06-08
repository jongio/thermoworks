import { useState } from "react";
import { AppLayout } from "./components/AppLayout.tsx";
import { LandingPage } from "./components/LandingPage.tsx";
import { LoginForm } from "./components/LoginForm.tsx";
import type { ThermoworksWebClient } from "./lib/api.ts";

export function App() {
	const [client, setClient] = useState<ThermoworksWebClient | null>(null);
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

	return <AppLayout client={client} onLogout={handleLogout} />;
}
