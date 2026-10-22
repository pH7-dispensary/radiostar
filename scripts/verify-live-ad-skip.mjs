// Explicit live verification. --start incurs one bounded text-analysis request
// for original evaluation content; --play creates/revokes its own QA enrolment.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { verifyAwsIdentity } from "./aws-account-guard.mjs";
import { adSkipFixture } from "../ad-skip-fixture.mjs";
verifyAwsIdentity();
const connection = JSON.parse(readFileSync(".starcast/cloud-connection.json"));
const admin = JSON.parse(readFileSync(".starcast/cloud-admin.json"));
assert.equal(connection.url, "https://d3ri12f40b85i3.cloudfront.net");
const headers = { "content-type": "application/json", "x-star-cast-dev-token": connection.token, "x-star-cast-admin-token": admin.token };
async function api(path, input, auth = headers) {
  const r = await fetch(connection.url + path, { method: input ? "POST" : "GET", headers: auth, ...(input ? { body: JSON.stringify(input) } : {}), signal: AbortSignal.timeout(60000) });
  const d = await r.json(); if (!r.ok) throw Error(`${path}: ${r.status}: ${d.error || "Request failed"}`); return d;
}
const identity = { feedUrl: connection.url + adSkipFixture.feedPath, episodeId: adSkipFixture.episodeId };
const audioUrl = connection.url + adSkipFixture.audioPath;
const mode = await api("/api/admin/intelligence/testing");
assert(mode.configuration.active); assert.equal(mode.configuration.listenerIds.length, 1);
assert.deepEqual(mode.limits, { dailyUsd: 25, monthlyUsd: 125, dailyTranscriptionSeconds: 54000, maxEpisodeSeconds: 14400 });
async function configure(listenerIds, reason) {
  const c = (await api("/api/admin/intelligence/testing")).configuration;
  assert.equal(c.expiresAt, mode.configuration.expiresAt, "Never extend testing expiry");
  return api("/api/admin/intelligence/testing", { enabled: true, adSkipPilotEnabled: true, listenerIds, expiresAt: c.expiresAt, expectedVersion: c.version, confirmation: "ENABLE TESTING", reason });
}
if (process.argv.includes("--start")) {
  await configure(mode.configuration.listenerIds, "User-authorised verified Ad Skip pilot for the existing tester. Preserve expiry and spending caps.");
  const result = await api("/api/admin/intelligence/testing/prepare", { ...identity, listenerId: mode.configuration.listenerIds[0] });
  console.log(JSON.stringify({ state: result.status?.state, code: result.status?.code, reason: result.status?.reason, jobId: result.status?.jobId }));
} else if (process.argv.includes("--play")) {
  const { chromium } = await import(process.env.RADIOSTAR_PLAYWRIGHT_MODULE);
  const invite = await api("/api/admin/pilot/invites", { label: "Owned Ad Skip evaluation — temporary QA", maxUses: 1, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const enrollment = await api("/api/pilot/enroll", { code: invite.code }, { "content-type": "application/json" });
  const credential = randomBytes(32).toString("hex");
  const auth = { "content-type": "application/json", "x-star-cast-pilot-token": enrollment.token, authorization: `Bearer ${credential}` };
  let browser, server, listenerId;
  try {
    await api("/api/listener/register", { credential }, auth);
    const deviceId = createHash("sha256").update(enrollment.token).digest("hex");
    listenerId = (await api("/api/admin/pilot/invites")).devices.find(row => row.id === deviceId)?.listenerId;
    assert(listenerId, "Expected authenticated listener identifier");
    await configure([...mode.configuration.listenerIds, listenerId], "Temporary controlled-fixture playback QA; enrolment is revoked and tester list restored in finally.");
    await api("/api/listener/preferences", { adSkipEnabled: true, advert: true }, auth);
    const manifest = adSkipFixture.manifest();
    const input = { ...identity, audioUrl, audioVariantFingerprint: manifest.audioContentHash };
    const status = await api("/api/skips/status", input, auth);
    assert(status.automaticSkipping); assert.equal(status.activeIntervals.length, 1);
    const mismatch = await api("/api/skips/status", { ...input, audioVariantFingerprint: "0".repeat(64) }, auth);
    assert.equal(mismatch.automaticSkipping, false);
    const audio = Buffer.from(await (await fetch(audioUrl)).arrayBuffer());
    assert.equal(createHash("sha256").update(audio).digest("hex"), manifest.audioContentHash);
    server = createServer((req, res) => {
      if (req.url === "/adapter.mjs") { res.setHeader("content-type", "text/javascript"); return res.end(readFileSync("native/src/adSkipExecution.mjs")); }
      if (req.url === "/audio.mp3") { res.setHeader("content-type", "audio/mpeg"); return res.end(audio); }
      res.setHeader("content-type", "text/html"); res.end('<title>Radio Star owned audio verification</title><audio controls></audio>');
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
    const page = await browser.newPage();
    // Credentials never enter the browser. Only the fresh lease crosses here.
    await page.exposeFunction("authorise", row => api("/api/skips/authorise", { ...input, ...row }, auth));
    await page.exposeFunction("receipt", row => api("/api/skips/events", { ...input, eventId: randomUUID(), ...row }, auth));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const playback = await page.evaluate(async ({ interval, expectedHash }) => {
      const { executeVerifiedSkip } = await import("/adapter.mjs");
      const bytes = await (await fetch("/audio.mp3")).arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), n => n.toString(16).padStart(2, "0")).join("");
      if (hash !== expectedHash) throw Error("Played bytes differ from verified bytes");
      const audio = document.querySelector("audio");
      audio.src = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
      await new Promise((resolve, reject) => { audio.onloadedmetadata = resolve; audio.onerror = reject; });
      const seek = target => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error("Seek timed out")), 3000);
        audio.addEventListener("seeked", () => { clearTimeout(timer); resolve(audio.currentTime * 1000); }, { once: true });
        audio.currentTime = target / 1000;
      });
      await seek(interval.startMs - 300);
      await audio.play();
      await new Promise(resolve => { const tick = () => audio.currentTime * 1000 >= interval.startMs ? resolve() : setTimeout(tick, 10); tick(); });
      const before = audio.currentTime * 1000;
      const result = await executeVerifiedSkip({ interval, positionMs: before, durationMs: audio.duration * 1000, current: () => !audio.paused, authorise: window.authorise, seek });
      await window.receipt({ intervalId: interval.id, kind: "automatic_skip", positionMs: result.positionMs, authorisationId: result.lease.authorisationId });
      const restored = await result.undo();
      await window.receipt({ intervalId: interval.id, kind: "undo", positionMs: restored, authorisationId: result.lease.authorisationId });
      audio.pause();
      return { before, seekDestination: result.positionMs, restored, durationMs: result.durationMs, mediaDurationMs: audio.duration * 1000, fingerprint: hash };
    }, { interval: status.activeIntervals[0], expectedHash: manifest.audioContentHash });
    assert(playback.seekDestination <= manifest.advert.endMs);
    assert(Math.abs(playback.restored - playback.before) <= 350);
    const result = { at: new Date().toISOString(), evaluation: "owned synthetic audio; real browser media, shared native adapter, live authenticated AWS APIs", identity, interval: status.activeIntervals[0], playback, mismatchDenied: true, physicalIphoneVerified: false };
    writeFileSync(".starcast/live-ad-skip-evidence.json", JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(result));
  } finally {
    await browser?.close(); if (server) await new Promise(resolve => server.close(resolve));
    await configure(mode.configuration.listenerIds, "Restore primary tester only after controlled Ad Skip playback QA.");
    await api("/api/admin/pilot/devices/revoke", { deviceId: createHash("sha256").update(enrollment.token).digest("hex") });
  }
} else {
  const status = (await api("/api/intelligence/status?" + new URLSearchParams(identity))).status;
  const operations = await api("/api/admin/ad-skip");
  const ledger = await api("/api/admin/intelligence");
  console.log(JSON.stringify({ state: status.state, code: status.code, reason: status.reason, jobId: status.jobId, brief: status.brief?.overview, chapters: status.chapters?.length, topics: status.brief?.themes?.length, adSkip: operations, usage: ledger.usage.filter(row => row.id.startsWith(status.jobId + ":")), totals: ledger.totals, reservations: ledger.reservations.length }));
}
