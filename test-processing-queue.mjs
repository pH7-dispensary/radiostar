import assert from "node:assert/strict";
import { ProcessingQueue, processingQueueFromEnv } from "./processing-queue.mjs";
import { EpisodePipeline } from "./episode-pipeline.mjs";
import { BudgetLedger, defaultControls } from "./openai-intelligence.mjs";
import { LocalStore } from "./persistence.mjs";
import { assessTranscript } from "./transcripts.mjs";

const queueUrl = "https://sqs.eu-west-2.amazonaws.com/208096650030/starcast-phase1-processing";
const sent = [];
let receives = 0;
const client = {
  send: async (command) => {
    if (command.constructor.name === "SendMessageCommand") {
      sent.push(command.input);
      return {};
    }
    if (command.constructor.name === "ReceiveMessageCommand") {
      receives++;
      return receives === 1 ? { Messages: [{ Body: JSON.stringify({ jobId: "job-1", key: "key-1", feedUrl: "https://publisher.example/feed", episodeId: "episode-1" }), ReceiptHandle: "receipt-1" }] } : { Messages: [] };
    }
    if (command.constructor.name === "DeleteMessageCommand") return {};
    throw Error("Unexpected command");
  },
};
const queue = new ProcessingQueue({ queueUrl, client, pollWaitSeconds: 1 });
await queue.enqueue({ jobId: "job-1", key: "key-1", feedUrl: "https://publisher.example/feed", episodeId: "episode-1", queuedAt: "2026-10-15T00:00:00.000Z" });
assert.equal(sent.length, 1);
assert.equal(JSON.parse(sent[0].MessageBody).jobId, "job-1");
assert.equal(processingQueueFromEnv({}), null);
assert.throws(() => new ProcessingQueue({ queueUrl: "https://example.com/queue" }), /dedicated/);
const received = await queue.receive();
assert.equal(received.length, 1);
await queue.acknowledge(received[0].ReceiptHandle);

const transcript = {
  sourceType: "publisher_rss",
  sourceUri: "https://publisher.example/transcript.vtt",
  originalFormat: "text/vtt",
  transcriptVersion: "queue-test-v1",
  segments: [{ id: "s1", startMs: 0, endMs: 60_000, text: "A concrete conversation about durable podcast intelligence explains how a single writer receives a persisted job, protects the budget ledger, and processes only rights-authorised publisher transcript material." }],
};
transcript.quality = assessTranscript({ segments: transcript.segments });
const queuedJobs = [];
const pipeline = new EpisodePipeline({
  store: new LocalStore(":memory:"),
  ledger: new BudgetLedger({ ...defaultControls, enabled: true }),
  queue: { enqueue: async (job) => queuedJobs.push(job) },
  enabled: true,
  configured: true,
  resolveEpisode: async (_feedUrl, episodeId) => ({
    id: episodeId,
    title: "Queue contract",
    duration: "1:00",
    audioUrl: "https://publisher.example/audio.mp3",
    refs: [{ url: transcript.sourceUri, type: "text/vtt" }],
  }),
  fetchTranscript: async () => transcript,
  client: { responses: { create: async () => ({
    output_text: JSON.stringify({ overview: "A durable queue is discussed.", themes: ["Queue"], detail: "The episode explains durable dispatch.", sourceSegmentIndexes: [1], chapters: [{ title: "Dispatch", description: "The durable dispatch discussion.", sourceSegmentIndexes: [1] }] }),
    usage: { input_tokens: 1, output_tokens: 1 },
  }) } },
});
const queued = await pipeline.request({ feedUrl: "https://publisher.example/feed", episodeId: "queue-episode" });
assert.equal(queued.state, "QUEUED");
assert.equal(queuedJobs.length, 1);
assert.equal((await pipeline.request({ feedUrl: "https://publisher.example/feed", episodeId: "queue-episode" })).jobId, queued.jobId, "duplicate requests retain one queued job");
await pipeline.executeQueued(queuedJobs[0]);
assert.equal(pipeline.status("https://publisher.example/feed", "queue-episode").state, "READY");
console.log("Dedicated SQS processing queue contract passed");
