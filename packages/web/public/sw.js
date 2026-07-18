/**
 * Minimal service worker for PWA installability and offline app-shell caching.
 *
 * Strategy: network-first with cache fallback.  We cache the app shell on
 * install so the dashboard frame loads even when offline.  API calls are never
 * cached — stale temperature data is worse than no data.
 */

const CACHE_NAME = "thermoworks-v1";
const SHELL_ASSETS = ["./", "./index.html"];
const DEFAULT_PUSH_TITLE = "ThermoWorks alarm";

function sanitizeNotificationText(value, fallback) {
	const text = typeof value === "string" && value.trim() ? value.trim() : fallback;
	return text.replace(/[<>{}[\]\\]/g, "").replace(/\s+/g, " ").slice(0, 240);
}

function getPushNotification(event) {
	if (!event.data) {
		return { title: DEFAULT_PUSH_TITLE, options: { icon: "./favicon.svg" } };
	}

	try {
		const payload = event.data.json();
		const title = sanitizeNotificationText(payload.title, DEFAULT_PUSH_TITLE);
		const body = sanitizeNotificationText(payload.body, "");
		const tag = sanitizeNotificationText(payload.tag, "thermoworks-alarm");
		return { title, options: { body, tag, icon: "./favicon.svg" } };
	} catch {
		return {
			title: DEFAULT_PUSH_TITLE,
			options: {
				body: sanitizeNotificationText(event.data.text(), ""),
				icon: "./favicon.svg",
				tag: "thermoworks-alarm",
			},
		};
	}
}

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
	);
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(
				keys
					.filter((key) => key !== CACHE_NAME)
					.map((key) => caches.delete(key)),
			),
		),
	);
	self.clients.claim();
});

self.addEventListener("fetch", (event) => {
	const { request } = event;

	// Only handle http/https requests — skip chrome-extension://, etc.
	if (!request.url.startsWith("http")) {
		return;
	}

	// Skip non-GET and API requests — never serve stale data.
	if (request.method !== "GET" || request.url.includes("/api/")) {
		return;
	}

	event.respondWith(
		fetch(request)
			.then((response) => {
				// Cache successful responses for future offline use.
				if (response.ok) {
					const clone = response.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
				}
				return response;
			})
			.catch(() => caches.match(request)),
	);
});

self.addEventListener("push", (event) => {
	const { title, options } = getPushNotification(event);
	event.waitUntil(self.registration.showNotification(title, options));
});
