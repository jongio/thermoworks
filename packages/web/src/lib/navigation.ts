import type { LucideIcon } from "lucide-react";
import { Activity, BookOpen, Database, LayoutDashboard, Settings, ThermometerSun } from "lucide-react";

export interface NavItem {
	label: string;
	path: string;
	icon: LucideIcon;
	/** Optional badge count (e.g., active alarms). */
	badge?: number;
}

export const navigationItems: NavItem[] = [
	{ label: "Dashboard", path: "/", icon: LayoutDashboard },
	{ label: "Devices", path: "/devices", icon: ThermometerSun },
	{ label: "Activity", path: "/events", icon: Activity },
	{ label: "Usage", path: "/usage", icon: Database },
	{ label: "Guide", path: "/guide", icon: BookOpen },
	{ label: "Settings", path: "/settings", icon: Settings },
];