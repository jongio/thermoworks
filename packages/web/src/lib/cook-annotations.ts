import type { Archive, ArchiveChannel } from "thermoworks-sdk";
import type { CookAnnotation } from "./cook-report.ts";

const STORAGE_PREFIX = "thermoworks:cook-annotations:v1:";
const MAX_TEXT_LENGTH = 500;

interface StoredAnnotation {
	readonly id: string;
	readonly timestamp: string;
	readonly label: string;
	readonly note?: string;
}

function clampText(value: string): string {
	return value.trim().slice(0, MAX_TEXT_LENGTH);
}

export function annotationStorageKey(sessionId: string): string {
	return `${STORAGE_PREFIX}${sessionId}`;
}

export function normalizeAnnotation(annotation: CookAnnotation): CookAnnotation | null {
	const label = clampText(annotation.label);
	if (!label) return null;
	const timestamp =
		annotation.timestamp instanceof Date ? annotation.timestamp : new Date(annotation.timestamp);
	if (Number.isNaN(timestamp.getTime())) return null;
	const note = annotation.note ? clampText(annotation.note) : undefined;
	return { id: annotation.id, timestamp, label, ...(note ? { note } : {}) };
}

export function loadCookAnnotations(sessionId: string): CookAnnotation[] {
	try {
		const raw = localStorage.getItem(annotationStorageKey(sessionId));
		if (!raw) return [];
		const parsed = JSON.parse(raw) as StoredAnnotation[];
		if (!Array.isArray(parsed)) return [];
		return parsed.flatMap((item) => {
			const normalized = normalizeAnnotation({
				id: String(item.id),
				timestamp: new Date(item.timestamp),
				label: String(item.label ?? ""),
				note: item.note == null ? undefined : String(item.note),
			});
			return normalized ? [normalized] : [];
		});
	} catch {
		return [];
	}
}

export function saveCookAnnotations(
	sessionId: string,
	annotations: readonly CookAnnotation[],
): void {
	const stored = annotations.flatMap((annotation) => {
		const normalized = normalizeAnnotation(annotation);
		if (!normalized) return [];
		return [
			{
				id: normalized.id,
				timestamp: normalized.timestamp.toISOString(),
				label: normalized.label,
				...(normalized.note ? { note: normalized.note } : {}),
			},
		];
	});
	try {
		localStorage.setItem(annotationStorageKey(sessionId), JSON.stringify(stored));
	} catch {
		// Best-effort: ignore quota/availability errors (private mode, storage full),
		// matching loadCookAnnotations which tolerates read failures.
	}
}

interface SerializableReading {
	readonly value: number;
	readonly timestamp: string;
	readonly units: string;
}

interface SerializableChannel extends Omit<ArchiveChannel, "recentReadings"> {
	readonly recentReadings: SerializableReading[];
}

interface SerializableArchive extends Omit<Archive, "start" | "end" | "createdOn" | "channels"> {
	readonly start: string | null;
	readonly end: string | null;
	readonly createdOn: string | null;
	readonly channels: SerializableChannel[] | null;
}

export interface CookReportSharePayload {
	readonly archive: SerializableArchive;
	readonly annotations: StoredAnnotation[];
	readonly targetTemp: number | null;
	readonly targetTolerance: number | null;
}

function serializeChannel(channel: ArchiveChannel): SerializableChannel {
	return {
		...channel,
		recentReadings: channel.recentReadings.map((reading) => ({
			value: reading.value,
			timestamp: reading.timestamp.toISOString(),
			units: reading.units,
		})),
	};
}

export function createCookReportSharePayload(
	archive: Archive,
	annotations: readonly CookAnnotation[],
	targetTemp: number | null,
	targetTolerance: number | null,
): CookReportSharePayload {
	return {
		archive: {
			...archive,
			start: archive.start?.toISOString() ?? null,
			end: archive.end?.toISOString() ?? null,
			createdOn: archive.createdOn?.toISOString() ?? null,
			channels: archive.channels?.map(serializeChannel) ?? null,
		},
		annotations: annotations.flatMap((annotation) => {
			const normalized = normalizeAnnotation(annotation);
			if (!normalized) return [];
			return [
				{
					id: normalized.id,
					timestamp: normalized.timestamp.toISOString(),
					label: normalized.label,
					...(normalized.note ? { note: normalized.note } : {}),
				},
			];
		}),
		targetTemp,
		targetTolerance,
	};
}

export function parseCookReportSharePayload(payload: CookReportSharePayload): {
	archive: Archive;
	annotations: CookAnnotation[];
	targetTemp: number | null;
	targetTolerance: number | null;
} {
	return {
		archive: {
			...payload.archive,
			start: payload.archive.start ? new Date(payload.archive.start) : null,
			end: payload.archive.end ? new Date(payload.archive.end) : null,
			createdOn: payload.archive.createdOn ? new Date(payload.archive.createdOn) : null,
			channels:
				payload.archive.channels?.map((channel) => ({
					...channel,
					recentReadings: channel.recentReadings.map((reading) => ({
						...reading,
						timestamp: new Date(reading.timestamp),
					})),
				})) ?? null,
		},
		annotations: payload.annotations.flatMap((annotation) => {
			const normalized = normalizeAnnotation({
				id: annotation.id,
				timestamp: new Date(annotation.timestamp),
				label: annotation.label,
				note: annotation.note,
			});
			return normalized ? [normalized] : [];
		}),
		targetTemp: payload.targetTemp,
		targetTolerance: payload.targetTolerance,
	};
}

export function encodeCookReportPayload(payload: CookReportSharePayload): string {
	const json = JSON.stringify(payload);
	const bytes = new TextEncoder().encode(json);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeCookReportPayload(encoded: string): CookReportSharePayload {
	const padded = encoded
		.replaceAll("-", "+")
		.replaceAll("_", "/")
		.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
	const binary = atob(padded);
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	return JSON.parse(new TextDecoder().decode(bytes)) as CookReportSharePayload;
}
