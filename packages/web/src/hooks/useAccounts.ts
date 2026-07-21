import { useCallback, useSyncExternalStore } from "react";
import { ThermoworksWebClient } from "../lib/api.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Token state shape matching ThermoworksWebClient's sessionStorage format. */
interface TokenData {
	accessToken: string;
	refreshToken: string;
	userId: string;
	expiresAt: number;
}

/** A stored account with credentials for session-free switching. */
export interface StoredAccount {
	id: string; // userId from Firebase auth
	email: string;
	displayName: string | null;
	token: TokenData;
	projectId: string;
	lastUsed: number; // Unix timestamp
}

export interface UseAccountsResult {
	accounts: StoredAccount[];
	activeAccountId: string | null;
	activeAccount: StoredAccount | null;
	addAccount: (email: string, client: ThermoworksWebClient) => void;
	switchAccount: (id: string) => ThermoworksWebClient | null;
	removeAccount: (id: string) => void;
	clearAllAccounts: () => void;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const ACCOUNTS_STORAGE_KEY = "thermoworks-accounts";
const ACTIVE_ACCOUNT_KEY = "thermoworks-active-account";
const SESSION_STORAGE_KEY = "thermoworks-session";

/** Subscribers for useSyncExternalStore. */
let listeners: Array<() => void> = [];
function subscribe(listener: () => void): () => void {
	listeners = [...listeners, listener];
	return () => {
		listeners = listeners.filter((l) => l !== listener);
	};
}
function emitChange(): void {
	for (const listener of listeners) {
		listener();
	}
}

function readAccounts(): StoredAccount[] {
	try {
		const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed as StoredAccount[];
	} catch {
		return [];
	}
}

function writeAccounts(accounts: StoredAccount[]): void {
	try {
		if (accounts.length === 0) {
			localStorage.removeItem(ACCOUNTS_STORAGE_KEY);
		} else {
			// Do not persist long-lived refresh tokens to localStorage: this app is
			// served from a shared *.github.io origin, so any script on that origin
			// could read them and mint fresh sessions indefinitely. Keep only the
			// short-lived access token; once it expires, switching to that account
			// re-authenticates.
			const persisted = accounts.map((account) => ({
				...account,
				token: { ...account.token, refreshToken: "" },
			}));
			localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(persisted));
		}
	} catch {
		// Storage unavailable
	}
	emitChange();
}

function readActiveId(): string | null {
	try {
		return localStorage.getItem(ACTIVE_ACCOUNT_KEY);
	} catch {
		return null;
	}
}

function writeActiveId(id: string | null): void {
	try {
		if (id === null) {
			localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
		} else {
			localStorage.setItem(ACTIVE_ACCOUNT_KEY, id);
		}
	} catch {
		// Storage unavailable
	}
	emitChange();
}

/** Write token data to sessionStorage so ThermoworksWebClient can restore it. */
function writeSessionToken(token: TokenData, projectId: string): void {
	try {
		sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token, projectId }));
	} catch {
		// Storage unavailable
	}
}

// Snapshot function for useSyncExternalStore
function getSnapshot(): string {
	const accounts = localStorage.getItem(ACCOUNTS_STORAGE_KEY) ?? "";
	const active = localStorage.getItem(ACTIVE_ACCOUNT_KEY) ?? "";
	return `${accounts}|${active}`;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAccounts(): UseAccountsResult {
	// Re-render on storage changes
	useSyncExternalStore(subscribe, getSnapshot);

	const accounts = readAccounts();
	const activeAccountId = readActiveId();
	const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;

	const addAccount = useCallback((email: string, _client: ThermoworksWebClient) => {
		// Extract token from sessionStorage (client just persisted it)
		let tokenData: { token: TokenData; projectId: string } | null = null;
		try {
			const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
			if (raw) {
				tokenData = JSON.parse(raw) as { token: TokenData; projectId: string };
			}
		} catch {
			return; // Can't extract credentials
		}
		if (!tokenData) return;

		const { token, projectId } = tokenData;
		const current = readAccounts();
		const existing = current.findIndex((a) => a.id === token.userId);
		const now = Date.now();

		const account: StoredAccount = {
			id: token.userId,
			email,
			displayName: null,
			token,
			projectId,
			lastUsed: now,
		};

		if (existing >= 0) {
			// Update existing account's token
			current[existing] = { ...current[existing], ...account };
		} else {
			current.push(account);
		}

		writeAccounts(current);
		writeActiveId(token.userId);
	}, []);

	const switchAccount = useCallback((id: string): ThermoworksWebClient | null => {
		const current = readAccounts();
		const target = current.find((a) => a.id === id);
		if (!target) return null;

		// Update lastUsed timestamp
		const updated = current.map((a) => (a.id === id ? { ...a, lastUsed: Date.now() } : a));
		writeAccounts(updated);
		writeActiveId(id);

		// Write target's token to sessionStorage, then create client (auto-restores)
		writeSessionToken(target.token, target.projectId);
		return new ThermoworksWebClient();
	}, []);

	const removeAccount = useCallback(
		(id: string) => {
			const current = readAccounts();
			const filtered = current.filter((a) => a.id !== id);
			writeAccounts(filtered);

			if (activeAccountId === id) {
				// Switch to most recently used remaining account, or clear
				if (filtered.length > 0) {
					const sorted = [...filtered].sort((a, b) => b.lastUsed - a.lastUsed);
					const next = sorted[0];
					if (next) {
						writeActiveId(next.id);
						writeSessionToken(next.token, next.projectId);
					}
				} else {
					writeActiveId(null);
					try {
						sessionStorage.removeItem(SESSION_STORAGE_KEY);
					} catch {
						// ignore
					}
				}
			}
		},
		[activeAccountId],
	);

	const clearAllAccounts = useCallback(() => {
		writeAccounts([]);
		writeActiveId(null);
		try {
			sessionStorage.removeItem(SESSION_STORAGE_KEY);
		} catch {
			// ignore
		}
	}, []);

	return {
		accounts,
		activeAccountId,
		activeAccount,
		addAccount,
		switchAccount,
		removeAccount,
		clearAllAccounts,
	};
}
