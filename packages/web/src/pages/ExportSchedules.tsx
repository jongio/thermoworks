import { useOutletContext } from "react-router";
import type { AppOutletContext } from "../components/AppLayout.tsx";
import { ExportScheduler } from "../components/ExportScheduler.tsx";

export function ExportSchedules() {
	const { client } = useOutletContext<AppOutletContext>();

	return <ExportScheduler client={client} />;
}
