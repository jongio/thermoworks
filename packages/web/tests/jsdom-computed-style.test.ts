import { describe, expect, it } from "vitest";

/**
 * Regression guard for getComputedStyle() with CSS math functions.
 *
 * jsdom 30.0.0 threw "object null is not iterable" from getComputedStyle() for
 * any CSS math function it couldn't reduce to a plain length, which covers every
 * percentage-plus-length expression. @testing-library/dom calls getComputedStyle
 * on every element during a role query, so one such declaration takes out every
 * query in a file rather than a single assertion. The chart marker components
 * use calc(6% + 1.25rem) for absolute positioning, so this isn't hypothetical.
 *
 * jsdom 30.0.1 fixed it upstream, which retired the local patch this file used
 * to guard. These keep the behaviour pinned so a future jsdom regression fails
 * with a clear cause instead of a cascade of unrelated "unable to find role"
 * errors.
 *
 * Upstream: https://github.com/jsdom/jsdom/issues/4193
 */
describe("getComputedStyle with unresolvable CSS math functions", () => {
	const unresolvable = [
		// Used by TemperatureAnnotationMarkers and TemperatureEventMarkers.
		["top", "calc(6% + 1.25rem)"],
		["top", "calc(100% + 4px)"],
		["width", "calc(100% - 40px)"],
		["width", "min(360px, 100%)"],
		["width", "max(360px, 100%)"],
		["width", "clamp(100px, 50%, 360px)"],
	] as const;

	it.each(unresolvable)("does not throw for %s: %s", (property, value) => {
		const element = document.createElement("div");
		element.style.setProperty(property, value);
		document.body.append(element);

		try {
			expect(() => window.getComputedStyle(element).getPropertyValue(property)).not.toThrow();
		} finally {
			element.remove();
		}
	});

	it("still reduces math functions that resolve to a plain length", () => {
		const element = document.createElement("div");
		element.style.setProperty("width", "calc(8px * 2)");
		document.body.append(element);

		try {
			expect(window.getComputedStyle(element).width).toBe("16px");
		} finally {
			element.remove();
		}
	});
});
