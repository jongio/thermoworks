// test/smoke.test.mjs — boots this canvas's runtime over HTTP and exercises its
// cook actions. Run from the canvas folder:  node test/smoke.test.mjs
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const home = await mkdtemp(join(tmpdir(), "thermoworks-canvas-smoke-"));
process.env.COPILOT_HOME = home;

// Inject a fake ThermoWorks SDK so live-mode auth + device picker can be
// exercised without a real install, network, or login.
const here = dirname(fileURLToPath(import.meta.url));
process.env.THERMOWORKS_SDK_PATH = join(here, "fake-sdk.mjs");
// Make sure no ambient env creds leak in (the keychain/env probe must see none).
delete process.env.THERMOWORKS_EMAIL;
delete process.env.THERMOWORKS_PASSWORD;

const { canvasConfig } = await import("../canvas.mjs");
const { createCanvasRuntime } = await import("../canvas-kit/server.mjs");
const runtime = createCanvasRuntime(canvasConfig);
// Wire fake host capabilities so ask_coach and open_terminal_login work offline.
let lastAgentPrompt = null;
runtime.setHost({
  ai: async (q) => `Smokey says: looks great! (prompt was ${String(q).length} chars)`,
  askAgent: async (prompt) => {
    lastAgentPrompt = String(prompt);
    return { ok: true };
  },
});

