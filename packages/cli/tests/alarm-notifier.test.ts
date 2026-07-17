import { describe, expect, it, vi } from "vitest";

import {
	type AlarmEvent,
	AlarmNotifier,
	type AlarmSink,
	alarmKey,
	buildDiscordPayload,
	buildGenericPayload,
	buildPayload,
	buildSlackPayload,
	detectWebhookFormat,
	retryWithBackoff,
	WebhookSink,
} from "../src/commands/alarm-notifier.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeAlarmEvent(overrides: Partial<AlarmEvent> = {}): AlarmEvent {
	return {
		device: overrides.device ?? "Smoker",
		channel: overrides.channel ?? "Pit",
		value: overrides.value ?? 275,
		units: overrides.units ?? "F",
		threshold: overrides.threshold ?? 250,
		alarmType: overrides.alarmType ?? "high",
		timestamp: overrides.timestamp ?? "2025-07-01T12:00:00.000Z",
	};
}

// ---------------------------------------------------------------------------
// detectWebhookFormat
// ---------------------------------------------------------------------------

describe("detectWebhookFormat", () => {
	it("detects Slack from hooks.slack.com URLs", () => {
		expect(detectWebhookFormat("https://hooks.slack.com/services/T00/B00/xxx")).toBe("slack");
	});

	it("detects Slack from api.slack.com URLs", () => {
		expect(detectWebhookFormat("https://api.slack.com/webhooks/123")).toBe("slack");
	});

	it("detects Discord from discord.com URLs", () => {
		expect(detectWebhookFormat("https://discord.com/api/webhooks/123/token")).toBe("discord");
	});

	it("detects Discord from discordapp.com URLs", () => {
		expect(detectWebhookFormat("https://discordapp.com/api/webhooks/123/token")).toBe("discord");
	});

	it("returns generic for unknown URLs", () => {
		expect(detectWebhookFormat("https://example.com/webhook")).toBe("generic");
	});

	it("returns generic for invalid URLs", () => {
		expect(detectWebhookFormat("not-a-url")).toBe("generic");
	});
});

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

describe("buildGenericPayload", () => {
	it("includes all alarm event fields", () => {
		const event = makeAlarmEvent();
		const payload = buildGenericPayload(event) as Record<string, unknown>;

		expect(payload.event).toBe("alarm");
		expect(payload.device).toBe("Smoker");
		expect(payload.channel).toBe("Pit");
		expect(payload.value).toBe(275);
		expect(payload.units).toBe("F");
		expect(payload.threshold).toBe(250);
		expect(payload.alarmType).toBe("high");
		expect(payload.timestamp).toBe("2025-07-01T12:00:00.000Z");
	});
});

describe("buildSlackPayload", () => {
	it("builds a Slack Block Kit message with text and blocks", () => {
		const event = makeAlarmEvent();
		const payload = buildSlackPayload(event) as Record<string, unknown>;

		expect(payload).toHaveProperty("text");
		expect(payload).toHaveProperty("blocks");
		expect(typeof payload.text).toBe("string");
		expect(payload.text).toContain("Smoker");
		expect(payload.text).toContain("Pit");
		expect(payload.text).toContain("275");
		expect(payload.text).toContain("above");
	});

	it("uses 'below' for low alarms", () => {
		const event = makeAlarmEvent({ alarmType: "low" });
		const payload = buildSlackPayload(event) as Record<string, unknown>;

		expect(payload.text).toContain("below");
	});
});

describe("buildDiscordPayload", () => {
	it("builds a Discord embed with fields", () => {
		const event = makeAlarmEvent();
		const payload = buildDiscordPayload(event) as Record<string, unknown>;

		expect(payload).toHaveProperty("content");
		expect(payload).toHaveProperty("embeds");
		const embeds = payload.embeds as Array<Record<string, unknown>>;
		expect(embeds).toHaveLength(1);
		expect(embeds[0].color).toBe(0xff4444);
		expect(embeds[0].fields).toBeDefined();
	});

	it("uses blue color for low alarms", () => {
		const event = makeAlarmEvent({ alarmType: "low" });
		const payload = buildDiscordPayload(event) as Record<string, unknown>;

		const embeds = payload.embeds as Array<Record<string, unknown>>;
		expect(embeds[0].color).toBe(0x4488ff);
	});
});

