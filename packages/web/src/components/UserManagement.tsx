import { Loader2, Mail, ShieldCheck, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AccountInvite, User } from "thermoworks-sdk";
import type { ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";

interface UserManagementProps {
	client: ThermoworksWebClient;
}

function isAdmin(user: User): boolean {
	return user.accountRoles?.admin === true;
}

function formatDate(value: string | undefined): string {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function statusLabel(status: string | undefined): string {
	if (!status) return "Pending";
	return status.charAt(0).toUpperCase() + status.slice(1);
}

export function UserManagement({ client }: UserManagementProps) {
	const [user, setUser] = useState<User | null>(null);
	const [invites, setInvites] = useState<AccountInvite[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [removingId, setRemovingId] = useState<string | null>(null);
	const [confirmId, setConfirmId] = useState<string | null>(null);
	const [removeError, setRemoveError] = useState<string | null>(null);

	const fetchData = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const [userData, inviteData] = await Promise.all([client.getUser(), client.getInvites()]);
			setUser(userData);
			setInvites(inviteData);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load user data");
		} finally {
			setIsLoading(false);
		}
	}, [client]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	const handleRemove = useCallback(
		async (userId: string) => {
			setRemovingId(userId);
			setRemoveError(null);
			try {
				const result = await client.removeUser(userId);
				if (!result.success) {
					setRemoveError("Failed to remove user");
					return;
				}
				setInvites((prev) => prev.filter((i) => i.id !== userId));
				setConfirmId(null);
			} catch (err) {
				setRemoveError(err instanceof Error ? err.message : "Failed to remove user");
			} finally {
				setRemovingId(null);
			}
		},
		[client],
	);

	if (isLoading) {
		return (
			<div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
				<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
				Loading user data...
			</div>
		);
	}

	if (error) {
		return (
			<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4" role="alert">
				<p className="text-sm text-destructive">{error}</p>
				<button
					type="button"
					onClick={fetchData}
					className="mt-2 text-sm font-medium text-destructive underline hover:no-underline"
				>
					Retry
				</button>
			</div>
		);
	}

	if (!user || !isAdmin(user)) {
		return (
			<div className="rounded-md border border-border bg-muted/50 p-4">
				<div className="flex items-center gap-2">
					<ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
					<p className="text-sm text-muted-foreground">
						Contact your account admin to manage users.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
				<Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
				<h2 className="text-sm font-semibold">Account Users</h2>
			</div>

			{invites.length === 0 ? (
				<p className="text-sm text-muted-foreground">No pending invites.</p>
			) : (
				<div className="divide-y divide-border rounded-md border border-border">
					{invites.map((invite) => (
						<div key={invite.id} className="flex items-center justify-between gap-4 px-4 py-3">
							<div className="flex items-center gap-3 min-w-0">
								<Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
								<div className="min-w-0">
									<p className="text-sm font-medium truncate">{invite.email ?? "Unknown email"}</p>
									<p className="text-xs text-muted-foreground">
										{statusLabel(invite.status)} &middot; {formatDate(invite.createdAt)}
									</p>
								</div>
							</div>

							<div className="flex items-center gap-2 shrink-0">
								{confirmId === invite.id ? (
									<>
										<button
											type="button"
											onClick={() => handleRemove(invite.id)}
											disabled={removingId === invite.id}
											className={cn(
												"inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium",
												"bg-destructive text-destructive-foreground",
												"hover:bg-destructive/90 transition-colors",
												"disabled:opacity-50 disabled:cursor-not-allowed",
												"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											)}
											aria-label={`Confirm removal of ${invite.email ?? "user"}`}
										>
											{removingId === invite.id ? (
												<Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
											) : null}
											Confirm
										</button>
										<button
											type="button"
											onClick={() => {
												setConfirmId(null);
												setRemoveError(null);
											}}
											className={cn(
												"rounded-md px-2.5 py-1 text-xs font-medium",
												"border border-border bg-background text-foreground",
												"hover:bg-muted transition-colors",
												"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											)}
										>
											Cancel
										</button>
									</>
								) : (
									<button
										type="button"
										onClick={() => {
											setConfirmId(invite.id);
											setRemoveError(null);
										}}
										className={cn(
											"inline-flex items-center gap-1 rounded-md p-1.5 text-muted-foreground",
											"hover:text-destructive hover:bg-destructive/10 transition-colors",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										)}
										aria-label={`Remove ${invite.email ?? "user"}`}
										title="Remove user"
									>
										<Trash2 className="h-4 w-4" aria-hidden="true" />
									</button>
								)}
							</div>
						</div>
					))}
				</div>
			)}

			{removeError ? (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-3" role="alert">
					<p className="text-xs text-destructive">{removeError}</p>
				</div>
			) : null}
		</div>
	);
}
