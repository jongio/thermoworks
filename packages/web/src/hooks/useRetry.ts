import { useCallback, useRef, useState } from "react";

interface UseRetryOptions {
	/** Maximum number of retry attempts (default: 3). */
	maxAttempts?: number;
	/** Base delay in milliseconds between retries (default: 1000). */
	delay?: number;
}

interface UseRetryResult<T> {
	/** Execute the operation (with retries on failure). */
	execute: () => Promise<T | undefined>;
	/** Whether a retry attempt is currently in progress. */
	isRetrying: boolean;
	/** Number of attempts made so far. */
	attempts: number;
	/** Last error encountered, if any. */
	error: Error | null;
	/** Reset state to initial values. */
	reset: () => void;
}

/**
 * Hook for retrying async operations with exponential backoff.
 *
 * Delay formula: `baseDelay * 2^attempt` (capped internally to prevent
 * runaway timers if maxAttempts is set high).
 */
export function useRetry<T>(fn: () => Promise<T>, options?: UseRetryOptions): UseRetryResult<T> {
	const { maxAttempts = 3, delay = 1000 } = options ?? {};
	const [isRetrying, setIsRetrying] = useState(false);
	const [attempts, setAttempts] = useState(0);
	const [error, setError] = useState<Error | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	const execute = useCallback(async (): Promise<T | undefined> => {
		// Cancel any previous run
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		setIsRetrying(true);
		setError(null);
		setAttempts(0);

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			if (controller.signal.aborted) break;

			setAttempts(attempt + 1);

			try {
				const result = await fn();
				if (!controller.signal.aborted) {
					setIsRetrying(false);
				}
				return result;
			} catch (err) {
				const e = err instanceof Error ? err : new Error(String(err));
				if (controller.signal.aborted) break;

				if (attempt === maxAttempts - 1) {
					// Final attempt failed
					setError(e);
					setIsRetrying(false);
					return undefined;
				}

				// Wait with exponential backoff before next attempt
				const backoff = Math.min(delay * 2 ** attempt, 30_000);
				await new Promise<void>((resolve) => {
					const timer = setTimeout(resolve, backoff);
					controller.signal.addEventListener("abort", () => {
						clearTimeout(timer);
						resolve();
					});
				});
			}
		}

		if (!controller.signal.aborted) {
			setIsRetrying(false);
		}
		return undefined;
	}, [fn, maxAttempts, delay]);

	const reset = useCallback(() => {
		abortRef.current?.abort();
		setIsRetrying(false);
		setAttempts(0);
		setError(null);
	}, []);

	return { execute, isRetrying, attempts, error, reset };
}
