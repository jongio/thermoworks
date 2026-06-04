/**
 * Utilities for parsing Google Firestore REST API document fields
 * into plain JavaScript values.
 */

type FirestoreValue =
	| { stringValue: string }
	| { integerValue: string }
	| { doubleValue: number }
	| { booleanValue: boolean }
	| { timestampValue: string }
	| { nullValue: null }
	| { mapValue: { fields?: Record<string, FirestoreValue> } }
	| { arrayValue: { values?: FirestoreValue[] } };

export type FirestoreFields = Record<string, FirestoreValue>;

/** Extract a string from a Firestore field. */
export function getString(fields: FirestoreFields, key: string): string | null {
	const field = fields[key];
	if (!field) return null;
	if ("stringValue" in field) return field.stringValue;
	return null;
}

/** Extract a number from a Firestore field (handles both integerValue and doubleValue). */
export function getNumber(fields: FirestoreFields, key: string): number | null {
	const field = fields[key];
	if (!field) return null;
	if ("doubleValue" in field) return field.doubleValue;
	if ("integerValue" in field) return Number(field.integerValue);
	return null;
}

/** Extract a boolean from a Firestore field. */
export function getBoolean(fields: FirestoreFields, key: string): boolean | null {
	const field = fields[key];
	if (!field) return null;
	if ("booleanValue" in field) return field.booleanValue;
	return null;
}

/** Extract a Date from a Firestore timestamp field. */
export function getTimestamp(fields: FirestoreFields, key: string): Date | null {
	const field = fields[key];
	if (!field) return null;
	if ("timestampValue" in field) {
		const date = new Date(field.timestampValue);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	return null;
}

/** Extract nested map fields from a Firestore field. */
export function getMapFields(fields: FirestoreFields, key: string): FirestoreFields | null {
	const field = fields[key];
	if (!field) return null;
	if ("mapValue" in field) return field.mapValue.fields ?? null;
	return null;
}
