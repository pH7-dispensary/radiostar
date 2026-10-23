import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { BudgetLedger, defaultControls } from "./openai-intelligence.mjs";
import {
  EpisodePipeline,
  availabilityCode,
  episodeKey,
} from "./episode-pipeline.mjs";
import { IntelligencePolicyRegistry, IntelligenceTier } from "./intelligence-policy.mjs";
import { LocalStore } from "./persistence.mjs";
import { RightsClassification, RightsRegistry } from "./rights-registry.mjs";
import { assessTranscript } from "./transcripts.mjs";

const feed = "https://publisher.example/duration.xml";
const noBasisFeed = "https://publisher.example/no-basis.xml";
const store = new LocalStore(":memory:");
const ledger = new BudgetLedger({ ...defaultControls, enabled: true }, store);
const rights = new RightsRegistry(store);
const intelligencePolicy = new IntelligencePolicyRegistry(store);
const segments = [
  {
    id: "one",
    startMs: 0,
    endMs: 60_000,
    text: "A grounded fixture explains that authorised publisher transcripts may be reused without downloading or transcribing long source audio.",
  },
  {
    id: "two",
    startMs: 60_000,
    endMs: 120_000,
    text: "The discussion preserves precise timestamps for chapters and moments while the paid audio limits remain separately enforced.",
  },
];
const transcript = {
  sourceType: "publisher_rss",
  sourceUri: "https://publisher.example/duration.vtt",
  originalFormat: "text/vtt",
  transcriptVersion: "duration-reuse-v1",
  language: "en",
  segments,
  quality: assessTranscript({ segments }),
};
const variant = (episodeId) =>
  createHash("sha256")
    .update(`https://publisher.example/${episodeId}.mp3`)
    .digest("hex");
const cacheTranscript = (episodeId) =>
  store.set("transcript", `${episodeKey(feed, episodeId)}:${variant(episodeId)}`, {
    ...transcript,
    sourceType: "canonical_cache",
    sourceUri: `cache:${episodeId}`,
  });

rights.set({
  feedUrl: feed,
  classification: RightsClassification.LICENSED,
  assessmentStatus: "APPROVED",
  explicitAuthorisation: true,
  canAcquireTranscript: true,
  canProcessForAi: true,
  canTranscribeAudio: true,
  canDisplayDerivedIntelligence: true,
  canRetain: true,
  canRegenerate: true,
});

