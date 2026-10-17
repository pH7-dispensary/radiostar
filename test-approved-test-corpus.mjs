import assert from "node:assert/strict";
import { approvedTestCorpus } from "./approved-test-corpus.mjs";

const origin = "https://d3ri12f40b85i3.cloudfront.net";
const feed = approvedTestCorpus.response(approvedTestCorpus.feedPath, origin);
const transcript = approvedTestCorpus.response(approvedTestCorpus.transcriptPath, origin);
assert.match(feed.type, /rss/);
assert.match(feed.body, new RegExp(origin.replaceAll(".", "\\.") + approvedTestCorpus.transcriptPath));
assert.match(transcript.type, /vtt/);
assert.match(transcript.body, /rights review comes before processing/i);
assert.match(transcript.body, /Ada:/);
assert.match(transcript.body, /Bruno:/);
assert.equal(approvedTestCorpus.response("/fixtures/unknown", origin), null);
console.log("Approved Star Cast-owned test corpus contract passed");
