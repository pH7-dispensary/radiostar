// Browser verification of the real Expo web export. Every API and audio source
// is intercepted; this script cannot enqueue live work or make paid requests.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const { chromium } = await import(process.env.RADIOSTAR_PLAYWRIGHT_MODULE || "playwright");
const root = resolve(process.env.RADIOSTAR_EXPORT_DIR || ".starcast/phase4-final-export");
const output = resolve(process.env.RADIOSTAR_VISUAL_DIR || ".starcast/phase4-visual");
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const path = resolve(root, "." + new URL(req.url, "http://localhost").pathname);
  if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const file = path === root ? resolve(root, "index.html") : path;
    const body = await readFile(file);
    res.setHeader("content-type", ({ ".html": "text/html", ".js": "application/javascript", ".ttf": "font/ttf", ".png": "image/png" })[extname(file)] || "application/octet-stream");
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const wav = Buffer.alloc(44 + 8000 * 2 * 30);
wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
const source = { episodeId: "ux-fixture", title: "A conversation about thoughtful technology and the future", show: "Radio Star UX fixture", url: "https://fixture.invalid/audio.wav", feedUrl: "https://fixture.invalid/feed.xml" };
const ready = { state: "READY", processing: false, transcriptAvailable: true, availableFeatures: { brief: true, chapters: true, topics: true, moments: true },
  brief: { overview: "A fixture overview grounded in test evidence.", themes: ["Thoughtful technology"], detail: "The fixture explores thoughtful technology." },
  chapters: [{ title: "A thoughtful beginning", description: "The opening discussion.", startMs: 1000, endMs: 10000, sourceSegmentIds: ["s1"] }],
};
const results = [];
try {
  for (const width of [320, 375, 390, 430]) {
    const dark = width === 375 || width === 430;
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: width === 320 ? "reduce" : "no-preference" });
    let status = { state: "ANALYSING", processing: true };
    let statusReads = 0;
    let offline = false;
    let failAudio = false;
    let releaseAudio = null;
    const errors = [];
    await context.addInitScript(({ source, dark }) => {
      localStorage.setItem("star-cast-pilot-token", "local-visual-fixture-only");
      localStorage.setItem("radio-star-launch-v1", "seen");
      localStorage.setItem("star-cast-listener-state-v1", JSON.stringify({ following: [], history: [], saved: [], moments: [], feedEpisodes: {}, followIntelligence: {}, nightMode: dark, onboardingComplete: true, historyEnabled: false, intelligenceEnabled: true, intelligencePreferenceVersion: 2 }));
      localStorage.setItem("star-cast-native-playback-v1", JSON.stringify({ source, snapshot: { positionMs: 3000, speed: 1 } }));
    }, { source, dark });
    await context.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url());
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (url.hostname === "fixture.invalid" && url.pathname === "/audio.wav") {
        if (failAudio) return route.abort();
        if (releaseAudio) await new Promise((done) => { releaseAudio = done; });
        return route.fulfill({ body: wav, contentType: "audio/wav", headers });
      }
      if (url.pathname.startsWith("/api/")) {
        let body = {};
        if (url.pathname === "/api/intelligence/status") {
          statusReads++;
          if (offline) return route.abort();
          body = { status };
        }
        else if (url.pathname === "/api/intelligence/request") throw Error("Visual verification must not start processing");
        else if (url.pathname === "/api/listener/summary") body = { preferences: { adSkipEnabled: false }, monthlyMinutes: 600, remainingMinutes: 600 };
        else if (url.pathname === "/api/skips/status") body = { state: "NO_VERIFIED_INTERVALS", automaticSkipping: false, verifiedCount: 0, intervals: [], activeIntervals: [] };
        else if (url.pathname === "/api/catalogue/search") body = { results: [] };
        else if (url.pathname === "/api/catalogue/feed") body = { feed: { title: "Fixture", episodes: [] } };
        return route.fulfill({ json: body, headers });
      }
      if (url.origin === origin) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await page.getByRole("button", { name: "Open now playing" }).click({ timeout: 20000 });
    const card = page.getByTestId("episode-intelligence-status");
    await card.getByText("Finding the interesting moments.").waitFor();
    assert.equal(await card.count(), 1);
    await card.getByRole("button", { name: "Got it" }).click();
    await card.scrollIntoViewIfNeeded();
    const bounds = await card.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
    const motion = await card.evaluate(async (element) => {
      const sample = () => [...element.querySelectorAll("div")].map((node) => {
        const style = getComputedStyle(node);
        return [style.opacity, style.transform];
      });
      const before = sample();
      await new Promise((done) => setTimeout(done, 200));
      return { before, after: sample(), overflow: element.scrollWidth > element.clientWidth + 1 };
    });
    assert.equal(motion.overflow, false, "status text must not overflow");
    if (width === 320) assert.deepEqual(motion.after, motion.before, "Reduce Motion keeps the mark static");
    else assert.notDeepEqual(motion.after, motion.before, "active analysis has genuine state-driven motion");
    await page.screenshot({ path: `${output}/${width}-${dark ? "dark" : "light"}-preparing.png` });
    await page.getByRole("dialog").getByRole("button", { name: "Play", exact: true }).click();
    status = ready;
    await card.getByText("Your conversation is ready.").waitFor({ timeout: 20000 });
    await page.getByText(ready.brief.overview, { exact: true }).waitFor();
    assert.ok(await page.getByRole("button", { name: "Pause", exact: true }).count(), "READY does not pause playback");
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${width}-${dark ? "dark" : "light"}-ready.png` });
    if (width === 390) {
      const reopen = async () => {
        await page.getByRole("button", { name: "Close player" }).click();
        await page.getByRole("button", { name: "Open now playing" }).click();
      };
      for (const [state, label] of [
        ["CHECKING", "Checking this conversation."], ["QUEUED", "Your episode is getting ready."],
        ["TRANSCRIBING", "Preparing the conversation."], ["INDEXING", "Making everything searchable."],
      ]) {
        status = { state, processing: true };
        await reopen();
        await card.getByText(label, { exact: true }).waitFor();
      }
      status = { state: "UNAVAILABLE", code: "LEGAL_BASIS_NOT_ESTABLISHED", processing: false };
      await reopen();
      await card.getByText("AI insights aren't available for this episode.").waitFor();
      await card.getByRole("button", { name: "What’s happening?" }).click();
      await card.getByText(/hasn't been established/).waitFor();
      assert.equal(await page.getByText("AI insights aren't available for this episode.", { exact: true }).count(), 1);
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/390-light-unavailable.png` });
      status = { state: "BUDGET_PAUSED", code: "BUDGET_LIMIT", processing: false };
      await reopen();
      await card.getByText("Preparation is temporarily paused.").waitFor();
      status = { state: "FAILED", code: "PROCESSING_TIMEOUT", retryEligible: false, processing: false };
      await reopen();
      await card.getByText("Preparation was interrupted.").waitFor();
      assert.equal(await card.getByRole("button", { name: "Try again" }).count(), 0);
      offline = true;
      await reopen();
      await card.getByText("Waiting for a status update.").waitFor();
      offline = false;
      status = ready;
      await card.getByRole("button", { name: "Check status" }).click();
      await card.getByText("Your conversation is ready.").waitFor();
      // Exercise the real load timeout, not a synthetic media error event:
      // Expo's web adapter does not expose native media errors or buffering.
      failAudio = true;
      await page.reload();
      await page.getByRole("button", { name: "Open now playing" }).click();
      await page.getByRole("dialog").getByText("Audio couldn't play. Please try again.", { exact: true }).waitFor();
      failAudio = false;
      releaseAudio = true;
      await page.getByRole("dialog").getByRole("button", { name: "Retry audio", exact: true }).last().click();
      await page.getByRole("dialog").getByText("Connecting to audio.", { exact: true }).waitFor();
      await page.screenshot({ path: `${output}/390-light-audio-connecting.png` });
      // The intercepted audio request has now reached the real Expo player.
      assert.equal(typeof releaseAudio, "function");
      releaseAudio();
      releaseAudio = null;
      await page.getByRole("dialog").getByRole("button", { name: "Pause", exact: true }).waitFor();
      await page.reload();
      await page.getByRole("button", { name: "Open now playing" }).click();
      await page.getByTestId("episode-intelligence-status").getByText("Your conversation is ready.").waitFor();
      assert.equal(await page.getByRole("button", { name: "Got it" }).count(), 0, "contextual introduction stays dismissed after restart");
    }
    assert.deepEqual(errors, []);
    results.push({ width, theme: dark ? "dark" : "light", reducedMotion: width === 320, motionVerified: true, statusReads, readyWithoutRefresh: true, playbackContinued: true });
    await context.close();
  }
  console.log(JSON.stringify({ results, output, liveRequests: 0, physicalDevice: false }, null, 2));
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
