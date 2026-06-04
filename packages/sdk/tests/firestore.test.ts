import { describe, expect, it } from "vitest";
import {
	type FirestoreFields,
	getBoolean,
	getMapFields,
	getNumber,
	getString,
	getTimestamp,
} from "../src/firestore.js";

describe("firestore field parsing", () => {
	describe("getString", () => {
		it("extracts string value", () => {
			const fields: FirestoreFields = { name: { stringValue: "hello" } };
			expect(getString(fields, "name")).toBe("hello");
		});

		it("returns null for missing key", () => {
			const fields: FirestoreFields = {};
			expect(getString(fields, "name")).toBeNull();
		});

		it("returns null for non-string field type", () => {
			const fields: FirestoreFields = { name: { integerValue: "42" } };
			expect(getString(fields, "name")).toBeNull();
		});

		it("handles empty string value", () => {
			const fields: FirestoreFields = { name: { stringValue: "" } };
			expect(getString(fields, "name")).toBe("");
		});
	});

	describe("getNumber", () => {
		it("extracts integer value", () => {
			const fields: FirestoreFields = { count: { integerValue: "42" } };
			expect(getNumber(fields, "count")).toBe(42);
		});

		it("extracts double value", () => {
			const fields: FirestoreFields = { temp: { doubleValue: 72.4 } };
			expect(getNumber(fields, "temp")).toBe(72.4);
		});

		it("returns null for missing key", () => {
			const fields: FirestoreFields = {};
			expect(getNumber(fields, "count")).toBeNull();
		});

		it("returns null for non-number field type", () => {
			const fields: FirestoreFields = { count: { stringValue: "42" } };
			expect(getNumber(fields, "count")).toBeNull();
		});

		it("handles zero integer", () => {
			const fields: FirestoreFields = { count: { integerValue: "0" } };
			expect(getNumber(fields, "count")).toBe(0);
		});

		it("handles negative double", () => {
			const fields: FirestoreFields = { temp: { doubleValue: -2.3 } };
			expect(getNumber(fields, "temp")).toBe(-2.3);
		});
	});

	describe("getBoolean", () => {
		it("extracts true value", () => {
			const fields: FirestoreFields = { active: { booleanValue: true } };
			expect(getBoolean(fields, "active")).toBe(true);
		});

		it("extracts false value", () => {
			const fields: FirestoreFields = { active: { booleanValue: false } };
			expect(getBoolean(fields, "active")).toBe(false);
		});

		it("returns null for missing key", () => {
			const fields: FirestoreFields = {};
			expect(getBoolean(fields, "active")).toBeNull();
		});
	});

	describe("getTimestamp", () => {
		it("parses ISO timestamp", () => {
			const fields: FirestoreFields = {
				created: { timestampValue: "2026-01-15T10:30:00.000Z" },
			};
			const result = getTimestamp(fields, "created");
			expect(result).toBeInstanceOf(Date);
			expect(result?.toISOString()).toBe("2026-01-15T10:30:00.000Z");
		});

		it("returns null for missing key", () => {
			const fields: FirestoreFields = {};
			expect(getTimestamp(fields, "created")).toBeNull();
		});

		it("returns null for invalid timestamp", () => {
			const fields: FirestoreFields = {
				created: { timestampValue: "not-a-date" },
			};
			expect(getTimestamp(fields, "created")).toBeNull();
		});
	});

	describe("getMapFields", () => {
		it("extracts nested map fields", () => {
			const fields: FirestoreFields = {
				alarm: {
					mapValue: {
						fields: {
							enabled: { booleanValue: true },
							value: { integerValue: "200" },
						},
					},
				},
			};
			const result = getMapFields(fields, "alarm");
			expect(result).not.toBeNull();
			if (result) {
				expect(getBoolean(result, "enabled")).toBe(true);
				expect(getNumber(result, "value")).toBe(200);
			}
		});

		it("returns null for missing key", () => {
			const fields: FirestoreFields = {};
			expect(getMapFields(fields, "alarm")).toBeNull();
		});

		it("returns null for map with no fields", () => {
			const fields: FirestoreFields = {
				alarm: { mapValue: {} },
			};
			expect(getMapFields(fields, "alarm")).toBeNull();
		});
	});
});
