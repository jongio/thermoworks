import {
	BarChart3,
	BellRing,
	Bot,
	Code,
	ExternalLink,
	Flame,
	FlaskConical,
	Globe,
	Lock,
	type LucideIcon,
	Package,
	RefreshCw,
	Terminal,
	Wrench,
} from "lucide-react";
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
	badge?: string;
}[] = [
	{
		icon: Flame,
		title: "Copilot App Canvas",
		description:
			"Monitor live cooks inside the GitHub Copilot app — fire dashboard, interactive graphs, and an AI pit master grounded in your temps. See the highlight above.",
		command: "install thermoworks canvas jongio/thermoworks",
		link: "https://github.com/jongio/thermoworks/tree/main/.github/extensions/thermoworks",
		linkLabel: "Canvas on GitHub",
		badge: "New",
	},
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
		title: "CLI",
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
	{
		icon: FlaskConical,
		title: "Agent Skills & Evals",
		description:
			"Two GitHub Copilot agent skills (integration + contributor) with a full Vally evaluation framework - 12 stimuli across 2 specs with CI integration.",
		command: null,
		link: "https://github.com/jongio/thermoworks/tree/main/.github/skills",
		linkLabel: "Skills on GitHub",
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
	const base = import.meta.env.BASE_URL;
	return (
		<div className="min-h-screen">
			{/* Hero */}
			<section className="border-b border-border px-4 py-20 text-center">
				<h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
					<span className="mr-2" aria-hidden="true">
						🔥
					</span>
					ThermoWorks Tools
				</h1>
				<p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
					See live temperatures from your ThermoWorks Cloud devices in the GitHub Copilot app, the
					terminal, VS Code, or a real-time web dashboard - with color-coded alarm alerts and
					firmware update notifications.
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
						<svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
						</svg>
						GitHub
					</a>
				</div>
			</section>

			{/* Featured: Copilot App Canvas */}
			<section className="border-b border-border bg-gradient-to-b from-primary/5 to-transparent px-4 py-16">
				<div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
					<div>
						<span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
							<Flame className="h-3.5 w-3.5" />
							New · GitHub Copilot app
						</span>
						<h2 className="mt-4 text-3xl font-bold tracking-tight">ThermoWorks Canvas</h2>
						<p className="mt-3 text-muted-foreground">
							Monitor your live cooks right inside the GitHub Copilot app. An animated fire-vibe
							dashboard with real-time probe temps, interactive temperature graphs, time-to-done
							estimates, high/low alarms, and an AI <strong>pit master</strong> you can chat with.
							Pick any of your devices/sessions to watch — or explore the built-in cook simulator
							with zero setup.
						</p>
						<p className="mt-4 text-sm font-medium">Install in the Copilot app — just say:</p>
						<code className="mt-2 block rounded-md border border-border bg-card px-3 py-2 text-sm font-mono text-primary">
							install thermoworks canvas jongio/thermoworks
						</code>
						<div className="mt-5 flex flex-wrap gap-3">
							<a
								href="https://github.com/jongio/thermoworks/tree/main/.github/extensions/thermoworks"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
							>
								Canvas on GitHub
								<ExternalLink className="h-3 w-3" />
							</a>
							<a
								href="https://github.com/jongio/skills/tree/main/skills/create-canvas-app"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
							>
								Built with create-canvas-app
								<ExternalLink className="h-3 w-3" />
							</a>
						</div>
					</div>
					<div className="grid gap-4">
						<img
							src={`${base}images/canvas-brisket.png`}
							alt="ThermoWorks canvas live cook dashboard with two probes, fire-vibe header, gauges, and a multi-line temperature graph"
							className="rounded-lg border border-border shadow-lg"
							width={1025}
							height={1173}
							loading="lazy"
						/>
						<img
							src={`${base}images/canvas-graph.png`}
							alt="Interactive temperature history graph with target lines, stall band, and a hover tooltip"
							className="rounded-lg border border-border"
							width={1019}
							height={461}
							loading="lazy"
						/>
					</div>
				</div>
			</section>

			{/* Highlight: Ask the Pit Master */}
			<section className="border-b border-border px-4 py-16">
				<div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
					<img
						src={`${base}images/canvas-chat.png`}
						alt="Ask the Pit Master — an AI BBQ expert chat grounded in your live cook temperatures"
						className="order-2 rounded-lg border border-border shadow-lg lg:order-1"
						width={1022}
						height={560}
						loading="lazy"
					/>
					<div className="order-1 lg:order-2">
						<span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
							<Bot className="h-3.5 w-3.5" />
							Novel
						</span>
						<h2 className="mt-4 text-3xl font-bold tracking-tight">Ask the Pit Master</h2>
						<p className="mt-3 text-muted-foreground">
							The canvas ships with <strong>Smokey</strong>, an AI pit master you can chat with
							right next to your cook. Every answer is{" "}
							<strong>grounded in your live cook data</strong> — the real pit and probe temps, rate
							of change, target gaps, and time-to-done estimates on screen — so the advice is
							specific to <em>this</em> cook.
						</p>
						<ul className="mt-5 space-y-3 text-sm">
							<li className="flex gap-3">
								<BarChart3 className="h-5 w-5 shrink-0 text-primary" />
								<span>
									<strong>Grounded, not generic.</strong> Smokey cites your real numbers — the
									stall, when to wrap, doneness, food safety, timing.
								</span>
							</li>
							<li className="flex gap-3">
								<Lock className="h-5 w-5 shrink-0 text-primary" />
								<span>
									<strong>No API keys.</strong> Uses the GitHub Copilot app's own model — nothing to
									configure, no separate account.
								</span>
							</li>
							<li className="flex gap-3">
								<Bot className="h-5 w-5 shrink-0 text-primary" />
								<span>
									<strong>Shared with the agent.</strong> The same chat is driven by you and by the
									Copilot agent, over the same live state.
								</span>
							</li>
						</ul>
					</div>
				</div>
			</section>

			{/* Products */}
			<section className="border-b border-border px-4 py-16">
				<div className="mx-auto max-w-5xl">
					<h2 className="text-center text-2xl font-semibold tracking-tight">Products</h2>
					<div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{products.map((product) => (
							<div key={product.title} className="rounded-lg border border-border bg-card p-5">
								<div className="flex items-center justify-between">
									<product.icon className="h-6 w-6 text-primary" />
									{product.badge && (
										<span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
											{product.badge}
										</span>
									)}
								</div>
								<h3 className="mt-2 font-semibold">{product.title}</h3>
								<p className="mt-1 text-sm text-muted-foreground">{product.description}</p>
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
					<h2 className="text-center text-2xl font-semibold tracking-tight">Features</h2>
					<div className="mt-10 grid gap-6 sm:grid-cols-2">
						{features.map((feature) => (
							<div key={feature.title} className="flex gap-4">
								<feature.icon className="h-6 w-6 shrink-0 text-primary" />
								<div>
									<h3 className="font-semibold">{feature.title}</h3>
									<p className="mt-1 text-sm text-muted-foreground">{feature.description}</p>
								</div>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Quick Start */}
			<section className="border-b border-border px-4 py-16">
				<div className="mx-auto max-w-3xl">
					<h2 className="text-center text-2xl font-semibold tracking-tight">Quick Start</h2>
					<div className="mt-8 overflow-hidden rounded-lg border border-border bg-card">
						<div className="flex items-center gap-2 border-b border-border px-4 py-2">
							<Terminal className="h-4 w-4 text-muted-foreground" />
							<span className="text-xs text-muted-foreground">Terminal</span>
						</div>
						<pre className="overflow-x-auto p-4 text-sm leading-relaxed">
							<code>
								<span className="text-muted-foreground"># Sign in to ThermoWorks Cloud</span>
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
