import { expect, type Page, type Route } from "@playwright/test";

const PROJECT_ID = "e2e-project";
const USER_ID = "e2e-user";
const ACCOUNT_ID = "e2e-account";
export const DEVICE_SERIAL = "SIGNALS-001";
export const DEVICE_LABEL = "Demo Signals";

type FirestoreValue =
	| { stringValue: string }
	| { integerValue: string }
	| { doubleValue: number }
	| { booleanValue: boolean }
	| { timestampValue: string }
	| { nullValue: null }
	| { mapValue: { fields?: FirestoreFields } }
	| { arrayValue: { values?: FirestoreValue[] } };

type FirestoreFields = Record<string, FirestoreValue>;

interface MockState {
	sessionActive: boolean;
	sessionLabel: string;
	sessionStart: string | null;
	alarmHighEnabled: boolean;
	alarmHighValue: number;
	alarmLowEnabled: boolean;
	alarmLowValue: number;
}

const now = "2026-07-17T19:30:00.000Z";

function s(value: string): FirestoreValue {
	return { stringValue: value };
}

function n(value: number): FirestoreValue {
	return { doubleValue: value };
}

function b(value: boolean): FirestoreValue {
	return { booleanValue: value };
}

function t(value: string): FirestoreValue {
	return { timestampValue: value };
}

function alarm(enabled: boolean, value: number): FirestoreValue {
	return {
		mapValue: {
			fields: {
				enabled: b(enabled),
				alarming: b(false),
				value: n(value),
				units: s("F"),
			},
		},
	};
}

function deviceFields(state: MockState): FirestoreFields {
	return {
		serial: s(DEVICE_SERIAL),
		deviceId: s(DEVICE_SERIAL),
		label: s(DEVICE_LABEL),
		type: s("Signals"),
		status: s("online"),
		battery: n(88),
		wifiStrength: n(-47),
		firmware: s("1.2.3"),
		accountId: s(ACCOUNT_ID),
		deviceDisplayUnits: s("F"),
		lastSeen: t(now),
		sessionStart: state.sessionActive && state.sessionStart ? t(state.sessionStart) : { nullValue: null },
		sessionLabel: s(state.sessionLabel),
	};
}

function channelFields(state: MockState, number: string, label: string, value: number): FirestoreFields {
	return {
		number: s(number),
		label: s(label),
		value: n(value),
		units: s("F"),
		status: s("ok"),
		enabled: b(true),
		lastSeen: t(now),
		alarmHigh: alarm(state.alarmHighEnabled, state.alarmHighValue),
		alarmLow: alarm(state.alarmLowEnabled, state.alarmLowValue),
	};
}

function archiveFields(): FirestoreFields {
	const readingValues = [225, 228, 231];
	const readings = readingValues.map((value, index) => ({
		mapValue: {
			fields: {
				v: n(value),
				ts: t(`2026-07-17T19:${30 + index}:00.000Z`),
				u: s("F"),
			},
		},
	}));
	return {
		label: s("Brisket session"),
		deviceLabel: s(DEVICE_LABEL),
		start: t("2026-07-17T19:00:00.000Z"),
		end: t("2026-07-17T20:00:00.000Z"),
		createdOn: t("2026-07-17T20:00:00.000Z"),
		count: n(readings.length),
		channels: {
			arrayValue: {
				values: [
					{
						mapValue: {
							fields: {
								number: s("1"),
								label: s("Pit"),
								value: n(231),
								units: s("F"),
								enabled: b(true),
								recentReadings: { arrayValue: { values: readings } },
								alarmHigh: alarm(true, 275),
							},
						},
					},
				],
			},
		},
	};
}

function doc(name: string, fields: FirestoreFields) {
	return { name: `projects/${PROJECT_ID}/databases/(default)/documents/${name}`, fields };
}

function json(route: Route, body: unknown, status = 200) {
	return route.fulfill({
		status,
		contentType: "application/json",
		body: JSON.stringify(body),
	});
}

async function patchState(route: Route, state: MockState, pathname: string) {
	const body = (route.request().postDataJSON() as { fields?: FirestoreFields }) ?? {};
	const fields = body.fields ?? {};
	if (pathname.includes(`/documents/devices/${DEVICE_SERIAL}/channels/1`)) {
		const high = fields.alarmHigh;
		if (high && "mapValue" in high) {
			const alarmFields = high.mapValue.fields ?? {};
			const enabled = alarmFields.enabled;
			const value = alarmFields.value;
			if (enabled && "booleanValue" in enabled) state.alarmHighEnabled = enabled.booleanValue;
			if (value && "doubleValue" in value) state.alarmHighValue = value.doubleValue;
		}
		const low = fields.alarmLow;
		if (low && "mapValue" in low) {
			const alarmFields = low.mapValue.fields ?? {};
			const enabled = alarmFields.enabled;
			const value = alarmFields.value;
			if (enabled && "booleanValue" in enabled) state.alarmLowEnabled = enabled.booleanValue;
			if (value && "doubleValue" in value) state.alarmLowValue = value.doubleValue;
		}
	}
	if (pathname.includes(`/documents/devices/${DEVICE_SERIAL}`)) {
		const active = fields.sessionActive;
		if (active && "booleanValue" in active) state.sessionActive = active.booleanValue;
		const label = fields.sessionLabel;
		if (label && "stringValue" in label) state.sessionLabel = label.stringValue;
		const start = fields.sessionStart;
		if (start && "timestampValue" in start) state.sessionStart = start.timestampValue;
	}
	await json(route, { fields: deviceFields(state) });
}

