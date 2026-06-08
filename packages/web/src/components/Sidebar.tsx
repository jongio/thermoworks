import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { navigationItems } from "../lib/navigation.ts";
import { cn } from "../lib/utils.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";

const STORAGE_KEY = "thermoworks-sidebar-collapsed";

interface SidebarProps {
	onLogout: () => void;
}

export function Sidebar({ onLogout }: SidebarProps) {
	const [collapsed, setCollapsed] = useState(() => {
		try {
			return localStorage.getItem(STORAGE_KEY) === "true";
		} catch {
			return false;
		}
	});

	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, String(collapsed));
		} catch {
			// Storage unavailable — ignore.
		}
	}, [collapsed]);

	const toggle = useCallback(() => setCollapsed((prev) => !prev), []);

	return (
		<aside
			className={cn(
				"hidden md:flex flex-col border-r border-border bg-card",
				"transition-[width] duration-200 ease-in-out",
				collapsed ? "w-16" : "w-56",
			)}
			aria-label="Main navigation"
		>
			{/* Brand */}
			<div className="flex h-14 items-center border-b border-border px-3">
				<span className="text-lg" aria-hidden="true">
					🔥
				</span>
				{!collapsed && (
					<span className="ml-2 text-sm font-semibold tracking-tight truncate">
						ThermoWorks
					</span>
				)}
			</div>

			{/* Navigation */}
			<nav className="flex-1 overflow-y-auto py-2" aria-label="Sidebar">
				<ul className="space-y-1 px-2">
					{navigationItems.map((item) => (
						<li key={item.path}>
							<NavLink
								to={item.path}
								end={item.path === "/"}
								className={({ isActive }) =>
									cn(
										"flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
										"transition-colors duration-150",
										"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										isActive
											? "bg-muted text-foreground"
											: "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
										collapsed && "justify-center px-0",
									)
								}
								title={collapsed ? item.label : undefined}
								aria-label={item.label}
							>
								<item.icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
								{!collapsed && <span className="truncate">{item.label}</span>}
								{!collapsed && item.badge != null && item.badge > 0 && (
									<span
										className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-medium text-destructive-foreground"
										aria-label={`${item.badge} notifications`}
									>
										{item.badge}
									</span>
								)}
							</NavLink>
						</li>
					))}
				</ul>
			</nav>

			{/* Footer actions */}
			<div className="border-t border-border p-2 space-y-1">
				<div className={cn("flex items-center", collapsed ? "justify-center" : "px-1 gap-1")}>
					<ThemeToggle />
					<button
						type="button"
						onClick={onLogout}
						title="Sign out"
						className={cn(
							"inline-flex h-9 w-9 items-center justify-center rounded-md",
							"text-muted-foreground hover:bg-muted hover:text-foreground",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						aria-label="Sign out"
					>
						<LogOut className="h-4 w-4" />
					</button>
				</div>
				<button
					type="button"
					onClick={toggle}
					className={cn(
						"flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm",
						"text-muted-foreground hover:bg-muted/50 hover:text-foreground",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						collapsed && "justify-center px-0",
					)}
					aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
				>
					{collapsed ? (
						<ChevronsRight className="h-4 w-4" aria-hidden="true" />
					) : (
						<>
							<ChevronsLeft className="h-4 w-4" aria-hidden="true" />
							<span>Collapse</span>
						</>
					)}
				</button>
			</div>
		</aside>
	);
}