let passed = 0;
async function test(label, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${label}`);
  } catch (e) {
    console.error(`FAIL  ${label}\n      ${e.message}`);
    process.exitCode = 1;
    throw e;
  }
}
const post = (url, actionName, input) =>
  fetch(new URL("/action", url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actionName, input }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
const getState = (url) => fetch(new URL("/state", url)).then((r) => r.json());

try {
  const open = await runtime.openInstance({
    instanceId: "smoke",
    input: {},
    ctx: { instanceId: "smoke", input: {} },
  });
  await test("opens on a loopback url", () =>
    assert.match(open.url, /^http:\/\/127\.0\.0\.1:\d+\/$/));

  await test("initial state is a seeded demo brisket cook", async () => {
    const s = await getState(open.url);
    assert.equal(s.mode, "demo");
    assert.ok(Array.isArray(s.channels) && s.channels.length >= 2, "has channels");
    const pit = s.channels.find((c) => c.kind === "pit");
    assert.ok(pit, "has a pit channel");
    assert.ok(pit.history.length > 5, "pit has seeded history");
    assert.ok(pit.value != null, "pit has a current value");
    const meat = s.channels.find((c) => c.kind === "meat");
    assert.ok(meat.history.length > 5, "meat has seeded history");
  });

  await test("refresh advances the demo simulator", async () => {
    const before = await getState(open.url);
    const { body } = await post(open.url, "refresh", {});
    assert.equal(body.ok, true);
    assert.equal(body.result.mode, "demo");
    const after = await getState(open.url);
    assert.ok(after.elapsedMin > before.elapsedMin, "elapsed advanced");
    const pit = after.channels.find((c) => c.kind === "pit");
    const pitBefore = before.channels.find((c) => c.kind === "pit");
    assert.ok(pit.history.length >= pitBefore.history.length, "pit history grew");
  });

  await test("set_pit_target updates the pit channel", async () => {
    await post(open.url, "set_pit_target", { value: 275 });
    const s = await getState(open.url);
    assert.equal(s.pitTarget, 275);
    assert.equal(s.channels.find((c) => c.kind === "pit").target, 275);
  });

  await test("set_probe_target updates a meat probe", async () => {
    const s0 = await getState(open.url);
    const meat = s0.channels.find((c) => c.kind === "meat");
    await post(open.url, "set_probe_target", { id: meat.id, value: 207 });
    const s1 = await getState(open.url);
    assert.equal(s1.channels.find((c) => c.id === meat.id).target, 207);
  });

  await test("add_probe backfills history and remove_probe drops it", async () => {
    const { body } = await post(open.url, "add_probe", { name: "Test Probe", target: 165 });
    assert.equal(body.ok, true);
    const id = body.result.id;
    let s = await getState(open.url);
    const added = s.channels.find((c) => c.id === id);
    assert.ok(added && added.history.length > 5, "new probe has backfilled history");
    await post(open.url, "remove_probe", { id });
    s = await getState(open.url);
    assert.ok(!s.channels.find((c) => c.id === id), "probe removed");
  });

  await test("start_cook with a preset resets the cook", async () => {
    const { body } = await post(open.url, "start_cook", { preset: "chicken", name: "Test Birds" });
    assert.equal(body.ok, true);
    const s = await getState(open.url);
    assert.equal(s.preset, "chicken");
    assert.equal(s.cookName, "Test Birds");
    assert.ok(s.channels.some((c) => c.name === "Chicken Breast"));
  });

  await test("summary returns agent text", async () => {
    const { body } = await post(open.url, "summary", {});
    assert.equal(body.ok, true);
    assert.equal(typeof body.result.summary, "string");
    assert.ok(body.result.summary.includes("Cook"));
  });

  await test("ask_coach appends a user + coach message pair", async () => {
    const { body } = await post(open.url, "ask_coach", { question: "How's my cook?" });
    assert.equal(body.ok, true);
    assert.ok(typeof body.result.answer === "string" && body.result.answer.length > 0);
    const s = await getState(open.url);
    assert.ok(s.chat.length >= 2, "two messages added");
    assert.equal(s.chat[s.chat.length - 2].role, "user");
    assert.equal(s.chat[s.chat.length - 1].role, "coach");
  });

  await test("clear_chat empties the conversation", async () => {
    await post(open.url, "clear_chat", {});
    const s = await getState(open.url);
    assert.deepEqual(s.chat, []);
  });

  await test("set_mode live enters a 'checking' auth state with no channels", async () => {
    const { body } = await post(open.url, "set_mode", { mode: "live" });
    assert.equal(body.ok, true);
    const s = await getState(open.url);
    assert.equal(s.mode, "live");
    assert.deepEqual(s.channels, []);
    assert.equal(s.liveStatus, "checking");
  });

  await test("connect_live with no creds → needs_auth (shows sign-in form)", async () => {
    const { body } = await post(open.url, "connect_live", {});
    assert.equal(body.ok, true);
    assert.equal(body.result.authed, false);
    const s = await getState(open.url);
    assert.equal(s.liveStatus, "needs_auth");
  });

  await test("refresh is skipped while not authed (no network hammering)", async () => {
    const { body } = await post(open.url, "refresh", {});
    assert.equal(body.ok, true);
    assert.equal(body.result.skipped, true);
  });

  await test("sign_in with wrong creds → needs_auth + error", async () => {
    const { body } = await post(open.url, "sign_in", { email: "bad@x.com", password: "nope" });
    assert.equal(body.ok, true);
    assert.equal(body.result.ok, false);
    const s = await getState(open.url);
    assert.equal(s.liveStatus, "needs_auth");
    assert.ok(s.error, "an error message is surfaced");
    assert.equal(s.liveEmail, "bad@x.com", "email is remembered for re-entry");
  });

  await test("sign_in with valid creds → authed + live channels + device list", async () => {
    const { body } = await post(open.url, "sign_in", { email: "good@x.com", password: "secret" });
    assert.equal(body.ok, true);
    assert.equal(body.result.ok, true);
    const s = await getState(open.url);
    assert.equal(s.liveStatus, "authed");
    assert.equal(s.liveEmail, "good@x.com");
    assert.equal(s.liveDevices.length, 2, "both devices listed for the picker");
    assert.equal(s.selectedSerial, "all");
    assert.ok(s.channels.find((c) => c.kind === "pit"), "pit channel mapped");
    assert.ok(s.channels.find((c) => /Brisket/.test(c.name)), "a brisket channel mapped");
    // Password must never be persisted into shared state, nor returned to the agent.
    assert.ok(!JSON.stringify(s).includes("secret"), "password is not in state");
    assert.ok(!JSON.stringify(body.result).includes("secret"), "password is not in the action result");
  });

  await test("select_device narrows the view to one session", async () => {
    const { body } = await post(open.url, "select_device", { serial: "ABC123" });
    assert.equal(body.ok, true);
    const s = await getState(open.url);
    assert.equal(s.selectedSerial, "ABC123");
    assert.ok(s.channels.length >= 1, "channels loaded for the selected device");
    assert.ok(s.channels.every((c) => c.id.startsWith("ABC123:")), "only the selected device's channels");
    assert.equal(s.cookName, "Sunday Brisket", "cook name follows the session label");
  });

  await test("select_device 'all' shows every device again", async () => {
    await post(open.url, "select_device", { serial: "all" });
    const s = await getState(open.url);
    assert.equal(s.selectedSerial, "all");
    const serials = new Set(s.channels.map((c) => c.id.split(":")[0]));
    assert.ok(serials.has("ABC123") && serials.has("XYZ789"), "channels from both devices");
  });

  await test("refresh while authed fetches live data", async () => {
    const { body } = await post(open.url, "refresh", {});
    assert.equal(body.ok, true);
    assert.equal(body.result.mode, "live");
    assert.ok(body.result.devices >= 1);
    // Credential-non-persistence invariant still holds after a live refresh.
    const s = await getState(open.url);
    assert.ok(!JSON.stringify(s).includes("secret"), "password is not in state after refresh");
    assert.ok(!JSON.stringify(body.result).includes("secret"), "password is not in refresh result");
  });

  await test("live pit channel is never flagged done", async () => {
    const s = await getState(open.url);
    const pit = s.channels.find((c) => c.kind === "pit");
    assert.ok(pit, "has a pit channel");
    assert.equal(pit.done, false, "pit at/above setpoint is not 'done'");
  });

  await test("open_terminal_login hands the agent a login prompt", async () => {
    const { body } = await post(open.url, "open_terminal_login", {});
    assert.equal(body.ok, true);
    assert.equal(body.result.ok, true);
    assert.ok(lastAgentPrompt && /auth login/.test(lastAgentPrompt), "agent asked to run auth login");
  });

  await test("sign_out forgets creds and shows the form again", async () => {
    const { body } = await post(open.url, "sign_out", {});
    assert.equal(body.ok, true);
    const s = await getState(open.url);
    assert.equal(s.liveStatus, "needs_auth");
    assert.deepEqual(s.channels, []);
  });

  await test("set_mode demo re-seeds a fresh demo cook", async () => {
    await post(open.url, "set_mode", { mode: "demo" });
    const s = await getState(open.url);
    assert.equal(s.mode, "demo");
    assert.ok(s.channels.length >= 2);
  });

  await test("start_cook preserves chat and auto-refresh across a preset change", async () => {
    // In demo mode: set a distinctive auto-refresh, add a chat message, then
    // change preset — chat and the interval must survive (not be wiped).
    await post(open.url, "set_auto_refresh", { seconds: 30 });
    await post(open.url, "ask_coach", { question: "carryover check" });
    await post(open.url, "start_cook", { preset: "ribs" });
    const s = await getState(open.url);
    assert.equal(s.preset, "ribs");
    assert.equal(s.autoRefreshSec, 30, "auto-refresh interval preserved");
    assert.ok(s.chat.length >= 2, "pit-master chat preserved across preset change");
  });

  await test("unknown action returns a 400 envelope", async () => {
    const { status, body } = await post(open.url, "not_an_action", {});
    assert.equal(status, 400);
    assert.equal(body.ok, false);
  });
} finally {
  await runtime.shutdown();
  await rm(home, { recursive: true, force: true });
}

console.log(`\n${passed} checks passed`);