export async function mockThermoworksCloud(page: Page) {
	const state: MockState = {
		sessionActive: false,
		sessionLabel: "",
		sessionStart: null,
		alarmHighEnabled: false,
		alarmHighValue: 275,
		alarmLowEnabled: false,
		alarmLowValue: 150,
	};

	await page.route("**/api/**", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const path = url.pathname;

		if (path.includes("/api/identity/v1/accounts:signInWithPassword")) {
			const body = request.postDataJSON() as { email?: string; password?: string };
			if (body.password !== "correct-password") {
				await json(route, { error: { message: "INVALID_LOGIN_CREDENTIALS" } }, 400);
				return;
			}
			await json(route, {
				idToken: "e2e-token",
				refreshToken: "e2e-refresh-token",
				localId: USER_ID,
				expiresIn: "3600",
			});
			return;
		}

		if (path.includes("/api/firebase/v1alpha/projects/-/apps/")) {
			await json(route, { projectId: PROJECT_ID });
			return;
		}

		if (path.includes("/api/functions/requestRetrieveInstrumentHistory")) {
			await json(route, {
				result: {
					readings: [
						{ v: 225, ts: "2026-07-17T19:30:00.000Z", u: "F" },
						{ v: 230, ts: "2026-07-17T19:31:00.000Z", u: "F" },
					],
				},
			});
			return;
		}

		if (path.includes("/api/functions/")) {
			await json(route, { result: null });
			return;
		}

		if (request.method() === "PATCH") {
			await patchState(route, state, path);
			return;
		}

		if (path.includes(`/documents/users/${USER_ID}`)) {
			await json(route, { fields: { accountId: s(ACCOUNT_ID), email: s("e2e@example.com") } });
			return;
		}

		if (path.includes(`/documents/accounts/${ACCOUNT_ID}/groups`)) {
			await json(route, { documents: [] });
			return;
		}

		if (path.includes(`/documents/accounts/${ACCOUNT_ID}`)) {
			await json(route, {
				fields: {
					name: s("E2E Account"),
					billingPlanId: s("starter"),
					devicesUsed: n(1),
					devicesLimit: n(10),
				},
			});
			return;
		}

		if (path.includes("/documents/system/billingPlans/plans/")) {
			await json(route, { fields: { name: s("Starter"), deviceCount: n(10) } });
			return;
		}

		if (path.includes("/documents:runQuery")) {
			await json(route, [{ document: doc(`devices/${DEVICE_SERIAL}`, deviceFields(state)) }]);
			return;
		}

		if (path.includes(`/documents/devices/${DEVICE_SERIAL}/channels`)) {
			await json(route, {
				documents: [
					doc(`devices/${DEVICE_SERIAL}/channels/1`, channelFields(state, "1", "Pit", 225)),
					doc(`devices/${DEVICE_SERIAL}/channels/2`, channelFields(state, "2", "Food", 165)),
				],
			});
			return;
		}

		if (path.includes(`/documents/devices/${DEVICE_SERIAL}/archive`)) {
			await json(route, { documents: [doc(`devices/${DEVICE_SERIAL}/archive/session-1`, archiveFields())] });
			return;
		}

		if (path.includes("/documents/system/firmware")) {
			await json(route, {}, 404);
			return;
		}

		await json(route, { documents: [] });
	});
}

export async function seedAuthenticatedSession(page: Page) {
	await page.addInitScript(
		({ accountId, projectId, userId }) => {
			window.localStorage.setItem("thermoworks-onboarding-complete", "true");
			window.sessionStorage.setItem(
				"thermoworks-session",
				JSON.stringify({
					token: {
						accessToken: "e2e-token",
						refreshToken: "e2e-refresh-token",
						userId,
						expiresAt: Date.now() + 60 * 60 * 1000,
					},
					projectId,
				}),
			);
			window.localStorage.setItem(
				"thermoworks-accounts",
				JSON.stringify([
					{
						id: accountId,
						email: "e2e@example.com",
						token: {
							accessToken: "e2e-token",
							refreshToken: "e2e-refresh-token",
							userId,
							expiresAt: Date.now() + 60 * 60 * 1000,
						},
						projectId,
						lastUsed: Date.now(),
					},
				]),
			);
			window.localStorage.setItem("thermoworks-active-account", accountId);
		},
		{ accountId: ACCOUNT_ID, projectId: PROJECT_ID, userId: USER_ID },
	);
}

export async function openAuthenticatedDashboard(page: Page) {
	await mockThermoworksCloud(page);
	await seedAuthenticatedSession(page);
	await page.goto("/", { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("link", { name: DEVICE_LABEL })).toBeVisible({ timeout: 30_000 });
}
