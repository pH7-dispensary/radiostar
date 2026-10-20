import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyAwsIdentity } from "../aws-account-guard.mjs";
import { processingApprovalFeatures } from "../../rights-registry.mjs";

verifyAwsIdentity();
const connection = JSON.parse(readFileSync(".starcast/cloud-connection.json", "utf8"));
const admin = JSON.parse(readFileSync(".starcast/cloud-admin.json", "utf8"));
assert.equal(connection.url, "https://d3ri12f40b85i3.cloudfront.net");
const feedUrl = connection.url + "/fixtures/approved-test-feed.xml";
const episodeId = "starcast-approved-test-episode-v1";
const params = new URLSearchParams({ feedUrl, episodeId });
const request = async (path, body, expected = 200) => {
  const response = await fetch(connection.url + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-star-cast-admin-token": admin.token, "x-star-cast-dev-token": connection.token },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, expected, path);
  return response.json();
};
const before = await request("/api/admin/intelligence");
const review = await request("/api/admin/rights/review?" + params);
assert.equal(review.record.classification, "LICENSED", "only the existing authorised original fixture may be reviewed");
const ready = await request("/api/intelligence/status?" + params);
assert.equal(ready.status.state, "READY");
const input = {
  scope: "episode", feedUrl, episodeId, classification: "LICENSED", basisType: "OWNED",
  evidenceReference: "repository:approved-test-corpus.mjs#approvedTestTranscriptVtt",
  evidenceIssuer: "Radio Star original synthetic verification corpus",
  legalBasis: "Existing Radio Star-owned synthetic test text; retain only previously granted core capabilities.",
  reason: "Verify structured evidence review and canonical cache reuse on the existing owned fixture.",
  authorityConfirmed: true, territories: ["WORLDWIDE"],
  selectedFeatures: Object.entries(processingApprovalFeatures).filter(([, key]) => review.record[key] === true).map(([feature]) => feature),
  tier: review.policy.tier, maxEpisodes: 1, applyToFuture: false,
  expectedAssessmentRevision: review.revision,
};
await request("/api/admin/rights/approval-preview", { ...input, evidenceReference: "" }, 400);
const preview = await request("/api/admin/rights/approval-preview", input);
assert.equal(preview.summary.expectedNewJobs, 0, "do not regenerate an existing successful cache for a test");
assert.equal(preview.impacts[0].cached, true);
let approved = false;
if (process.argv.includes("--approve-owned-fixture")) {
  const confirmation = { previewId: preview.previewId, confirmation: "APPROVE & PROCESS" };
  const result = await request("/api/admin/rights/approve-process", confirmation, 202);
  assert.equal(result.status.state, "READY");
  assert.equal(result.jobs.length, 0);
  assert.equal((await request("/api/admin/rights/approve-process", confirmation, 202)).approval.id, result.approval.id);
  const persisted = await request("/api/admin/rights/review?" + params);
  assert.equal(persisted.record.approvalAssessment.evidenceReference, input.evidenceReference);
  assert.ok(persisted.history.length);
  approved = true;
}
const status = await request("/api/intelligence/status?" + params);
assert.ok(status.status.brief);
assert.ok(status.status.chapters.length);
assert.ok(status.status.availableFeatures.topics);
const moments = await request("/api/intelligence/moment", { feedUrl, episodeId, query: "rights review" });
assert.ok(moments.moments.length);
const after = await request("/api/admin/intelligence");
assert.deepEqual(after.usage, before.usage, "verification must reuse cache without paid processing");
assert.deepEqual(after.controls, before.controls, "spending controls must not change");
console.log(JSON.stringify({ passed: true, approvalAppliedThisRun: approved,
  structuredApprovalPersisted: approved || Boolean(review.record.approvalAssessment), canonicalCacheReused: true,
  replayDeduplicated: approved, brief: true, chapters: status.status.chapters.length, topics: true,
  moments: moments.moments.length, newPaidCalls: 0, newLiveJobs: 0, policy: review.policy.tier }, null, 2));
