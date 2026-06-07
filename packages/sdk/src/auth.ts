import { Agent, request as undiciRequest } from "undici";
import { AuthError, NetworkError, type RetryConfig } from "./types.js";

const IDENTITY_HOST = "https://identitytoolkit.googleapis.com";
const TOKEN_HOST = "https://securetoken.googleapis.com";
const FIREBASE_HOST = "https://firebase.googleapis.com";
const FIRESTORE_HOST = "https://firestore.googleapis.com";
const FUNCTIONS_HOST = "https://us-central1-thermoworks-cloud-production.cloudfunctions.net";

const DEFAULT_API_KEY = "AIzaSyCf079iccUFc1k7VHdGXng22zXDy8Y3KEY";
const DEFAULT_APP_ID = "1:78998049458:web:b41e9d405d8c7de95eefab";
const REFERER = "https://cloud.thermoworks.com/";

// Refresh tokens 60 seconds before they actually expire
const EXPIRY_BUFFER_MS = 60_000;

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30_000;

/** HTTP status codes that indicate transient failures worth retrying. */
const RETRYABLE_STATUS_CODES = new Set([429, 503]);

interface TokenState {
	accessToken: string;
	refreshToken: string;
	userId: string;
	expiresAt: number;
}

interface FirebaseWebConfig {
	projectId: string;
}

interface HttpResponse {
	ok: boolean;
	status: number;
	headers: Record<string, string | string[] | undefined>;
	json(): Promise<unknown>;
	text(): Promise<string>;
}

/**
 * Compute the retry delay using exponential backoff with full jitter.
 * Formula: random(0, min(baseDelay * 2^attempt, maxDelay))
 * If a Retry-After header is present, use that as a floor instead.
 */
export function computeRetryDelay(
	attempt: number,
	baseDelayMs: number,
	maxDelayMs: number,
	retryAfterHeader?: string | string[] | null,
): number {
	// Parse Retry-After header if present (seconds or HTTP-date)
	let retryAfterMs = 0;
	if (retryAfterHeader) {
		const headerValue = Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader;
		if (headerValue) {
			const seconds = Number(headerValue);
			if (Number.isFinite(seconds) && seconds > 0) {
				retryAfterMs = seconds * 1000;
			} else {
				// Try parsing as HTTP-date
				const date = Date.parse(headerValue);
				if (!Number.isNaN(date)) {
					retryAfterMs = Math.max(0, date - Date.now());
				}
			}
		}
	}

	// Exponential backoff: baseDelay * 2^attempt, capped at maxDelay
	const exponentialDelay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);

	// Use Retry-After as floor if larger than computed delay
	const baseDelay = Math.max(exponentialDelay, retryAfterMs);

	// Full jitter: uniform random in [0, baseDelay], capped at maxDelay
	const jitteredDelay = Math.random() * baseDelay;
	return Math.min(jitteredDelay, maxDelayMs);
}

function isRetryableStatus(statusCode: number): boolean {
	return RETRYABLE_STATUS_CODES.has(statusCode) || statusCode >= 500;
}

async function httpRequest(
	url: string,
	options: {
		method?: string;
		headers?: Record<string, string>;
		body?: string;
	},
	agent: Agent,
	retry?: RetryConfig,
): Promise<HttpResponse> {
	const maxRetries = retry?.maxRetries ?? DEFAULT_MAX_RETRIES;
	const baseDelayMs = retry?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
	const maxDelayMs = retry?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

	let lastError: Error | undefined;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const {
				statusCode,
				headers: responseHeaders,
				body,
			} = await undiciRequest(url, {
				method: options.method ?? "GET",
				headers: options.headers,
				body: options.body,
				dispatcher: agent,
			});

			const text = await body.text();
			const normalizedHeaders: Record<string, string | string[] | undefined> = {};
			if (responseHeaders && typeof responseHeaders === "object") {
				for (const [key, value] of Object.entries(responseHeaders)) {
					normalizedHeaders[key.toLowerCase()] = value;
				}
			}

			const response: HttpResponse = {
				ok: statusCode >= 200 && statusCode < 300,
				status: statusCode,
				headers: normalizedHeaders,
				json: async () => JSON.parse(text),
				text: async () => text,
			};

			// Retry on transient status codes (429, 5xx)
			if (isRetryableStatus(statusCode) && attempt < maxRetries) {
				lastError = new NetworkError(`Server error: HTTP ${statusCode}`, statusCode);
				const retryAfter = normalizedHeaders["retry-after"];
				const retryAfterValue = Array.isArray(retryAfter) ? retryAfter[0] : retryAfter;
				await delay(computeRetryDelay(attempt, baseDelayMs, maxDelayMs, retryAfterValue));
				continue;
			}

			return response;
		} catch (err) {
			lastError = new NetworkError(err instanceof Error ? err.message : "Network request failed");
			if (attempt < maxRetries) {
				await delay(computeRetryDelay(attempt, baseDelayMs, maxDelayMs));
			}
		}
	}
	throw lastError ?? new NetworkError("Network request failed");
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseExpiresIn(value: unknown): number {
	const seconds = Number(value);
	if (!Number.isFinite(seconds) || seconds < 0) {
		throw new AuthError("Invalid expires_in from server", "INVALID_TOKEN_RESPONSE");
	}
	return seconds;
}

async function safeJsonParse(response: HttpResponse, context: string): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		throw new NetworkError(`Invalid JSON in ${context}`);
	}
}

export interface AuthSession {
	request(method: string, path: string, body?: unknown): Promise<HttpResponse>;
	callFunction(name: string, data: unknown): Promise<unknown>;
	getUserId(): string;
	close(): void;
}

