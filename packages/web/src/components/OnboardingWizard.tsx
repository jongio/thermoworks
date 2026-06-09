import { Bell, List, Monitor, Thermometer } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hasStoredTemperatureUnitPreference } from "../context/TemperatureUnitContext.tsx";
import { useTemperatureUnit } from "../hooks/useTemperatureUnit.ts";
import {
	hasStoredNotificationPreference,
	setNotificationsEnabled,
} from "../hooks/useAlarmNotifications.ts";
import type { ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";

export const ONBOARDING_COMPLETE_STORAGE_KEY = "thermoworks-onboarding-complete";

type DeviceSummary = Awaited<ReturnType<ThermoworksWebClient["getDevices"]>>[number];
type NotificationStatus = NotificationPermission | "unsupported";

const FOCUSABLE_SELECTOR =
	'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface OnboardingWizardProps {
	client: ThermoworksWebClient;
	onComplete: () => void;
}

interface OnboardingStep {
	title: string;
	description: string;
	icon: typeof Thermometer;
	content: ReactNode;
}

function isOnboardingComplete(): boolean {
	try {
		return localStorage.getItem(ONBOARDING_COMPLETE_STORAGE_KEY) === "true";
	} catch {
		return false;
	}
}

export function shouldShowOnboarding(): boolean {
	if (typeof window === "undefined") return false;
	if (isOnboardingComplete()) return false;
	return !hasStoredTemperatureUnitPreference() && !hasStoredNotificationPreference();
}

function completeOnboarding(): void {
	try {
		localStorage.setItem(ONBOARDING_COMPLETE_STORAGE_KEY, "true");
	} catch {
		// Storage unavailable - ignore.
	}
}

function getNotificationStatus(): NotificationStatus {
	if (typeof Notification === "undefined") return "unsupported";
	return Notification.permission;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
		(element) =>
			!element.hasAttribute("disabled") &&
			element.getAttribute("aria-hidden") !== "true" &&
			element.tabIndex !== -1,
	);
}

function getNotificationMessage(status: NotificationStatus): string {
	switch (status) {
		case "granted":
			return "Notifications are ready. We'll alert you when alarms trigger.";
		case "denied":
			return "Notifications are blocked in this browser. You can still finish onboarding and enable them later in settings.";
		case "unsupported":
			return "This browser doesn't support notifications, but the rest of the app will work normally.";
		default:
			return "Turn on browser notifications so alarm alerts can reach you even while you multitask.";
	}
}

