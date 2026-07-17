import { useEffect, useRef, useState } from "react";
import { showToast } from "../components/Toast.tsx";
import type { ThermoworksWebClient } from "../lib/api.ts";
import {
	getOutboxSnapshot,
	type OutboxSnapshot,
	replayQueuedMutations,
	subscribeToOutboxChanges,
} from "../lib/offline-mutations.ts";

const EMPTY_SNAPSHOT: OutboxSnapshot = { pendingCount: 0, conflictCount: 0 };

export function useOfflineMutationCounts(): OutboxSnapshot {
	const [snapshot, setSnapshot] = useState<OutboxSnapshot>(EMPTY_SNAPSHOT);

	useEffect(() => {
		let active = true;
		const refresh = () => {
			getOutboxSnapshot()
				.then((nextSnapshot) => {
					if (active) setSnapshot(nextSnapshot);
				})
				.catch(() => {
					if (active) setSnapshot(EMPTY_SNAPSHOT);
				});
		};

		refresh();
		const unsubscribe = subscribeToOutboxChanges(refresh);
		return () => {
			active = false;
			unsubscribe();
		};
	}, []);

	return snapshot;
}

export function useOfflineMutationReplay(client: ThermoworksWebClient): void {
	const replayingRef = useRef(false);

	useEffect(() => {
		const replay = () => {
			if (!navigator.onLine || replayingRef.current) return;
			replayingRef.current = true;
			replayQueuedMutations(client)
				.then(({ replayed, conflicts }) => {
					if (replayed > 0) {
						showToast("success", `Synced ${replayed} offline change${replayed === 1 ? "" : "s"}.`);
					}
					if (conflicts > 0) {
						showToast(
							"error",
							`${conflicts} offline change${conflicts === 1 ? "" : "s"} need review before syncing.`,
						);
					}
				})
				.catch(() => {
					// Leave items queued for the next reconnect attempt.
				})
				.finally(() => {
					replayingRef.current = false;
				});
		};

		window.addEventListener("online", replay);
		replay();
		return () => window.removeEventListener("online", replay);
	}, [client]);
}