let providerCalls = 0;
let publisherFetches = 0;
let audioPreparations = 0;
const pipeline = new EpisodePipeline({
  store,
  ledger,
  rights,
  intelligencePolicy,
  enabled: true,
  configured: true,
  audioEnabled: true,
  resolveEpisode: async (feedUrl, episodeId) => ({
    id: episodeId,
    title: episodeId,
    duration: episodeId.includes("long") ? "180:00" : "30:00",
    audioUrl: `https://publisher.example/${episodeId}.mp3`,
    refs: episodeId === "long-publisher" ? [{ url: transcript.sourceUri, type: "text/vtt" }] : [],
    feedUrl,
  }),
  fetchTranscript: async () => {
    publisherFetches++;
    return transcript;
  },
  audioFactory: async () => {
    audioPreparations++;
    throw Error("Audio acquisition should not run in this regression test.");
  },
  client: {
    responses: {
      create: async () => {
        providerCalls++;
        return {
          output_text: JSON.stringify({
            overview: "The fixture describes safe transcript reuse.",
            themes: ["Transcript reuse"],
            detail: "Authorised text can be analysed without paid audio transcription.",
            sourceSegmentIndexes: [1],
            chapters: [
              {
                title: "Reuse",
                description: "The grounded reuse discussion.",
                sourceSegmentIndexes: [1, 2],
              },
            ],
          }),
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      },
    },
  },
});

try {
  // A: below the cap, cached transcript.
  cacheTranscript("cached-short");
  await pipeline.request({ feedUrl: feed, episodeId: "cached-short" });
  await Promise.all(pipeline.inflight.values());
  assert.equal(pipeline.status(feed, "cached-short").state, "READY");
  assert.equal(pipeline.status(feed, "cached-short").transcript.sourceType, "canonical_cache");

  // B: above the cap, canonical cache remains a zero-audio route.
  cacheTranscript("long-cached");
  await pipeline.request({ feedUrl: feed, episodeId: "long-cached" });
  await Promise.all(pipeline.inflight.values());
  const longCached = pipeline.status(feed, "long-cached");
  assert.equal(longCached.state, "READY");
  assert.equal(longCached.transcript.sourceType, "canonical_cache");
  assert.equal(longCached.transcriptChecks.cacheHit, true);
  assert.equal(audioPreparations, 0);

  // C: above the cap, authorised publisher text is checked before any paid-audio guard.
  await pipeline.request({ feedUrl: feed, episodeId: "long-publisher" });
  await Promise.all(pipeline.inflight.values());
  const longPublisher = pipeline.status(feed, "long-publisher");
  assert.equal(longPublisher.state, "READY");
  assert.equal(longPublisher.transcript.sourceType, "publisher_rss");
  assert.equal(longPublisher.transcriptChecks.publisherTranscriptChecked, true);
  assert.equal(longPublisher.transcriptChecks.publisherTranscriptFound, true);
  assert.equal(audioPreparations, 0);

  // D: a long episode still cannot start paid audio when no usable transcript exists.
  await pipeline.request({
    feedUrl: feed,
    episodeId: "long-audio",
    allowAudio: true,
  });
  await Promise.all(pipeline.inflight.values());
  const longAudio = pipeline.status(feed, "long-audio");
  assert.equal(longAudio.code, "DURATION_LIMIT");
  assert.equal(longAudio.reason, "This episode exceeds the current audio transcription limit.");
  assert.equal(longAudio.transcriptChecks.audioTranscriptionRequired, true);
  assert.equal(audioPreparations, 0);

  // E: an explicit rights restriction still wins before transcript processing.
  rights.set({
    feedUrl: feed,
    episodeId: "restricted",
    classification: RightsClassification.RESTRICTED,
    assessmentStatus: "REJECTED",
    blockerCode: "PUBLISHER_RESTRICTION",
    assessmentReason: "The publisher reserved this processing.",
    rightsReserved: true,
  });
  const restricted = await pipeline.request({ feedUrl: feed, episodeId: "restricted" });
  assert.equal(restricted.code, "PUBLISHER_RESTRICTION");
  assert.equal(providerCalls, 3);

  // F: an OPEN/ZERO intelligence policy is operational only; it never supplies a rights basis.
  intelligencePolicy.set({
    feedUrl: noBasisFeed,
    episodeId: "no-basis",
    tier: IntelligenceTier.ZERO,
    reason: "Explicit test of policy separation.",
  });
  const noBasis = await pipeline.request({ feedUrl: noBasisFeed, episodeId: "no-basis" });
  assert.equal(noBasis.code, "LEGAL_BASIS_NOT_ESTABLISHED");
  assert.equal(providerCalls, 3);

  // G: a completed request is a cache hit and does not repeat generation.
  const cached = await pipeline.request({ feedUrl: feed, episodeId: "long-cached" });
  assert.equal(cached.cacheHit, true);
  assert.equal(providerCalls, 3);

  // H: an exhausted budget prevents an additional paid-audio route before download.
  ledger.reserve({ id: "exhausted-budget", usd: 4.999 });
  await pipeline.request({ feedUrl: feed, episodeId: "budget-audio", allowAudio: true });
  await Promise.all(pipeline.inflight.values());
  assert.equal(pipeline.status(feed, "budget-audio").code, "BUDGET_LIMIT");
  assert.equal(audioPreparations, 0);

  // I: durable codes retain their compatibility while availability codes are precise.
  assert.equal(availabilityCode("AUDIO_CONSENT_REQUIRED"), "TRANSCRIPT_UNAVAILABLE");
  assert.equal(availabilityCode("TIMEOUT"), "PROCESSING_TIMEOUT");
  assert.equal(availabilityCode("PROVIDER_UNAVAILABLE"), "PROVIDER_FAILURE");
  assert.equal(availabilityCode("DURATION_LIMIT"), "DURATION_LIMIT");
  assert.equal(publisherFetches, 1);
} finally {
  store.close();
}

console.log("duration-safe transcript reuse, rights, budget, cache, and availability contracts passed");