describe("buildPayload", () => {
	it("delegates to the correct builder for each format", () => {
		const event = makeAlarmEvent();

		const generic = buildPayload(event, "generic") as Record<string, unknown>;
		expect(generic.event).toBe("alarm");

		const slack = buildPayload(event, "slack") as Record<string, unknown>;
		expect(slack).toHaveProperty("blocks");

		const discord = buildPayload(event, "discord") as Record<string, unknown>;
		expect(discord).toHaveProperty("embeds");
	});
});

// ---------------------------------------------------------------------------
// retryWithBackoff
// ---------------------------------------------------------------------------

describe("retryWithBackoff", () => {
	it("succeeds on first attempt without retrying", async () => {
		const fn = vi.fn().mockResolvedValue(undefined);
		const sleepFn = vi.fn();

		await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 }, sleepFn);

		expect(fn).toHaveBeenCalledTimes(1);
		expect(sleepFn).not.toHaveBeenCalled();
	});

	it("retries on failure and succeeds on the second attempt", async () => {
		const fn = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce(undefined);
		const sleepFn = vi.fn().mockResolvedValue(undefined);

		await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 }, sleepFn);

		expect(fn).toHaveBeenCalledTimes(2);
		expect(sleepFn).toHaveBeenCalledTimes(1);
		expect(sleepFn).toHaveBeenCalledWith(100);
	});

	it("applies exponential backoff on successive failures", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("1"))
			.mockRejectedValueOnce(new Error("2"))
			.mockResolvedValueOnce(undefined);
		const sleepFn = vi.fn().mockResolvedValue(undefined);

		await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 10000 }, sleepFn);

		expect(sleepFn).toHaveBeenNthCalledWith(1, 100);
		expect(sleepFn).toHaveBeenNthCalledWith(2, 200);
	});

	it("caps delay at maxDelayMs", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("1"))
			.mockRejectedValueOnce(new Error("2"))
			.mockResolvedValueOnce(undefined);
		const sleepFn = vi.fn().mockResolvedValue(undefined);

		await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 5000, maxDelayMs: 6000 }, sleepFn);

		// 5000 * 2^1 = 10000, capped at 6000
		expect(sleepFn).toHaveBeenNthCalledWith(2, 6000);
	});

	it("throws after exhausting all retries", async () => {
		const fn = vi.fn().mockRejectedValue(new Error("persistent failure"));
		const sleepFn = vi.fn().mockResolvedValue(undefined);

		await expect(
			retryWithBackoff(fn, { maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 100 }, sleepFn),
		).rejects.toThrow("persistent failure");

		// 1 initial + 2 retries = 3 total
		expect(fn).toHaveBeenCalledTimes(3);
	});
});

// ---------------------------------------------------------------------------
// WebhookSink
// ---------------------------------------------------------------------------

describe("WebhookSink", () => {
	it("POSTs the correct payload to the URL", async () => {
		const fetchFn = vi.fn().mockResolvedValue({ ok: true });
		const sink = new WebhookSink({
			url: "https://example.com/hook",
			format: "generic",
			fetchFn,
			retry: { maxAttempts: 0, baseDelayMs: 10, maxDelayMs: 100 },
		});

		const event = makeAlarmEvent();
		await sink.send(event);

		expect(fetchFn).toHaveBeenCalledTimes(1);
		const [url, opts] = fetchFn.mock.calls[0];
		expect(url).toBe("https://example.com/hook");
		expect(opts.method).toBe("POST");
		expect(opts.headers["Content-Type"]).toBe("application/json");

		const body = JSON.parse(opts.body as string);
		expect(body.event).toBe("alarm");
		expect(body.device).toBe("Smoker");
	});

	it("auto-detects Slack format from URL", async () => {
		const fetchFn = vi.fn().mockResolvedValue({ ok: true });
		const sink = new WebhookSink({
			url: "https://hooks.slack.com/services/T00/B00/xxx",
			fetchFn,
			retry: { maxAttempts: 0, baseDelayMs: 10, maxDelayMs: 100 },
		});

		expect(sink.name).toBe("webhook-slack");

		await sink.send(makeAlarmEvent());
		const body = JSON.parse(fetchFn.mock.calls[0][1].body as string);
		expect(body).toHaveProperty("blocks");
	});

	it("auto-detects Discord format from URL", async () => {
		const fetchFn = vi.fn().mockResolvedValue({ ok: true });
		const sink = new WebhookSink({
			url: "https://discord.com/api/webhooks/123/token",
			fetchFn,
			retry: { maxAttempts: 0, baseDelayMs: 10, maxDelayMs: 100 },
		});

		expect(sink.name).toBe("webhook-discord");

		await sink.send(makeAlarmEvent());
		const body = JSON.parse(fetchFn.mock.calls[0][1].body as string);
		expect(body).toHaveProperty("embeds");
	});

	it("throws on non-ok HTTP response after retries", async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" });
		const sink = new WebhookSink({
			url: "https://example.com/hook",
			format: "generic",
			fetchFn,
			retry: { maxAttempts: 1, baseDelayMs: 10, maxDelayMs: 100 },
		});

		await expect(sink.send(makeAlarmEvent())).rejects.toThrow("HTTP 500");
	});

	it("respects explicit format override over auto-detection", async () => {
		const fetchFn = vi.fn().mockResolvedValue({ ok: true });
		const sink = new WebhookSink({
			url: "https://hooks.slack.com/services/T00/B00/xxx",
			format: "generic",
			fetchFn,
			retry: { maxAttempts: 0, baseDelayMs: 10, maxDelayMs: 100 },
		});

		expect(sink.name).toBe("webhook-generic");

		await sink.send(makeAlarmEvent());
		const body = JSON.parse(fetchFn.mock.calls[0][1].body as string);
		expect(body.event).toBe("alarm");
		expect(body).not.toHaveProperty("blocks");
	});
});

