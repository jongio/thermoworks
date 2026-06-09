import { Check, ChevronDown, LogOut, Plus, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { StoredAccount } from "../hooks/useAccounts.ts";
import { useClickOutside } from "../hooks/useClickOutside.ts";
import { cn } from "../lib/utils.ts";

interface AccountSwitcherProps {
	accounts: StoredAccount[];
	activeAccountId: string | null;
	collapsed: boolean;
	onSwitch: (id: string) => void;
	onAddAccount: () => void;
	onRemoveAccount: (id: string) => void;
	onSignOutAll: () => void;
}

/** Generates a two-letter avatar from an email address. */
function emailInitials(email: string): string {
	const local = email.split("@")[0] ?? "";
	if (local.length < 2) return local.toUpperCase() || "?";
	return ((local[0] ?? "") + (local[local.length - 1] ?? "")).toUpperCase();
}

/** Deterministic hue from a string for avatar color. */
function stringToHue(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = str.charCodeAt(i) + ((hash << 5) - hash);
	}
	return Math.abs(hash) % 360;
}

export function AccountSwitcher({
	accounts,
	activeAccountId,
	collapsed,
	onSwitch,
	onAddAccount,
	onRemoveAccount,
	onSignOutAll,
}: AccountSwitcherProps) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useClickOutside(
		containerRef,
		useCallback(() => setOpen(false), []),
	);

	const activeAccount = accounts.find((a) => a.id === activeAccountId);
	if (!activeAccount && accounts.length === 0) return null;

	const displayAccount = activeAccount ?? accounts[0];
	if (!displayAccount) return null;
	const hue = stringToHue(displayAccount.email);

	return (
		<div className="relative" ref={containerRef}>
			{/* Trigger button */}
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				className={cn(
					"flex w-full items-center gap-2 rounded-md px-2 py-1.5",
					"text-sm text-foreground hover:bg-muted/50",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					"transition-colors duration-150",
					collapsed && "justify-center px-0",
				)}
				aria-label={`Account: ${displayAccount.email}`}
				aria-expanded={open}
				aria-haspopup="true"
			>
				<span
					className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
					style={{ backgroundColor: `hsl(${hue}, 55%, 45%)` }}
					aria-hidden="true"
				>
					{emailInitials(displayAccount.email)}
				</span>
				{!collapsed && (
					<>
						<span className="flex-1 truncate text-left text-xs">{displayAccount.email}</span>
						<ChevronDown
							className={cn(
								"h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
								open && "rotate-180",
							)}
							aria-hidden="true"
						/>
					</>
				)}
			</button>

			{/* Dropdown */}
			{open && (
				<div
					className={cn(
						"absolute bottom-full left-0 z-50 mb-1 w-64",
						"rounded-lg border border-border bg-popover shadow-lg",
						"animate-in fade-in-0 zoom-in-95",
					)}
					role="menu"
					aria-label="Account switcher"
				>
					<div className="p-1">
						<p className="px-2 py-1 text-xs font-medium text-muted-foreground">Accounts</p>
						<ul className="space-y-0.5">
							{accounts.map((account) => {
								const isActive = account.id === activeAccountId;
								const accountHue = stringToHue(account.email);
								return (
									<li key={account.id}>
										<div
											className={cn(
												"group flex items-center gap-2 rounded-md px-2 py-1.5",
												"text-sm transition-colors",
												isActive
													? "bg-muted text-foreground"
													: "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
											)}
										>
											<button
												type="button"
												onClick={() => {
													if (!isActive) {
														onSwitch(account.id);
														setOpen(false);
													}
												}}
												className="flex flex-1 items-center gap-2 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
												role="menuitem"
												aria-label={
													isActive ? `${account.email} (current)` : `Switch to ${account.email}`
												}
											>
												<span
													className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
													style={{
														backgroundColor: `hsl(${accountHue}, 55%, 45%)`,
													}}
													aria-hidden="true"
												>
													{emailInitials(account.email)}
												</span>
												<span className="flex-1 truncate text-left text-xs">
													{account.displayName ?? account.email}
												</span>
												{isActive && (
													<Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
												)}
											</button>
											{/* Remove button (don't show for active account) */}
											{!isActive && (
												<button
													type="button"
													onClick={() => onRemoveAccount(account.id)}
													className={cn(
														"hidden group-hover:inline-flex",
														"h-5 w-5 items-center justify-center rounded",
														"text-muted-foreground hover:text-destructive hover:bg-destructive/10",
														"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
													)}
													aria-label={`Remove ${account.email}`}
													title="Remove account"
												>
													<X className="h-3 w-3" />
												</button>
											)}
										</div>
									</li>
								);
							})}
						</ul>
					</div>

					<div className="border-t border-border p-1">
						<button
							type="button"
							onClick={() => {
								onAddAccount();
								setOpen(false);
							}}
							className={cn(
								"flex w-full items-center gap-2 rounded-md px-2 py-1.5",
								"text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							)}
							role="menuitem"
						>
							<Plus className="h-4 w-4" aria-hidden="true" />
							<span>Add account</span>
						</button>
						<button
							type="button"
							onClick={() => {
								onSignOutAll();
								setOpen(false);
							}}
							className={cn(
								"flex w-full items-center gap-2 rounded-md px-2 py-1.5",
								"text-sm text-destructive hover:bg-destructive/10",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							)}
							role="menuitem"
						>
							<LogOut className="h-4 w-4" aria-hidden="true" />
							<span>Sign out of all accounts</span>
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
