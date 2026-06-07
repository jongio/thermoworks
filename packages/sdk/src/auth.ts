import { Agent, request as undiciRequest } from "undici";
import {
	readTokenCache,
	resolveTokenCachePath,
	type TokenCacheData,
	writeTokenCache,
} from "./token-cache.js";
import { AuthError, NetworkError } from "./types.js";

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
	json(): Promise<unknown>;
	text(): Promise<string>;
}

async function httpRequest(
	url: string,
	options: {
		method?: string;
		headers?: Record<string, string>;
		body?: string;
	},
	agent: Agent,
	retries = 2,
): Promise<HttpResponse> {
	let lastError: Error | undefined;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const {
				statusCode,
				headers: _h,
				body,
			} = await undiciRequest(url, {
				method: options.method ?? "GET",
				headers: options.headers,
				body: options.body,
				dispatcher: agent,
			});

			const text = await body.text();
			const response: HttpResponse = {
				ok: statusCode >= 200 && statusCode < 300,
				status: statusCode,
				json: async () => JSON.parse(text),
				text: async () => text,
			};

			// Don't retry client errors (4xx) — only server errors (5xx)
			if (statusCode >= 500 && attempt < retries) {
				lastError = new NetworkError(`Server error: HTTP ${statusCode}`);
				await delay(100 * 2 ** attempt);
				continue;
			}

			return response;
		} catch (err) {
			lastError = new NetworkError(err instanceof Error ? err.message : "Network request failed");
			if (attempt < retries) {
				await delay(100 * 2 ** attempt);
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

export interface AuthSessionOptions {
	email: string;
	password: string;
	apiKey?: string;
	appId?: string;
	/** Path to token cache file, or true for default path, or false/undefined to disable. */
	tokenCachePath?: string | boolean;
}

export async function createAuthSession(
	emailOrOptions: string | AuthSessionOptions,
	password?: string,
	apiKey?: string,
	appId?: string,
): Promise<AuthSession> {
	// Support both legacy positional args and new options object
	const opts: AuthSessionOptions =
		typeof emailOrOptions === "string"
			? { email: emailOrOptions, password: password ?? "", apiKey, appId }
			: emailOrOptions;

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
			config = await fetchWebConfig(key, app, agent);
			token = await login(opts.email, opts.password, key, agent);
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
				refreshPromise = refreshAccessToken(token.refreshToken, key, agent)
					.then((t) => {
						token = t;
						if (cachePath) {
							persistToCache(cachePath, t, config.projectId);
						}
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
