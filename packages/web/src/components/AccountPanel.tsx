import { ExternalLink, Loader2, User as UserIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { AccountInfo, ThermoworksWebClient } from "../lib/api.ts";
import type { User } from "thermoworks-sdk";
import { cn } from "../lib/utils.ts";
import { Skeleton } from "./Skeleton.tsx";

interface AccountPanelProps {
	client: ThermoworksWebClient;
}

type LoadState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "loaded"; account: AccountInfo; user: User };

export function AccountPanel({ client }: AccountPanelProps) {
	const [state, setState] = useState<LoadState>({ status: "loading" });

	useEffect(() => {
		let cancelled = false;

		async function load() {
			try {
				const [account, user] = await Promise.all([
					client.getAccount(),
					client.getUser(),
				]);
				if (!cancelled) {
					setState({ status: "loaded", account, user });
				}
			} catch (err) {
				if (!cancelled) {
					setState({
						status: "error",
						message: err instanceof Error ? err.message : "Failed to load account",
					});
				}
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [client]);

	if (state.status === "loading") {
		return <AccountPanelSkeleton />;
	}

	if (state.status === "error") {
		return (
			<div className="rounded-lg border border-destructive/50 bg-card p-4" role="alert">
				<p className="text-sm text-destructive">{state.message}</p>
			</div>
		);
	}

	const { account, user } = state;
	const usagePercent =
		account.devicesLimit > 0
			? Math.min(100, Math.round((account.devicesUsed / account.devicesLimit) * 100))
			: 0;

	return (
		<section aria-labelledby="account-heading" className="space-y-4">
			<div className="flex items-center gap-2">
				<UserIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
				<h2 id="account-heading" className="text-lg font-semibold">
					Account
				</h2>
			</div>

			<div className="rounded-lg border border-border bg-card p-4 space-y-4">
				{/* Account details */}
				<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
					{account.name && (
						<>
							<dt className="text-muted-foreground">Name</dt>
							<dd>{account.name}</dd>
						</>
					)}
					<dt className="text-muted-foreground">Account ID</dt>
					<dd className="font-mono text-xs break-all">{account.id}</dd>
					<dt className="text-muted-foreground">Plan</dt>
					<dd>{account.plan ?? "Unknown"}</dd>
				</dl>

				{/* Device usage */}
				{account.devicesLimit > 0 && (
					<div className="space-y-1.5">
						<div className="flex items-baseline justify-between text-sm">
							<span className="text-muted-foreground">Device usage</span>
							<span className="tabular-nums">
								{account.devicesUsed} / {account.devicesLimit}
							</span>
						</div>
						<div
							className="h-2 w-full rounded-full bg-muted overflow-hidden"
							role="progressbar"
							aria-valuenow={account.devicesUsed}
							aria-valuemin={0}
							aria-valuemax={account.devicesLimit}
							aria-label={`${account.devicesUsed} of ${account.devicesLimit} devices used`}
						>
							<div
								className={cn(
									"h-full rounded-full transition-all",
									usagePercent >= 90
										? "bg-destructive"
										: usagePercent >= 70
											? "bg-orange-500"
											: "bg-primary",
								)}
								style={{ width: `${usagePercent}%` }}
							/>
						</div>
					</div>
				)}
			</div>

			{/* User info */}
			<div className="rounded-lg border border-border bg-card p-4 space-y-2">
				<h3 className="text-sm font-medium">User</h3>
				<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
					{user.email && (
						<>
							<dt className="text-muted-foreground">Email</dt>
							<dd>{user.email}</dd>
						</>
					)}
					{user.timeZone && (
						<>
							<dt className="text-muted-foreground">Timezone</dt>
							<dd>{user.timeZone}</dd>
						</>
					)}
					<dt className="text-muted-foreground">Units</dt>
					<dd>{user.preferredUnits === "C" ? "Celsius" : "Fahrenheit"}</dd>
				</dl>
			</div>

			{/* Management link */}
			<a
				href="https://cloud.thermoworks.com"
				target="_blank"
				rel="noopener noreferrer"
				className={cn(
					"inline-flex items-center gap-1.5 text-sm text-primary hover:underline",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded",
				)}
			>
				Manage account on ThermoWorks Cloud
				<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
			</a>
		</section>
	);
}

function AccountPanelSkeleton() {
	return (
		<div className="space-y-4" aria-busy="true" aria-label="Loading account information">
			<div className="flex items-center gap-2">
				<Skeleton className="h-5 w-5 rounded" />
				<Skeleton className="h-5 w-20" />
			</div>
			<div className="rounded-lg border border-border bg-card p-4 space-y-3">
				<Skeleton className="h-4 w-48" />
				<Skeleton className="h-4 w-64" />
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-2 w-full rounded-full" />
			</div>
			<div className="rounded-lg border border-border bg-card p-4 space-y-2">
				<Skeleton className="h-4 w-16" />
				<Skeleton className="h-4 w-40" />
				<Skeleton className="h-4 w-32" />
			</div>
		</div>
	);
}
