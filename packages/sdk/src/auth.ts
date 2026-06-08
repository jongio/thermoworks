import { setTimeout as delay } from "node:timers/promises";
import { Agent, request as undiciRequest } from "undici";
import {
	readTokenCache,
	resolveTokenCachePath,
	type TokenCacheData,
	writeTokenCache,
} from "./token-cache.js";
import { AuthError, NetworkError, type RetryConfig } from "./types.js";

const IDENTITY_HOST = "https://identitytoolkit.googleapis.com";
const TOKEN_HOST = "https://securetoken.googleapis.com";
const FIREBASE_HOST = "https://firebase.googleapis.com";
const FIRESTORE_HOST = "https://firestore.googleapis.com";
const FUNCTIONS_HOST = "https://us-central1-thermoworks-cloud-production.cloudfunctions.net";

// Firebase client-side API key (public identifier, not a secret).
// Security is enforced by Firebase Security Rules server-side.
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

// Maximum response body size (10 MB) to prevent OOM from malicious/corrupted responses
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

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

			// Guard against oversized responses to prevent OOM
			const contentLength = responseHeaders["content-length"];
			if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
				await body.dump();
				throw new NetworkError("Response too large");
			}

			const text = await body.text();
			if (text.length > MAX_RESPONSE_BYTES) {
				throw new NetworkError("Response too large");
			}

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

export interface AuthSessionOptions {
	email: string;
	password: string;
	apiKey?: string;
	appId?: string;
	/** Path to token cache file, or true for default path, or false/undefined to disable. */
	tokenCachePath?: string | boolean;
	/** Retry configuration for transient failures. */
	retry?: RetryConfig;
}

export async function createAuthSession(
	emailOrOptions: string | AuthSessionOptions,
	password?: string,
	apiKey?: string,
	appId?: string,
	retryArg?: RetryConfig,
): Promise<AuthSession> {
	// Support both legacy positional args and new options object
	const opts: AuthSessionOptions =
		typeof emailOrOptions === "string"
			? { email: emailOrOptions, password: password ?? "", apiKey, appId }
			: emailOrOptions;

	const retry = opts.retry ?? retryArg;
	const key = opts.apiKey ?? DEFAULT_API_KEY;
	const app = opts.appId ?? DEFAULT_APP_ID;

	const agent = new Agent({
		keepAliveTimeout: 60_000,
		connections: 10,
	});

	let config: FirebaseWebConfig;
	let token: TokenState;

	const cachePath = resolveCacheSetting(opts.tokenCachePath);

	try {
		const cached = cachePath ? await tryRestoreFromCache(cachePath, key, agent) : null;

		if (cached) {
			config = { projectId: cached.projectId };
			token = cached.token;
		} else {
			config = await fetchWebConfig(key, app, agent, retry);
			token = await login(opts.email, opts.password, key, agent, retry);
			if (cachePath) {
				await persistToCache(cachePath, token, config.projectId);
			}
		}
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
				refreshPromise = (async () => {
					try {
						const t = await refreshAccessToken(token.refreshToken, key, agent, retry);
						token = t;
						if (cachePath) {
							await persistToCache(cachePath, t, config.projectId).catch(() => {});
						}
						return t;
					} finally {
						refreshPromise = null;
					}
				})();
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

function resolveCacheSetting(setting: string | boolean | undefined): string | null {
	if (setting === false || setting === undefined) return null;
	if (setting === true) return resolveTokenCachePath();
	return resolveTokenCachePath(setting);
}

async function tryRestoreFromCache(
	cachePath: string,
	apiKey: string,
	agent: Agent,
): Promise<{ token: TokenState; projectId: string } | null> {
	const cached = await readTokenCache(cachePath);
	if (!cached) return null;

	const expiresAt = Date.parse(cached.expiresAt);
	if (Number.isNaN(expiresAt)) return null;

	// Token is still valid - use directly
	if (Date.now() < expiresAt - EXPIRY_BUFFER_MS) {
		return {
			token: {
				accessToken: cached.idToken,
				refreshToken: cached.refreshToken,
				userId: cached.userId,
				expiresAt,
			},
			projectId: cached.projectId,
		};
	}

	// Token expired - try refresh
	try {
		const refreshed = await refreshAccessToken(cached.refreshToken, apiKey, agent);
		await persistToCache(cachePath, refreshed, cached.projectId);
		return { token: refreshed, projectId: cached.projectId };
	} catch {
		// Refresh failed - fall back to full re-auth (caller handles this via null return)
		return null;
	}
}

async function persistToCache(
	cachePath: string,
	token: TokenState,
	projectId: string,
): Promise<void> {
	const data: TokenCacheData = {
		idToken: token.accessToken,
		refreshToken: token.refreshToken,
		userId: token.userId,
		expiresAt: new Date(token.expiresAt).toISOString(),
		projectId,
	};
	await writeTokenCache(cachePath, data);
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