export function OnboardingWizard({ client, onComplete }: OnboardingWizardProps) {
	const { unit, setUnit } = useTemperatureUnit();
	const [stepIndex, setStepIndex] = useState(0);
	const [devices, setDevices] = useState<DeviceSummary[]>([]);
	const [isLoadingDevices, setIsLoadingDevices] = useState(true);
	const [deviceError, setDeviceError] = useState<string | null>(null);
	const [notificationStatus, setNotificationStatus] = useState<NotificationStatus>(getNotificationStatus);
	const [isEnablingNotifications, setIsEnablingNotifications] = useState(false);
	const dialogRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let cancelled = false;
		setIsLoadingDevices(true);
		setDeviceError(null);

		client.getDevices()
			.then((nextDevices) => {
				if (cancelled) return;
				setDevices(nextDevices);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				setDeviceError(error instanceof Error ? error.message : "Unable to load devices.");
			})
			.finally(() => {
				if (!cancelled) {
					setIsLoadingDevices(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [client]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;

		const previousActiveElement = document.activeElement instanceof HTMLElement
			? document.activeElement
			: null;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Tab") return;

			const focusable = getFocusableElements(dialog);
			if (focusable.length === 0) {
				event.preventDefault();
				dialog.focus();
				return;
			}

			const first = focusable[0];
			const last = focusable[focusable.length - 1];

			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last?.focus();
				return;
			}

			if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first?.focus();
			}
		};

		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.body.style.overflow = previousOverflow;
			previousActiveElement?.focus();
		};
	}, []);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const focusable = getFocusableElements(dialog);
		(focusable[0] ?? dialog).focus();
	}, [stepIndex]);

	const handleComplete = useCallback(() => {
		completeOnboarding();
		onComplete();
	}, [onComplete]);

	const handleNext = useCallback(() => {
		setStepIndex((current) => {
			if (current >= 3) {
				handleComplete();
				return current;
			}
			return current + 1;
		});
	}, [handleComplete]);

	const handleBack = useCallback(() => {
		setStepIndex((current) => Math.max(current - 1, 0));
	}, []);

	const handleEnableNotifications = useCallback(async () => {
		if (typeof Notification === "undefined") {
			setNotificationStatus("unsupported");
			return;
		}

		if (Notification.permission === "granted") {
			setNotificationsEnabled(true);
			setNotificationStatus("granted");
			return;
		}

		if (Notification.permission === "denied") {
			setNotificationStatus("denied");
			return;
		}

		setIsEnablingNotifications(true);
		try {
			const permission = await Notification.requestPermission();
			setNotificationStatus(permission);
			if (permission === "granted") {
				setNotificationsEnabled(true);
			}
		} finally {
			setIsEnablingNotifications(false);
		}
	}, []);

	const steps = useMemo<OnboardingStep[]>(
		() => [
			{
				title: "Choose your temperature unit",
				description: "Pick the unit you want to see throughout the app. You can change it again later.",
				icon: Thermometer,
				content: (
					<div className="grid gap-3 sm:grid-cols-2">
						<button
							type="button"
							onClick={() => setUnit("F")}
							aria-pressed={unit === "F"}
							className={cn(
								"rounded-xl border px-4 py-4 text-left transition-colors",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								unit === "F"
									? "border-ring bg-muted text-foreground"
									: "border-border bg-background hover:bg-muted/60",
							)}
						>
							<div className="text-base font-semibold">Use Fahrenheit</div>
							<p className="mt-1 text-sm text-muted-foreground">Best for classic BBQ and smoking workflows.</p>
						</button>
						<button
							type="button"
							onClick={() => setUnit("C")}
							aria-pressed={unit === "C"}
							className={cn(
								"rounded-xl border px-4 py-4 text-left transition-colors",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								unit === "C"
									? "border-ring bg-muted text-foreground"
									: "border-border bg-background hover:bg-muted/60",
							)}
						>
							<div className="text-base font-semibold">Use Celsius</div>
							<p className="mt-1 text-sm text-muted-foreground">Ideal if you prefer metric cooking and ambient temps.</p>
						</button>
					</div>
				),
			},
			{
				title: "Your devices at a glance",
				description: "Every device you own appears here. Start with the first one, then drill into details any time.",
				icon: Monitor,
				content: isLoadingDevices ? (
					<div className="rounded-xl border border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
						Loading your devices...
					</div>
				) : deviceError ? (
					<div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-6 text-sm text-destructive" role="alert">
						{deviceError}
					</div>
				) : devices.length === 0 ? (
					<div className="rounded-xl border border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
						No devices are linked yet. Once one appears, it will show up here automatically.
					</div>
				) : (
					<ul className="space-y-3" aria-label="Your devices">
						{devices.map((device, index) => {
							const name = device.label ?? device.serial;
							return (
								<li
									key={device.serial}
									className={cn(
										"rounded-xl border px-4 py-3",
										index === 0
											? "border-ring bg-muted/60 shadow-sm"
											: "border-border bg-background",
									)}
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<div className="font-semibold">{name}</div>
											<p className="mt-1 text-sm text-muted-foreground">
												{device.type ?? device.device ?? "ThermoWorks device"} · {device.serial}
											</p>
										</div>
										{index === 0 && (
											<span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background">
												First device
											</span>
										)}
									</div>
								</li>
							);
						})}
					</ul>
				),
			},
			{
				title: "Set alarms for your cook",
				description: "High and low alarms help you catch target temps fast without hovering over the dashboard.",
				icon: Bell,
				content: (
					<div className="rounded-xl border border-border bg-muted/40 px-4 py-4">
						<ul className="space-y-3 text-sm text-muted-foreground">
							<li>
								<span className="font-medium text-foreground">High alarms</span>
								{" "}
								let you know when food or ambient temps climb past your target.
							</li>
							<li>
								<span className="font-medium text-foreground">Low alarms</span>
								{" "}
								warn you when a pit cools off or a probe drops unexpectedly.
							</li>
							<li>
								Open any device to adjust alarms per channel whenever you're ready.
							</li>
						</ul>
					</div>
				),
			},
			{
				title: "Stay ahead with notifications",
				description: "Turn on browser alerts so alarm events can reach you while the app runs in the background.",
				icon: List,
				content: (
					<div className="space-y-3">
						<div className="rounded-xl border border-border bg-muted/40 px-4 py-4">
							<p className="text-sm text-muted-foreground">{getNotificationMessage(notificationStatus)}</p>
						</div>
						<button
							type="button"
							onClick={handleEnableNotifications}
							disabled={
								isEnablingNotifications ||
								notificationStatus === "denied" ||
								notificationStatus === "unsupported"
							}
							className={cn(
								"inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium",
								"transition-colors hover:bg-muted",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								"disabled:pointer-events-none disabled:opacity-50",
							)}
						>
							{notificationStatus === "granted"
								? "Notifications enabled"
								: isEnablingNotifications
									? "Requesting permission..."
									: "Enable notifications"}
						</button>
					</div>
				),
			},
		],
		[
			deviceError,
			devices,
			handleEnableNotifications,
			isEnablingNotifications,
			isLoadingDevices,
			notificationStatus,
			setUnit,
			unit,
		],
	);

	const currentStep = steps[stepIndex] ?? steps[0];
	if (!currentStep) return null;

	const isLastStep = stepIndex === steps.length - 1;
	const StepIcon = currentStep.icon;

	return (
		<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="onboarding-title"
				aria-describedby="onboarding-description"
				tabIndex={-1}
				className="w-full max-w-2xl rounded-2xl border border-border bg-background p-6 shadow-2xl focus-visible:outline-none"
			>
				<div className="flex items-center justify-between gap-4">
					<div>
						<p className="text-sm font-medium text-muted-foreground">
							Step {stepIndex + 1} of {steps.length}
						</p>
						<div className="mt-2 flex items-center gap-2" aria-label="Onboarding progress">
							{steps.map((step, index) => (
								<span
									key={step.title}
									className={cn(
										"h-2.5 w-2.5 rounded-full",
										index === stepIndex ? "bg-foreground" : "bg-border",
									)}
								/>
							))}
						</div>
					</div>
					<div className="rounded-full bg-muted p-3 text-foreground">
						<StepIcon className="h-5 w-5" aria-hidden="true" />
					</div>
				</div>

				<div className="mt-6">
					<h2 id="onboarding-title" className="text-2xl font-semibold">
						{currentStep.title}
					</h2>
					<p id="onboarding-description" className="mt-2 text-sm text-muted-foreground">
						{currentStep.description}
					</p>
				</div>

				<div className="mt-6">{currentStep.content}</div>

				<div className="mt-8 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
					<button
						type="button"
						onClick={handleComplete}
						className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						Skip onboarding
					</button>
					<div className="flex flex-col gap-2 sm:flex-row">
						{stepIndex > 0 && (
							<button
								type="button"
								onClick={handleBack}
								className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								Back
							</button>
						)}
						<button
							type="button"
							onClick={handleNext}
							className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{isLastStep ? "Finish" : "Next"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