// ---------------------------------------------------------------------------
// AlarmNotifier
// ---------------------------------------------------------------------------

describe("AlarmNotifier", () => {
	it("reports hasSinks = false when empty", () => {
		const notifier = new AlarmNotifier();
		expect(notifier.hasSinks).toBe(false);
	});

	it("reports hasSinks = true after addSink", () => {
		const notifier = new AlarmNotifier();
		const sink: AlarmSink = { name: "test", send: vi.fn().mockResolvedValue(undefined) };
		notifier.addSink(sink);
		expect(notifier.hasSinks).toBe(true);
	});

	it("dispatches to all registered sinks", async () => {
		const notifier = new AlarmNotifier();
		const sink1: AlarmSink = { name: "s1", send: vi.fn().mockResolvedValue(undefined) };
		const sink2: AlarmSink = { name: "s2", send: vi.fn().mockResolvedValue(undefined) };
		notifier.addSink(sink1);
		notifier.addSink(sink2);

		const event = makeAlarmEvent();
		await notifier.notify(event);

		expect(sink1.send).toHaveBeenCalledWith(event);
		expect(sink2.send).toHaveBeenCalledWith(event);
	});

	it("logs errors from individual sinks without throwing", async () => {
		const logError = vi.fn();
		const notifier = new AlarmNotifier(logError);

		const goodSink: AlarmSink = { name: "good", send: vi.fn().mockResolvedValue(undefined) };
		const badSink: AlarmSink = {
			name: "bad",
			send: vi.fn().mockRejectedValue(new Error("network down")),
		};
		notifier.addSink(goodSink);
		notifier.addSink(badSink);

		const event = makeAlarmEvent();
		await notifier.notify(event);

		expect(goodSink.send).toHaveBeenCalledWith(event);
		expect(logError).toHaveBeenCalledTimes(1);
		expect(logError).toHaveBeenCalledWith(expect.stringContaining("network down"));
		expect(logError).toHaveBeenCalledWith(expect.stringContaining("bad"));
	});

	it("does not throw when all sinks fail", async () => {
		const logError = vi.fn();
		const notifier = new AlarmNotifier(logError);

		const failSink: AlarmSink = {
			name: "fail",
			send: vi.fn().mockRejectedValue(new Error("timeout")),
		};
		notifier.addSink(failSink);

		await expect(notifier.notify(makeAlarmEvent())).resolves.toBeUndefined();
		expect(logError).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// alarmKey
// ---------------------------------------------------------------------------

describe("alarmKey", () => {
	it("builds a key from serial, channel number, and alarm type", () => {
		expect(alarmKey("S1", "1", "high")).toBe("S1:1:high");
	});

	it("defaults null channel number to '0'", () => {
		expect(alarmKey("S1", null, "low")).toBe("S1:0:low");
	});

	it("distinguishes high from low on the same channel", () => {
		expect(alarmKey("S1", "1", "high")).not.toBe(alarmKey("S1", "1", "low"));
	});
});
