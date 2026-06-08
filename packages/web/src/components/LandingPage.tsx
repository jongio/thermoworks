import {
	BarChart3,
	BellRing,
	Bot,
	Code,
	ExternalLink,
	Github,
	Globe,
	Lock,
	Package,
	RefreshCw,
	Terminal,
	Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/utils.ts";

interface LandingPageProps {
	onSignIn: () => void;
}

const products: {
	icon: LucideIcon;
	title: string;
	description: string;
	command: string | null;
	link: string;
	linkLabel: string;
}[] = [
	{
		icon: Code,
		title: "VS Code Extension",
		description:
			"Full sidebar device panel + status bar integration. See devices, channels, battery, firmware status, and alarm states in your editor.",
		command: null,
		link: "https://marketplace.visualstudio.com/items?itemName=jongio.thermoworks",
		linkLabel: "Marketplace",
	},
	{
		icon: Terminal,
		title: "CLI + Statusline",
		description:
			"Live temperatures in your terminal footer while you code. Interactive wizard to pick devices and channels. 14 commands for monitoring, alarms, sessions, and data export.",
		command: "npx thermoworks",
		link: "https://www.npmjs.com/package/thermoworks",
		linkLabel: "npm: thermoworks",
	},
	{
		icon: Globe,
		title: "Web Dashboard",
		description:
			"Real-time temperature dashboard with history graphs, alarm color coding, light/dark theme, and public share viewer - all in the browser.",
		command: null,
		link: "https://jongio.github.io/thermoworks/",
		linkLabel: "Open Dashboard",
	},
	{
		icon: Wrench,
		title: "SDK",
		description:
			"Node.js SDK for programmatic access - build your own dashboards, alerts, or automations with full access to devices, channels, events, and archives.",
		command: "npm install thermoworks-sdk",
		link: "https://www.npmjs.com/package/thermoworks-sdk",
		linkLabel: "npm: thermoworks-sdk",
	},
	{
		icon: Bot,
		title: "MCP Server",
		description:
			"Model Context Protocol server that exposes your ThermoWorks device data to AI assistants like GitHub Copilot, Claude, and ChatGPT.",
		command: "npx thermoworks mcp start",
		link: "https://www.npmjs.com/package/thermoworks",
		linkLabel: "npm: thermoworks",
	},
];

const features: { icon: LucideIcon; title: string; description: string }[] = [
	{
		icon: BellRing,
		title: "Temperature Alerts",
		description:
			"Instant visual alarms when temperatures cross thresholds - red for too high, blue for too low.",
	},
	{
		icon: RefreshCw,
		title: "Firmware Updates",
		description:
			"Automatically detects outdated device firmware by comparing against the latest version from ThermoWorks Cloud.",
	},
	{
		icon: Lock,
		title: "Secure Credentials",
		description:
			"Credentials stored in the OS keychain. Sign in once - CLI and VS Code share access. Env vars supported for headless environments.",
	},
	{
		icon: BarChart3,
		title: "Per-Channel Selection",
		description:
			"Pick averages or individual channels for multi-probe devices like the Signals 4-channel or Smoke 2-channel.",
	},
];

export function LandingPage({ onSignIn }: LandingPageProps) {
	return (
		<div className="min-h-screen">
			{/* Hero */}
			<section className="border-b border-border px-4 py-20 text-center">
				<h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
					<span className="mr-2">🔥</span>
					ThermoWorks Tools
				</h1>
				<p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
					See live temperatures from your ThermoWorks Cloud devices in the
					terminal, VS Code, or a real-time web dashboard - with color-coded
					alarm alerts and firmware update notifications.
				</p>
				<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
					<button
						type="button"
						onClick={onSignIn}
						className={cn(
							"inline-flex h-11 items-center justify-center rounded-md px-6",
							"bg-primary text-sm font-medium text-primary-foreground",
							"hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
					>
						Sign In to Dashboard
					</button>
					<a
						href="https://github.com/jongio/thermoworks"
						target="_blank"
						rel="noopener noreferrer"
						className={cn(
							"inline-flex h-11 items-center gap-2 rounded-md border border-border px-6",
							"text-sm font-medium hover:bg-muted",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
					>
						<Github className="h-4 w-4" />
						GitHub
					</a>
				</div>
			</section>

			{/* Products */}
			<section className="border-b border-border px-4 py-16">
				<div className="mx-auto max-w-5xl">
					<h2 className="text-center text-2xl font-semibold tracking-tight">
						Products
					</h2>
					<div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{products.map((product) => (
							<div
								key={product.title}
								className="rounded-lg border border-border bg-card p-5"
							>
								<product.icon className="h-6 w-6 text-primary" />
								<h3 className="mt-2 font-semibold">{product.title}</h3>
								<p className="mt-1 text-sm text-muted-foreground">
									{product.description}
								</p>
									{product.command && (
										<code className="mt-2 block rounded bg-muted px-2 py-1 text-xs font-mono">
											{product.command}
										</code>
									)}
									{product.link && (
										<a
											href={product.link}
											target="_blank"
											rel="noopener noreferrer"
											className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
										>
											{product.linkLabel}
											<ExternalLink className="h-3 w-3" />
										</a>
									)}
								</div>
							))}
					</div>
				</div>
			</section>

			{/* Features */}
			<section className="border-b border-border px-4 py-16">
				<div className="mx-auto max-w-5xl">
					<h2 className="text-center text-2xl font-semibold tracking-tight">
						Features
					</h2>
					<div className="mt-10 grid gap-6 sm:grid-cols-2">
						{features.map((feature) => (
							<div key={feature.title} className="flex gap-4">
								<feature.icon className="h-6 w-6 shrink-0 text-primary" />
								<div>
									<h3 className="font-semibold">{feature.title}</h3>
									<p className="mt-1 text-sm text-muted-foreground">
										{feature.description}
									</p>
								</div>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Quick Start */}
			<section className="border-b border-border px-4 py-16">
				<div className="mx-auto max-w-3xl">
					<h2 className="text-center text-2xl font-semibold tracking-tight">
						Quick Start
					</h2>
					<div className="mt-8 overflow-hidden rounded-lg border border-border bg-card">
						<div className="flex items-center gap-2 border-b border-border px-4 py-2">
							<Terminal className="h-4 w-4 text-muted-foreground" />
							<span className="text-xs text-muted-foreground">Terminal</span>
						</div>
						<pre className="overflow-x-auto p-4 text-sm leading-relaxed">
							<code>
								<span className="text-muted-foreground">
									# Sign in to ThermoWorks Cloud
								</span>
								{"\n"}npx thermoworks auth login{"\n\n"}
								<span className="text-muted-foreground">
									# List your devices with channel readings
								</span>
								{"\n"}npx thermoworks devices{"\n\n"}
								<span className="text-muted-foreground">
									# Watch temperatures live (auto-refresh)
								</span>
								{"\n"}npx thermoworks watch{"\n\n"}
								<span className="text-muted-foreground">
									# Run the Copilot statusline setup wizard
								</span>
								{"\n"}npx thermoworks copilot setup
							</code>
						</pre>
					</div>
					<div className="mt-6 flex flex-wrap items-center justify-center gap-4">
						<a
							href="https://www.npmjs.com/package/thermoworks"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
						>
							<Package className="h-4 w-4" />
							npm: thermoworks
						</a>
						<a
							href="https://www.npmjs.com/package/thermoworks-sdk"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
						>
							<Package className="h-4 w-4" />
							npm: thermoworks-sdk
						</a>
						<a
							href="https://marketplace.visualstudio.com/items?itemName=jongio.thermoworks"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
						>
							<ExternalLink className="h-4 w-4" />
							VS Code Marketplace
						</a>
					</div>
				</div>
			</section>

			{/* Footer */}
			<footer className="px-4 py-8 text-center text-xs text-muted-foreground">
				<p>
					MIT License.{" "}
					<a
						href="https://github.com/jongio/thermoworks"
						target="_blank"
						rel="noopener noreferrer"
						className="hover:underline"
					>
						Source on GitHub
					</a>
				</p>
				<p className="mt-2">
					Not affiliated with, endorsed by, or connected to{" "}
					<a
						href="https://www.thermoworks.com/"
						target="_blank"
						rel="noopener noreferrer"
						className="hover:underline"
					>
						ThermoWorks
					</a>
					. Unofficial, community-built tool for personal use.
				</p>
			</footer>
		</div>
	);
}
