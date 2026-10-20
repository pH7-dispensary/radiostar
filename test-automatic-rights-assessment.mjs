import assert from "node:assert/strict";
import { createStarCastServer } from "./server.mjs";
import { LocalStore } from "./persistence.mjs";
import { assessTranscript } from "./transcripts.mjs";
import { publisherRightsEvidence } from "./rights-assessment.mjs";

const feedUrl = "https://publisher.example/licensed.xml";
const restrictedFeedUrl = "https://publisher.example/restricted.xml";
const noBasisFeedUrl = "https://publisher.example/no-basis.xml";
const historicalFeedUrl = "https://publisher.example/historical.xml";
const vttUrl = "https://publisher.example/licensed.vtt";
const xml = (id, body = "") => `<?xml version="1.0"?><rss><channel><title>Publisher licensed show</title><itunes:author>Publisher</itunes:author>${body}<item><guid>${id}</guid><title>${id} &amp; evidence</title><pubDate>Tue, 20 Oct 2026 12:00:00 GMT</pubDate><itunes:duration>00:02:00</itunes:duration><podcast:transcript url="${vttUrl}" type="text/vtt"/>${body}</item></channel></rss>`;
const fillerItems = Array.from({ length: 85 }, (_, index) => `<item><guid>recent-${index}</guid><title>Recent ${index}</title></item>`).join("");
const historicalXml = `<?xml version="1.0"?><rss><channel><title>Licensed archive</title><itunes:author>Publisher</itunes:author><copyright>This work is licensed under the Creative Commons Attribution 4.0 International License. https://creativecommons.org/licenses/by/4.0/</copyright>${fillerItems}<item><guid>older-licensed</guid><title>Older licensed episode</title><itunes:duration>00:02:00</itunes:duration><podcast:transcript url="${vttUrl}" type="text/vtt"/></item></channel></rss>`;
const feeds = new Map([
  [feedUrl, xml("licensed", '<podcast:license url="https://creativecommons.org/licenses/by/4.0/"/>')],
  [restrictedFeedUrl, xml("restricted", "<rights>All rights reserved. No AI or text and data mining.</rights>")],
  [noBasisFeedUrl, xml("no-basis")],
  [historicalFeedUrl, historicalXml],
]);
const transcript = {
  segments: [
    { id: "one", startMs: 0, endMs: 50_000, text: "Researchers discuss evidence-based decisions and careful methods." },
    { id: "two", startMs: 50_000, endMs: 120_000, text: "They compare practical recommendations for teams making decisions." },
  ],
  transcriptVersion: "automatic-rights-fixture-v1",
  sourceType: "publisher_rss",
  sourceUri: vttUrl,
  originalFormat: "text/vtt",
};
transcript.quality = assessTranscript(transcript);
const app = createStarCastServer({
  store: new LocalStore(":memory:"),
  env: { STARCAST_DEV_INTELLIGENCE_TOKEN: "device-token", STARCAST_ADMIN_TOKEN: "admin-token", STARCAST_PAID_INTELLIGENCE: "enabled", OPENAI_API_KEY: "mock-key" },
  fetchFeed: async (url) => feeds.get(url) || "",
  fetchTranscript: async () => transcript,
  client: { responses: { create: async () => ({
    output_text: JSON.stringify({
      overview: "Researchers discuss evidence-based decisions for teams.",
      themes: ["Evidence", "Recommendations"],
      detail: "The conversation compares careful methods and practical recommendations for team decisions.",
      sourceSegmentIndexes: [1, 2],
      chapters: [{ title: "Careful methods", description: "The speakers compare evidence-based methods.", sourceSegmentIndexes: [1, 2] }],
    }),
    usage: { input_tokens: 100, output_tokens: 100 },
  }) } },
});
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const headers = { "content-type": "application/json", "x-star-cast-dev-token": "device-token", "x-star-cast-admin-token": "admin-token" };
const post = (path, body) => fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
try {
  const copyrightEvidence = publisherRightsEvidence({
    feedUrl,
    channelXml: "<channel><copyright>This work is licensed under the Creative Commons Attribution 4.0 International License. https://creativecommons.org/licenses/by/4.0/</copyright></channel>",
  });
  assert.equal(copyrightEvidence.licences[0]?.kind, "CC-BY", "an explicit publisher copyright licence is recognised without trusting incidental episode text");

  const historical = await post("/api/intelligence/preflight", { feedUrl: historicalFeedUrl, episodeId: "older-licensed" });
  const historicalBody = await historical.json();
  assert.equal(historical.status, 200, "an explicitly requested older episode is resolved from the bounded publisher history");
  assert.equal(historicalBody.assessment.classification, "LICENSED");
  const missing = await post("/api/intelligence/preflight", { feedUrl: historicalFeedUrl, episodeId: "not-in-feed" });
  assert.equal(missing.status, 404, "a removed episode gets a specific source response instead of a generic processing failure");
  assert.equal((await missing.json()).code, "EPISODE_NOT_FOUND");

  // A pre-existing, owned record is never overwritten by automatic evidence.
  app.rights.set({ feedUrl: "https://owned.example/feed.xml", episodeId: "owned", classification: "LICENSED", explicitAuthorisation: true, legalBasis: "Owned fixture authorisation.", canAcquireTranscript: true, canProcessForAi: true, canDisplayDerivedIntelligence: true, canRetain: true });
  const owned = app.rights.assessAutomatic({ feedUrl: "https://owned.example/feed.xml", episodeId: "owned", assessmentSource: "publisher-rss-v1", evidenceFingerprint: "different", classification: "RESTRICTED" });
  assert.equal(owned.reused, true, "an owned fixture remains an authoritative human record");
  assert.equal(owned.record.classification, "LICENSED");

  const accepted = await post("/api/intelligence/request", { feedUrl, episodeId: "licensed", capability: "brief" });
  assert.equal(accepted.status, 202, "a publisher-licensed episode starts preparation without a manual assessment");
  await Promise.all(app.pipeline.inflight.values());
  const rights = app.rights.resolve(feedUrl, "licensed");
  assert.equal(rights.assessmentStatus, "APPROVED");
  assert.equal(rights.assessmentSource, "publisher-rss-v1");
  assert.equal(rights.canGenerateBrief && rights.canGenerateChapters && rights.canGenerateTopics && rights.canSearchMoments, true, "core derived intelligence permissions are independently recorded");
  assert.equal(rights.canDisplayCaptions || rights.canGenerateDubbedAudio || rights.canCloneSpeakerVoice, false, "captions, dubbing and voice replication stay independently blocked");
  assert.equal(app.pipeline.status(feedUrl, "licensed").state, "READY", "the eligible episode reaches READY through the real pipeline");
  const status = await (await fetch(`${base}/api/intelligence/status?feedUrl=${encodeURIComponent(feedUrl)}&episodeId=licensed`, { headers })).json();
  assert.equal(status.status.state, "READY");
  assert.ok(status.status.brief?.overview && status.status.chapters?.length && status.status.brief?.themes?.length, "the live status API returns Brief, Chapters and Topics");
  const moments = await (await post("/api/intelligence/moment", { feedUrl, episodeId: "licensed", query: "careful methods" })).json();
  assert.ok(moments.moments.length && Number.isFinite(moments.moments[0].startMs), "Find a Moment returns a grounded playable timestamp");

  const restricted = await post("/api/intelligence/request", { feedUrl: restrictedFeedUrl, episodeId: "restricted", capability: "brief" });
  const restrictedStatus = await restricted.json();
  assert.equal(restrictedStatus.status.code, "PUBLISHER_RESTRICTION", "an explicit publisher restriction is surfaced precisely");
  assert.equal(app.rights.resolve(restrictedFeedUrl, "restricted").rightsReserved, true);

  const noBasis = await post("/api/intelligence/request", { feedUrl: noBasisFeedUrl, episodeId: "no-basis", capability: "brief" });
  const noBasisStatus = await noBasis.json();
  assert.equal(noBasisStatus.status.code, "LEGAL_BASIS_NOT_ESTABLISHED", "absence of a licence becomes a recorded assessment, not an unassessed deadlock");
  const noBasisRights = app.rights.resolve(noBasisFeedUrl, "no-basis");
  assert.equal(noBasisRights.assessmentStatus, "REJECTED");
  assert.ok(noBasisRights.assessmentEvidence.some((item) => item.type === "TDM_REVIEW"), "TDM consideration is recorded without being automatically asserted");
} finally {
  await new Promise((resolve) => app.server.close(resolve));
  app.store.close();
}
console.log("Automatic rights assessment, feature separation and live intelligence flow passed");
