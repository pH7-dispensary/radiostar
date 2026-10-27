// Real Expo web UI and audio, isolated fixtures. No live API/model requests.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = await import(
  process.env.RADIOSTAR_PLAYWRIGHT_MODULE || "playwright"
);
const repository = fileURLToPath(new URL("../", import.meta.url));
const root = resolve(
  repository,
  process.env.RADIOSTAR_EXPORT_DIR || ".starcast/phase5-web",
);
const output = resolve(repository, ".starcast/phase5-visual");
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const path = resolve(
    root,
    "." + new URL(req.url, "http://localhost").pathname,
  );
  if (path !== root && !path.startsWith(root + sep))
    return res.writeHead(403).end();
  try {
    const file = path === root ? resolve(root, "index.html") : path;
    res.setHeader(
      "content-type",
      {
        ".html": "text/html",
        ".js": "application/javascript",
        ".ttf": "font/ttf",
        ".png": "image/png",
      }[extname(file)] || "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const wav = Buffer.alloc(44 + 8000 * 2 * 600);
wav.write("RIFF", 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(wav.length - 44, 40);
const source = {
  episodeId: "sleep-fixture",
  title: "Thoughtful technology",
  show: "Radio Star test podcast",
  url: "https://fixture.invalid/audio.wav",
  feedUrl: "https://fixture.invalid/feed.xml",
};
const show = {
  id: "fixture-show",
  name: source.show,
  publisher: "Test publisher",
  topic: "Technology",
  feedUrl: source.feedUrl,
};
const episode = {
  id: source.episodeId,
  title: source.title,
  audioUrl: source.url,
  publishedAt: new Date(Date.now() - 86400000).toISOString(),
  duration: "10:00",
};
const results = [];
let activePage;
try {
  for (const width of [320, 375, 390, 430]) {
    const dark = width === 375 || width === 430;
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: width === 320 ? "reduce" : "no-preference",
    });
    let catalogueRequests = 0,
      conversationRequests = 0;
    const errors = [];
    await context.addInitScript(
      ({ source, show, episode, dark }) => {
        if (localStorage.getItem("phase5-seeded")) return;
        localStorage.setItem("phase5-seeded", "true");
        localStorage.setItem("star-cast-pilot-token", "isolated-test-only");
        localStorage.setItem("radio-star-launch-v1", "seen");
        localStorage.setItem(
          "star-cast-listener-state-v1",
          JSON.stringify({
            following: [show],
            history: [],
            saved: [],
            moments: [],
            feedEpisodes: { [show.id]: [episode] },
            followIntelligence: {},
            nightMode: dark,
            onboardingComplete: true,
            historyEnabled: true,
            recentSearches: ["Thoughtful ideas"],
            intelligenceEnabled: true,
            intelligencePreferenceVersion: 2,
          }),
        );
        localStorage.setItem(
          "star-cast-native-playback-v1",
          JSON.stringify({ source, snapshot: { positionMs: 3000, speed: 1 } }),
        );
      },
      { source, show, episode, dark },
    );
    await context.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "*",
      };
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      if (url.hostname === "fixture.invalid" && url.pathname === "/audio.wav")
        return route.fulfill({ body: wav, contentType: "audio/wav", headers });
      if (url.pathname.startsWith("/api/")) {
        let body = {};
        if (url.pathname === "/api/intelligence/request")
          throw Error("Must never enqueue intelligence");
        if (url.pathname === "/api/intelligence/status")
          body = {
            status: {
              state: "READY",
              processing: false,
              brief: {
                overview: "Isolated fixture overview.",
                themes: ["Technology"],
                detail: "Fixture discussion.",
              },
              chapters: [],
            },
          };
        if (url.pathname === "/api/listener/summary")
          body = {
            preferences: { adSkipEnabled: false },
            monthlyMinutes: 600,
            remainingMinutes: 600,
          };
        if (url.pathname === "/api/skips/status")
          body = {
            state: "NO_VERIFIED_INTERVALS",
            automaticSkipping: false,
            intervals: [],
            activeIntervals: [],
          };
        if (url.pathname === "/api/catalogue/search") {
          catalogueRequests++;
          body = { results: [show] };
        }
        if (url.pathname === "/api/catalogue/feed")
          body = { feed: { title: show.name, episodes: [episode] } };
        if (url.pathname === "/api/search/conversations") {
          conversationRequests++;
          body = {
            query: request.postDataJSON().query,
            coverage: {
              processedEpisodes: 1,
              matchedEpisodes: 1,
              scope: "Isolated test corpus",
            },
            synthesis: "A grounded fixture result.",
            synthesisType: "extractive",
            matches: [
              {
                segmentId: "s1",
                startMs: 3000,
                endMs: 10000,
                context: "Thoughtful ideas improve technology.",
                episode: {
                  ...episode,
                  feedUrl: show.feedUrl,
                  showName: show.name,
                },
              },
            ],
            followUps: [],
          };
        }
        return route.fulfill({ json: body, headers });
      }
      if (url.origin === origin) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    activePage = page;
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.error("Page error:", error.message);
    });
    page.on("console", (message) => {
      if (message.type() === "error") console.error("Browser:", message.text());
    });
    const started = performance.now();
    await page.goto(origin);
    if (process.env.RADIOSTAR_DIAGNOSTICS_ONLY === "1") {
      await page
        .getByRole("button", { name: "Open now playing", exact: true })
        .click();
      await page.evaluate(() => {
        navigator.share = async (data) => {
          window.__diagnosticExport = JSON.parse(data.text);
        };
      });
      await page
        .getByRole("button", { name: "Report a problem", exact: true })
        .last()
        .click();
      const capture = page.getByRole("switch", {
        name: "Capture device diagnostics",
      });
      assert.equal(await capture.getAttribute("aria-checked"), "false");
      await capture.click();
      assert.equal(await capture.getAttribute("aria-checked"), "true");
      await page
        .getByRole("button", { name: "Export device diagnostics" })
        .click();
      await page.waitForFunction(
        () => window.__diagnosticExport?.enabled === true,
      );
      const diagnostic = await page.evaluate(() => window.__diagnosticExport);
      assert.equal(diagnostic.audiblePlayback, "NOT_MEASURED");
      assert.equal(diagnostic.nativeBuild, "UNAVAILABLE");
      assert.ok(!JSON.stringify(diagnostic).includes("fixture.invalid"));
      await page.waitForTimeout(350); // Let the existing modal fade finish before visual review.
      await page.screenshot({ path: `${output}/${width}-diagnostics.png` });
      await capture.click();
      await page
        .getByRole("button", { name: "Export device diagnostics" })
        .click();
      await page.waitForFunction(
        () => window.__diagnosticExport?.enabled === false,
      );
      assert.deepEqual(
        await page.evaluate(() => window.__diagnosticExport.events),
        [],
      );
      await page.getByText("Close", { exact: true }).click();

      assert.deepEqual(errors, []);
      results.push({
        width,
        theme: dark ? "dark" : "light",
        diagnosticCaptureExportAndClear: true,
        physicalDevice: false,
      });
      await context.close();
      continue;
    }
    await page
      .getByRole("tab", { name: "Discover", exact: true })
      .click({ timeout: 20000 });
    await page
      .getByText("Categories in this collection", { exact: true })
      .waitFor();
    const discoverMs = Math.round(performance.now() - started);
    const appearance = page.getByRole("switch", {
      name: "Toggle day and night appearance",
    });
    assert.equal(await appearance.getAttribute("aria-checked"), String(dark));
    assert.ok(
      await appearance.innerText(),
      "Appearance control must contain a visible icon or fallback",
    );
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${output}/${width}-discover.png` });
    await page.getByRole("button", { name: "Technology", exact: true }).click();
    await page
      .getByRole("button", { name: `Open ${show.name}`, exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Technology", exact: true }).click();
    await page
      .getByRole("button", { name: `Play ${episode.title}`, exact: true })
      .waitFor();
    await page.getByRole("tab", { name: "Podcasts", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Search podcasts" })
      .fill("Thoughtful");
    await page
      .getByText("Episodes from followed shows", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Submit search", exact: true })
      .click();
    await page.screenshot({ path: `${output}/${width}-search.png` });
    await page.getByRole("tab", { name: "Conversations", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Ask about your podcasts" })
      .fill("Thoughtful ideas");
    await page
      .getByRole("button", { name: "Submit search", exact: true })
      .click();
    await page
      .getByText("A grounded fixture result.", { exact: true })
      .waitFor();
    assert.equal(
      conversationRequests,
      1,
      "Semantic requests require explicit submission",
    );
    await page.getByRole("tab", { name: "Moments", exact: true }).click();
    await page
      .getByRole("button", { name: "Submit search", exact: true })
      .click();
    await page
      .getByText("A grounded fixture result.", { exact: true })
      .waitFor();
    assert.equal(conversationRequests, 2);
    await page
      .getByRole("button", { name: "Play from 0:03", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Pause", exact: true })
      .waitFor();
    await page.getByRole("button", { name: /AI Sleep A gentler/ }).click();
    await page
      .getByRole("button", { name: "Start AI Sleep", exact: true })
      .click();
    await page.getByText("Settle into listening.", { exact: true }).waitFor();
    const signal = page.getByTestId("sleep-signal");
    const motion = await signal.evaluate(async (element) => {
      const sample = () =>
        [...element.querySelectorAll("div")].map((node) => [
          getComputedStyle(node).opacity,
          getComputedStyle(node).transform,
        ]);
      const before = sample();
      await new Promise((done) => setTimeout(done, 300));
      return { before, after: sample() };
    });
    if (width === 320) assert.deepEqual(motion.before, motion.after);
    else assert.notDeepEqual(motion.before, motion.after);
    await page
      .getByRole("button", { name: "Extend AI Sleep by 5 minutes" })
      .click();
    await page.screenshot({ path: `${output}/${width}-sleep-active.png` });
    await page
      .getByRole("button", { name: "Stop AI Sleep", exact: true })
      .click();
    await page.getByText("Your session has ended.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Close AI Sleep" }).click();
    await page
      .getByRole("button", { name: /Sleep Timer.*Set a pause/ })
      .click();
    for (const minutes of [5, 10, 15, 20, 30, 45, 60, 90])
      await page
        .getByRole("button", { name: `${minutes} min`, exact: true })
        .waitFor();
    await page.waitForTimeout(350); // Let the native-web modal transition settle.
    await page.screenshot({ path: `${output}/${width}-manual-timer.png` });
    await page.getByRole("button", { name: "90 min", exact: true }).click();
    await page
      .getByRole("button", { name: /Sleep Timer.*remaining/ })
      .waitFor();
    if (width === 390) {
      await page.getByRole("button", { name: /AI Sleep A gentler/ }).click();
      await page
        .getByRole("button", { name: "Start AI Sleep", exact: true })
        .click();
      await page.getByRole("button", { name: "Close AI Sleep" }).click();
      await page
        .getByRole("button", { name: /Sleep Timer.*Set a pause/ })
        .click();
      assert.equal(
        await page
          .getByRole("button", { name: "Cancel timer", exact: true })
          .count(),
        0,
        "AI Sleep replaces the manual timer",
      );
      await page.getByRole("button", { name: "90 min", exact: true }).click();
      await page.getByRole("button", { name: /AI Sleep A gentler/ }).click();
      await page
        .getByText("Your session has ended.", { exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Close AI Sleep" }).click();
    }
    await page
      .getByRole("button", { name: /Sleep Timer.*Set a pause/ })
      .click();
    await page
      .getByRole("button", { name: "Cancel timer", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: "Cancel timer", exact: true })
        .count(),
      0,
    );
    await page.getByRole("button", { name: "Close sleep timer" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Pause", exact: true })
      .click();
    await page.getByRole("button", { name: /AI Sleep A gentler/ }).click();
    await page
      .getByRole("button", { name: "Start AI Sleep", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Start playback before activating AI Sleep." })
      .waitFor();
    await page.getByRole("button", { name: "Close AI Sleep" }).click();
    // Recovery comes from a completed engine record, never invented by the UI.
    await page.evaluate(
      (source) =>
        localStorage.setItem(
          "star-cast-sleep-session-v1",
          JSON.stringify({
            state: "PAUSED",
            sourceKey: JSON.stringify([
              source.feedUrl,
              source.episodeId,
              source.url,
            ]),
            pausedAt: 303000,
            lastHeard: 3000,
          }),
        ),
      source,
    );
    await page.reload();
    await page.getByRole("button", { name: "Open now playing" }).click();
    await page.getByText("Welcome back.", { exact: true }).waitFor();
    await page.getByRole("button", { name: /AI Sleep A gentler/ }).click();
    await page.getByText("Audio paused.", { exact: true }).waitFor();
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${output}/${width}-sleep-recovery.png` });
    await page
      .getByRole("button", { name: "Resume playback", exact: true })
      .click();
    await page.getByRole("button", { name: "Close AI Sleep" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Pause", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Close player" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    for (const tab of ["Following", "Library", "Discover"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
    }
    if (width === 390) {
      await page
        .getByRole("button", { name: `Unfollow ${show.name}`, exact: true })
        .click();
      await page
        .getByRole("button", { name: `Follow ${show.name}`, exact: true })
        .click();
      await page.getByRole("button", { name: "Clear recent searches" }).click();
      assert.equal(
        await page.getByText("Continue exploring", { exact: true }).count(),
        0,
      );
      await appearance.click();
      await page.waitForFunction(
        () =>
          JSON.parse(localStorage.getItem("star-cast-listener-state-v1"))
            .nightMode === true,
      );
      await page.reload();
      await page
        .getByRole("switch", { name: "Toggle day and night appearance" })
        .waitFor();
      assert.equal(
        await appearance.getAttribute("aria-checked"),
        "true",
        "Explicit appearance survives restart",
      );
    }
    assert.deepEqual(errors, []);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "No horizontal viewport overflow",
    );
    results.push({
      width,
      theme: dark ? "dark" : "light",
      discoverMs,
      catalogueRequests,
      conversationRequests,
      motion: width === 320 ? "reduced" : "animated",
      restartRecovery: true,
      manualTimerCancelled: true,
    });
    await context.close();
  }
  const report = { results, output, liveRequests: 0, physicalDevice: false };
  await writeFile(`${output}/results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${output}/failure.png` });
    console.error(
      (await activePage.locator("body").innerText()).slice(0, 7000),
    );
  }
  throw error;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
