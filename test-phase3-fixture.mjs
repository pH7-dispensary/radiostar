import { createStarCastServer } from "./server.mjs";
import { LocalStore } from "./persistence.mjs";
import { assessTranscript } from "./transcripts.mjs";
export const feedUrl = "https://fixture.example/radio-star-review.xml";
export function createReviewFixture(store = new LocalStore(":memory:")) {
  let calls = 0;
  const items = ["owned-one", "owned-two", "restricted"];
  const transcript = {
    segments: [{ id: "s1", startMs: 0, endMs: 60_000, text: "Radio Star fixture discusses reliable research, evidence review and grounded decision making. These original fixture words are only used to verify the application." }],
    transcriptVersion: "phase3-fixture-v1", sourceType: "publisher_rss", sourceUri: "https://fixture.example/transcript.vtt", originalFormat: "text/vtt",
  };
  transcript.quality = assessTranscript(transcript);
  const app = createStarCastServer({
    store, env: { STARCAST_ADMIN_TOKEN: "phase3-test-admin", STARCAST_DEV_INTELLIGENCE_TOKEN: "phase3-test-listener", STARCAST_PAID_INTELLIGENCE: "enabled", OPENAI_API_KEY: "mock-only" },
    fetchFeed: async () => `<rss><channel><title>Evidence &amp; Research</title><itunes:author>Radio Star owned fixture</itunes:author>${items.map((id, i) => `<item><guid>${id}</guid><title>${id === "restricted" ? "Explicit restriction" : `Evidence review ${i + 1}`}</title><pubDate>${new Date(Date.UTC(2026, 9, 20 - i)).toUTCString()}</pubDate><itunes:duration>01:00</itunes:duration><enclosure url="https://fixture.example/${id}.mp3"/><podcast:transcript url="${transcript.sourceUri}" type="text/vtt"/></item>`).join("")}</channel></rss>`,
    resolveEpisode: async (_feed, id) => ({ id, title: `Evidence review ${id}`, showName: "Evidence & Research", publisher: "Radio Star owned fixture", duration: "01:00", audioUrl: `https://fixture.example/${id}.mp3`, refs: [{ url: transcript.sourceUri, type: "text/vtt" }] }),
    fetchTranscript: async () => transcript,
    client: { responses: { create: async () => {
      calls++;
      return { output_text: JSON.stringify({ overview: transcript.segments[0].text, themes: ["Research"], detail: transcript.segments[0].text, sourceSegmentIndexes: [1], chapters: [{ title: "Research", description: "Radio Star fixture discusses reliable research, evidence review and grounded decision making.", sourceSegmentIndexes: [1] }] }), usage: { input_tokens: 100, output_tokens: 100 } };
    } } },
  });
  store.set("follow", "fixture", { feedUrl, id: "fixture", owner: "test", intelligenceEnabled: true });
  app.rights.set({ feedUrl, episodeId: "restricted", classification: "RESTRICTED", rightsReserved: true, blockerCode: "PUBLISHER_RESTRICTION", assessmentSource: "fixture-notice", assessmentEvidence: [{ type: "RIGHTS_HOLDER_NOTICE", source: "Fixture rights holder", scope: "episode", value: "fixture:explicit-reservation-v1" }] });
  return { app, providerCalls: () => calls };
}
