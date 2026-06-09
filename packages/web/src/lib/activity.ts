import type { Archive, DeviceEvent } from "thermoworks-sdk";

export const SESSION_STARTED_TYPE = "Session Started";
export const SESSION_ENDED_TYPE = "Session Ended";

interface TimestampedItem {
	id: string;
	timestamp: Date;
}

export interface EventActivityItem {
	id: string;
	kind: "event";
	deviceId: string;
	timestamp: Date;
	activityType: string;
	event: DeviceEvent;
}

export interface SessionActivityItem {
	id: string;
	kind: "session";
	phase: "start" | "end";
	deviceId: string;
	timestamp: Date;
	activityType: typeof SESSION_STARTED_TYPE | typeof SESSION_ENDED_TYPE;
	archive: Archive;
}

export type ActivityItem = EventActivityItem | SessionActivityItem;

export function mergeItemsById<T extends TimestampedItem>(
	...groups: ReadonlyArray<ReadonlyArray<T>>
): T[] {
	const merged = new Map<string, T>();

	for (const group of groups) {
		for (const item of group) {
			merged.set(item.id, item);
		}
	}

	return Array.from(merged.values()).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export function toEventActivityItems(events: ReadonlyArray<DeviceEvent>): EventActivityItem[] {
	return events.map((event) => ({
		id: `event:${event.id}`,
		kind: "event",
		deviceId: event.deviceId,
		timestamp: event.eventTime,
		activityType: event.eventType,
		event,
	}));
}

export function toSessionActivityItems(
	serial: string,
	archives: ReadonlyArray<Archive>,
): SessionActivityItem[] {
	const items: SessionActivityItem[] = [];

	for (const archive of archives) {
		if (archive.start) {
			items.push({
				id: `archive:${serial}:${archive.id}:start`,
				kind: "session",
				phase: "start",
				deviceId: serial,
				timestamp: archive.start,
				activityType: SESSION_STARTED_TYPE,
				archive,
			});
		}

		if (archive.end) {
			items.push({
				id: `archive:${serial}:${archive.id}:end`,
				kind: "session",
				phase: "end",
				deviceId: serial,
				timestamp: archive.end,
				activityType: SESSION_ENDED_TYPE,
				archive,
			});
		}
	}

	return mergeItemsById(items);
}

export function mergeActivityItems(
	...groups: ReadonlyArray<ReadonlyArray<ActivityItem>>
): ActivityItem[] {
	return mergeItemsById(...groups);
}
