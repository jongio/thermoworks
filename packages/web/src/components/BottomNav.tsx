import { NavLink } from "react-router";
import { navigationItems } from "../lib/navigation.ts";
import { cn } from "../lib/utils.ts";

export function BottomNav() {
	return (
		<nav
			className="fixed inset-x-0 bottom-0 z-20 flex md:hidden border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
			aria-label="Mobile navigation"
		>
			{navigationItems.map((item) => (
				<NavLink
					key={item.path}
					to={item.path}
					end={item.path === "/"}
					className={({ isActive }) =>
						cn(
							"relative flex flex-1 flex-col items-center gap-0.5 py-3 text-xs font-medium",
							"min-h-[44px] touch-manipulation",
							"transition-colors duration-150",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
							isActive ? "text-foreground" : "text-muted-foreground",
						)
					}
					aria-label={item.label}
				>
					{({ isActive }) => (
						<>
							{/* Active indicator bar */}
							{isActive && (
								<span
									className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-foreground"
									aria-hidden="true"
								/>
							)}
							<span className="relative">
								<item.icon className="h-5 w-5" aria-hidden="true" />
								{item.badge != null && item.badge > 0 && (
									<span
										className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
										role="status"
										aria-label={`${item.badge} notifications`}
									>
										{item.badge}
									</span>
								)}
							</span>
							<span>{item.label}</span>
						</>
					)}
				</NavLink>
			))}
		</nav>
	);
}
