import { Loader2, ThermometerSun } from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../components/AppLayout.tsx";
import { useDevices } from "../hooks/useDevices.ts";
import { cn } from "../lib/utils.ts";

export function Devices() {
	const { client } = useOutletContext<AppOutletContext>();
	const { data, isLoading, error } = useDevices(client);

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
				<ThermometerSun className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
				<h1 className="text-lg font-semibold tracking-tight">Devices</h1>
			</div>

			{error && (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4" role="alert">
					<p className="text-sm text-destructive">{error}</p>
				</div>
			)}

			{isLoading && data.length === 0 && (
				<div className="flex items-center justify-center py-12">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					<span className="ml-2 text-sm text-muted-foreground">Loading devices...</span>
				</div>
			)}

			{!isLoading && data.length === 0 && !error && (
				<p className="text-sm text-muted-foreground py-8 text-center">
					No devices found. Make sure your ThermoWorks Cloud account has registered devices.
				</p>
			)}

			{data.length > 0 && (
				<div className="overflow-hidden rounded-lg border border-border">
					<table className="w-full text-sm">
						<thead className="bg-muted/50">
							<tr>
								<th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
								<th className="px-4 py-2 text-left font-medium text-muted-foreground">Serial</th>
								<th className="px-4 py-2 text-left font-medium text-muted-foreground">Type</th>
								<th className="px-4 py-2 text-left font-medium text-muted-foreground">Channels</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{data.map((item) => (
								<tr key={item.device.serial} className="hover:bg-muted/30 transition-colors">
									<td className="px-4 py-2">
										<Link
											to={`/device/${item.device.serial}`}
											className={cn(
												"font-medium text-primary hover:underline",
												"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded",
											)}
										>
											{item.device.label ?? item.device.serial}
										</Link>
									</td>
									<td className="px-4 py-2 font-mono text-xs text-muted-foreground">
										{item.device.serial}
									</td>
									<td className="px-4 py-2 text-muted-foreground">
										{item.device.type ?? item.device.device ?? "—"}
									</td>
									<td className="px-4 py-2 text-muted-foreground">{item.channels.length}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
