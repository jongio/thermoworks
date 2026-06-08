import { Settings as SettingsIcon } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../components/AppLayout.tsx";
import { UserManagement } from "../components/UserManagement.tsx";

export function Settings() {
	const { client } = useOutletContext<AppOutletContext>();

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
				<SettingsIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
				<h1 className="text-lg font-semibold tracking-tight">Settings</h1>
			</div>

			<section aria-labelledby="users-heading">
				<h2 id="users-heading" className="sr-only">
					User Management
				</h2>
				<UserManagement client={client} />
			</section>
		</div>
	);
}
