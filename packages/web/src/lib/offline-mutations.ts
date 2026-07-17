import type {
	Alarm,
	AlarmSetOptions,
	AlarmThresholdOptions,
	Device,
	DeviceChannel,
} from "thermoworks-sdk";
import type { ThermoworksWebClient } from "./api.ts";

const DB_NAME = "thermoworks";
const DB_VERSION = 2;
const DEVICES_STORE_NAME = "devices";
const STORE_NAME = "mutationOutbox";
const OUTBOX_CHANGED_EVENT = "thermoworks:mutation-outbox-changed";

type QueuedMutationStatus = "pending" | "conflict";
type QueuedMutationType = "setAlarm" | "startSession" | "endSession";

interface ExpectedAlarmState {
	readonly high: ExpectedAlarmThreshold | null;
	readonly low: ExpectedAlarmThreshold | null;
}

interface ExpectedAlarmThreshold {
	readonly enabled: boolean;
	readonly value: number | null;
	readonly units: string | null;
}

interface ExpectedSessionState {
	readonly active: boolean;
}

interface BaseQueuedMutation {
	readonly id: string;
	readonly type: QueuedMutationType;
	readonly serial: string;
	readonly createdAt: number;
	readonly status: QueuedMutationStatus;
	readonly conflictReason?: string;
}

export interface QueuedAlarmMutation extends BaseQueuedMutation {
	readonly type: "setAlarm";
	readonly channel: number;
	readonly config: AlarmSetOptions;
	readonly expected: ExpectedAlarmState;
}

export interface QueuedStartSessionMutation extends BaseQueuedMutation {
	readonly type: "startSession";
	readonly label?: string;
	readonly expected: ExpectedSessionState;
}

export interface QueuedEndSessionMutation extends BaseQueuedMutation {
	readonly type: "endSession";
	readonly expected: ExpectedSessionState;
}

export type QueuedMutation =
	| QueuedAlarmMutation
	| QueuedStartSessionMutation
	| QueuedEndSessionMutation;

export interface OutboxSnapshot {
	readonly pendingCount: number;
	readonly conflictCount: number;
}

export interface ReplayResult {
	readonly replayed: number;
	readonly conflicts: number;
}

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(DEVICES_STORE_NAME)) {
				db.createObjectStore(DEVICES_STORE_NAME);
			}
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: "id" });
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function notifyOutboxChanged(): void {
	if (typeof window !== "undefined") {
		window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT));
	}
}

function makeId(type: QueuedMutationType): string {
	const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "";
	return `${Date.now()}-${type}-${random || Math.random().toString(36).slice(2)}`;
}

function normalizeExpectedAlarm(alarm: Alarm | null | undefined): ExpectedAlarmThreshold | null {
	if (!alarm) return null;
	return {
		enabled: alarm.enabled,
		value: alarm.value,
		units: alarm.units,
	};
}

function normalizeConfiguredAlarm(
	threshold: AlarmThresholdOptions | undefined,
): ExpectedAlarmThreshold | null {
	if (!threshold) return null;
	return {
		enabled: threshold.enabled ?? true,
		value: threshold.value,
		units: threshold.units ?? null,
	};
}

function alarmThresholdsEqual(
	expected: ExpectedAlarmThreshold | null,
	actual: ExpectedAlarmThreshold | null,
): boolean {
	return (
		expected?.enabled === actual?.enabled &&
		expected?.value === actual?.value &&
		expected?.units === actual?.units
	);
}

function alarmStatesEqual(expected: ExpectedAlarmState, actual: ExpectedAlarmState): boolean {
	return (
		alarmThresholdsEqual(expected.high, actual.high) &&
		alarmThresholdsEqual(expected.low, actual.low)
	);
}

function expectedAlarmStateFromChannel(channel: DeviceChannel): ExpectedAlarmState {
	return {
		high: normalizeExpectedAlarm(channel.alarmHigh),
		low: normalizeExpectedAlarm(channel.alarmLow),
	};
}

function expectedAlarmThresholdFromCurrent(
	enabled: boolean,
	value: number | null,
	units: string,
): ExpectedAlarmThreshold | null {
	if (!enabled && value == null) return null;
	return { enabled, value, units };
}

function configuredAlarmState(
	config: AlarmSetOptions,
	fallback: ExpectedAlarmState,
): ExpectedAlarmState {
	return {
		high: config.high ? normalizeConfiguredAlarm(config.high) : fallback.high,
		low: config.low ? normalizeConfiguredAlarm(config.low) : fallback.low,
	};
}

async function writeMutation(mutation: QueuedMutation): Promise<void> {
	const db = await openDB();
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		tx.objectStore(STORE_NAME).put(mutation);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
	db.close();
	notifyOutboxChanged();
}

async function deleteMutation(id: string): Promise<void> {
	const db = await openDB();
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		tx.objectStore(STORE_NAME).delete(id);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
	db.close();
	notifyOutboxChanged();
}