export async function createAuthSession(
	email: string,
	password: string,
	apiKey?: string,
	appId?: string,
	retry?: RetryConfig,
): Promise<AuthSession> {
	const key = apiKey ?? DEFAULT_API_KEY;
	const app = appId ?? DEFAULT_APP_ID;

	const agent = new Agent({
		keepAliveTimeout: 60_000,
		connections: 10,
	});

	let config: FirebaseWebConfig;
	let token: TokenState;
	try {
		config = await fetchWebConfig(key, app, agent, retry);
		token = await login(email, password, key, agent, retry);
	} catch (err) {
		agent.close();
		throw err;
	}

	const baseUrl = `${FIRESTORE_HOST}/v1/projects/${config.projectId}/databases/(default)`;
	let refreshPromise: Promise<TokenState> | null = null;

	function isTokenValid(): boolean {
		return Date.now() < token.expiresAt - EXPIRY_BUFFER_MS;
	}

	async function ensureValidToken(): Promise<string> {
		if (!isTokenValid()) {
			if (!refreshPromise) {
				refreshPromise = refreshAccessToken(token.refreshToken, key, agent, retry)
					.then((t) => {
						token = t;
						return t;
					})
					.finally(() => {
						refreshPromise = null;
					});
			}
			await refreshPromise;
		}
		return token.accessToken;
	}

	return {
		async request(method: string, path: string, body?: unknown): Promise<HttpResponse> {
			const accessToken = await ensureValidToken();
			const separator = path.includes("?") ? "&" : "?";
			const url = `${baseUrl}/${path}${separator}key=${key}`;
			const headers: Record<string, string> = {
				authorization: `Bearer ${accessToken}`,
			};

			if (body !== undefined) {
				headers["content-type"] = "application/json";
			}

			const response = await httpRequest(
				url,
				{
					method,
					headers,
					body: body !== undefined ? JSON.stringify(body) : undefined,
				},
				agent,
				retry,
			);

			if (!response.ok && response.status !== 404) {
				throw new NetworkError(`HTTP ${response.status}`, response.status);
			}

			return response;
		},

		async callFunction(name: string, data: unknown): Promise<unknown> {
			if (!name || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
				throw new Error(`Invalid function name: ${name}`);
			}
			const accessToken = await ensureValidToken();
			const url = `${FUNCTIONS_HOST}/${name}`;
			const response = await httpRequest(
				url,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${accessToken}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({ data }),
				},
				agent,
				retry,
			);

			if (!response.ok) {
				throw new NetworkError(
					`Cloud function call failed: HTTP ${response.status}`,
					response.status,
				);
			}

			const result = await response.json();
			return (result as { result?: unknown }).result ?? result;
		},

		getUserId(): string {
			return token.userId;
		},

		close() {
			agent.close();
		},
	};
}

async function fetchWebConfig(
	apiKey: string,
	appId: string,
	agent: Agent,
	retry?: RetryConfig,
): Promise<FirebaseWebConfig> {
	const url = `${FIREBASE_HOST}/v1alpha/projects/-/apps/${appId}/webConfig`;
	const response = await httpRequest(
		url,
		{
			headers: {
				accept: "application/json",
				"x-goog-api-key": apiKey,
				referer: REFERER,
			},
		},
		agent,
		retry,
	);

	if (!response.ok) {
		throw new NetworkError("Failed to fetch Firebase web config", response.status);
	}

	return (await safeJsonParse(response, "Firebase web config")) as FirebaseWebConfig;
}

async function login(
	email: string,
	password: string,
	apiKey: string,
	agent: Agent,
	retry?: RetryConfig,
): Promise<TokenState> {
	const url = `${IDENTITY_HOST}/v1/accounts:signInWithPassword?key=${apiKey}`;
	const response = await httpRequest(
		url,
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				referer: REFERER,
			},
			body: JSON.stringify({
				email,
				password,
				returnSecureToken: true,
			}),
		},
		agent,
		retry,
	);

	if (!response.ok) {
		const errorData = (await response.json().catch(() => null)) as {
			error?: { message?: string };
		} | null;
		const reason = errorData?.error?.message ?? "UNKNOWN";
		throw new AuthError(`Authentication failed: ${reason}`, reason);
	}

	const data = (await safeJsonParse(response, "login response")) as {
		idToken: string;
		refreshToken: string;
		localId: string;
		expiresIn: string;
	};

	return {
		accessToken: data.idToken,
		refreshToken: data.refreshToken,
		userId: data.localId,
		expiresAt: Date.now() + parseExpiresIn(data.expiresIn) * 1000,
	};
}

async function refreshAccessToken(
	refreshToken: string,
	apiKey: string,
	agent: Agent,
	retry?: RetryConfig,
): Promise<TokenState> {
	const url = `${TOKEN_HOST}/v1/token?key=${apiKey}`;
	const response = await httpRequest(
		url,
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				referer: REFERER,
			},
			body: JSON.stringify({
				grant_type: "refresh_token",
				refresh_token: refreshToken,
			}),
		},
		agent,
		retry,
	);

	if (!response.ok) {
		throw new AuthError("Token refresh failed", "TOKEN_REFRESH_FAILED");
	}

	const data = (await safeJsonParse(response, "token refresh")) as {
		id_token: string;
		refresh_token: string;
		user_id: string;
		expires_in: string;
	};

	return {
		accessToken: data.id_token,
		refreshToken: data.refresh_token,
		userId: data.user_id,
		expiresAt: Date.now() + parseExpiresIn(data.expires_in) * 1000,
	};
}