async function getAllMutations(): Promise<QueuedMutation[]> {
	const db = await openDB();
	const mutations = await new Promise<QueuedMutation[]>((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readonly");
		const request = tx.objectStore(STORE_NAME).getAll();
		request.onsuccess = () => resolve(request.result as QueuedMutation[]);
		request.onerror = () => reject(request.error);
	});
	db.close();
	return mutations.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export async function enqueueAlarmMutation(args: {
	readonly serial: string;
	readonly channel: number;
	readonly config: AlarmSetOptions;
	readonly currentHighValue: number | null;
	readonly currentHighEnabled: boolean;
	readonly currentLowValue: number | null;
	readonly currentLowEnabled: boolean;
	readonly channelUnits: string;
}): Promise<void> {
	await writeMutation({
		id: makeId("setAlarm"),
		type: "setAlarm",
		serial: args.serial,
		channel: args.channel,
		config: args.config,
		expected: {
			high: expectedAlarmThresholdFromCurrent(
				args.currentHighEnabled,
				args.currentHighValue,
				args.channelUnits,
			),
			low: expectedAlarmThresholdFromCurrent(
				args.currentLowEnabled,
				args.currentLowValue,
				args.channelUnits,
			),
		},
		createdAt: Date.now(),
		status: "pending",
	});
}

export async function enqueueStartSessionMutation(args: {
	readonly serial: string;
	readonly label?: string;
	readonly wasActive: boolean;
}): Promise<void> {
	await writeMutation({
		id: makeId("startSession"),
		type: "startSession",
		serial: args.serial,
		label: args.label,
		expected: { active: args.wasActive },
		createdAt: Date.now(),
		status: "pending",
	});
}

export async function enqueueEndSessionMutation(args: {
	readonly serial: string;
	readonly wasActive: boolean;
}): Promise<void> {
	await writeMutation({
		id: makeId("endSession"),
		type: "endSession",
		serial: args.serial,
		expected: { active: args.wasActive },
		createdAt: Date.now(),
		status: "pending",
	});
}

export async function getOutboxSnapshot(): Promise<OutboxSnapshot> {
	const mutations = await getAllMutations();
	return {
		pendingCount: mutations.filter((mutation) => mutation.status === "pending").length,
		conflictCount: mutations.filter((mutation) => mutation.status === "conflict").length,
	};
}

export function subscribeToOutboxChanges(listener: () => void): () => void {
	window.addEventListener(OUTBOX_CHANGED_EVENT, listener);
	return () => window.removeEventListener(OUTBOX_CHANGED_EVENT, listener);
}

async function markConflict(mutation: QueuedMutation, conflictReason: string): Promise<void> {
	await writeMutation({ ...mutation, status: "conflict", conflictReason });
}

async function replayAlarmMutation(
	client: ThermoworksWebClient,
	mutation: QueuedAlarmMutation,
): Promise<"replayed" | "conflict"> {
	const channel = await client.getDeviceChannel(mutation.serial, mutation.channel);
	const actual = channel
		? expectedAlarmStateFromChannel(channel)
		: configuredAlarmState(mutation.config, mutation.expected);
	if (!alarmStatesEqual(mutation.expected, actual)) {
		await markConflict(
			mutation,
			"Alarm settings changed while offline. Review the current device values, then save again online.",
		);
		return "conflict";
	}
	await client.setAlarm(mutation.serial, mutation.channel, mutation.config);
	await deleteMutation(mutation.id);
	return "replayed";
}

async function replaySessionMutation(
	client: ThermoworksWebClient,
	mutation: QueuedStartSessionMutation | QueuedEndSessionMutation,
): Promise<"replayed" | "conflict"> {
	const device = await client.getDevice(mutation.serial);
	const actualActive = (device as Device | null)?.sessionStart != null;
	if (actualActive !== mutation.expected.active) {
		await markConflict(
			mutation,
			"Session state changed while offline. Review the device session, then start or stop again online.",
		);
		return "conflict";
	}
	if (mutation.type === "startSession") {
		await client.startSession(mutation.serial, mutation.label);
	} else {
		await client.endSession(mutation.serial);
	}
	await deleteMutation(mutation.id);
	return "replayed";
}

export async function replayQueuedMutations(client: ThermoworksWebClient): Promise<ReplayResult> {
	let replayed = 0;
	let conflicts = 0;
	const mutations = (await getAllMutations()).filter((mutation) => mutation.status === "pending");

	for (const mutation of mutations) {
		const result =
			mutation.type === "setAlarm"
				? await replayAlarmMutation(client, mutation)
				: await replaySessionMutation(client, mutation);
		if (result === "conflict") {
			conflicts += 1;
		} else {
			replayed += 1;
		}
	}

	return { replayed, conflicts };
}
