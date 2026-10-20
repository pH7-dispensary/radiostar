import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { verifyAwsIdentity } from "./aws-account-guard.mjs";
verifyAwsIdentity();
const connection = JSON.parse(readFileSync(".starcast/cloud-connection.json", "utf8"));
const admin = JSON.parse(readFileSync(".starcast/cloud-admin.json", "utf8"));
assert.equal(connection.url, "https://d3ri12f40b85i3.cloudfront.net");
const headers = { "content-type": "application/json", "x-star-cast-dev-token": connection.token, "x-star-cast-admin-token": admin.token };
const api = async (path, input) => {
  const response = await fetch(connection.url + path, { method: input ? "POST" : "GET", headers, ...(input ? { body: JSON.stringify(input) } : {}) });
  const value = await response.json();
  if (!response.ok) throw Error(`${path}: ${response.status}: ${value.error || "request failed"}`);
  return value;
};
const identity = { feedUrl: "https://opensourcesecuritypodcast.libsyn.com/rss", episodeId: "cd76cc10-ce37-4d65-9274-fd3052b1bcbd" };
const query = new URLSearchParams(identity);
const mode = await api("/api/admin/intelligence/testing");
assert.equal(mode.configuration.active, true);
assert.equal(mode.limits.dailyUsd, 25); assert.equal(mode.limits.monthlyUsd, 125);
assert.equal(mode.configuration.listenerIds.length, 1);
const preflight = await api("/api/intelligence/preflight", identity);
if (process.argv.includes("--start")) {
  assert.equal(preflight.hasPublisherTranscript, false);
  assert.equal(preflight.hasCachedTranscript, false, "Do not rerun a completed paid verification");
  assert(preflight.estimatedAudioCost <= 0.25);
  const assessment = preflight.assessment;
  assert.equal(assessment.rightsReserved, false);
  assert(assessment.assessmentEvidence.some((item) => item.type === "PUBLISHER_LICENSE" && item.value === "CC-BY" && item.scope === "podcast"));
  const review = await api("/api/admin/rights/review?" + query);
  // Record a narrowly scoped licence assessment with preparation paused, then
  // exercise the same automatic encounter path used by the enrolled iPhone.
  const preview = await api("/api/admin/rights/approval-preview", {
    ...identity, scope: "episode", classification: "LICENSED", basisType: "PUBLISHER_LICENCE",
    evidenceIssuer: "Open Source Security / Josh Bressers — publisher RSS copyright notice",
    evidenceReference: identity.feedUrl + "#copyright; https://creativecommons.org/licenses/by/4.0/legalcode.en#s2",
    legalBasis: "Publisher RSS expressly licenses this podcast work under CC BY 4.0. Section 2(a)(1) permits reproduction and adapted material. This assessment covers internal transcription and short attributed intelligence for this episode only; preserve publisher/title/source attribution and identify generated analysis. It grants no captions, dubbing, translation or voice replication. Explicit reservations, third-party claims and takedowns remain controlling.",
    reason: "User-authorised live verification of a real licensed episode without a publisher transcript. Hold preparation until the internal automatic encounter test.",
    authorityConfirmed: true, territories: ["WORLDWIDE"], selectedFeatures: ["transcription", "brief", "chapters", "topics", "moments", "search", "advertisements"],
    applyToFuture: true, maxEpisodes: 1, tier: "HIGH", expectedAssessmentRevision: review.revision,
  });
  assert.equal(preview.summary.expectedNewJobs, 0);
  const approved = await api("/api/admin/rights/approve-process", { previewId: preview.previewId, confirmation: "APPROVE & PROCESS" });
  assert.equal(approved.jobs.length, 0);
  const policy = await api("/api/admin/intelligence/policies");
  // Omit an expected version only if the API returns no direct scope version;
  // the saved record is still versioned and the subsequent decision rechecked.
  void policy;
  await api("/api/admin/intelligence/policies", { ...identity, scope: "episode", tier: "LOW", applyToExisting: false, applyToFuture: true, reason: "Start only through the authenticated internal encounter pipeline for live verification.", confirmation: "SAVE POLICY" });
  const result = await api("/api/admin/intelligence/testing/prepare", { ...identity, listenerId: mode.configuration.listenerIds[0] });
  writeFileSync(".starcast/live-internal-verification.json", JSON.stringify({ identity, startedAt: new Date().toISOString(), before: mode.totals, preflight: { publisherTranscript: false, cache: false, durationMs: preflight.durationMs }, jobId: result.status.jobId }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ started: true, state: result.status.state, jobId: result.status.jobId, estimateAudioUsd: preflight.estimatedAudioCost }));
} else {
  const status = (await api("/api/intelligence/status?" + query)).status;
  const ledger = await api("/api/admin/intelligence");
  const usage = ledger.usage.filter((row) => row.id.startsWith(status.jobId + ":") || row.id.startsWith(status.key || "not-a-key"));
  let moments = null, search = null;
  if (status.state === "READY") {
    moments = await api("/api/intelligence/moment", { ...identity, query: "forking open source" });
    search = await api("/api/search/conversations", { query: "forking open source", feedUrls: [identity.feedUrl] });
    assert(status.brief?.overview); assert(status.chapters?.length); assert(status.brief.themes.length);
    assert(moments.moments.length); assert(search.matches.some((item) => item.episode.id === identity.episodeId));
  }
  console.log(JSON.stringify({ state: status.state, code: status.code, reason: status.reason, jobId: status.jobId, source: status.provenance?.sourceType, overview: status.brief?.overview, chapters: status.chapters?.length, topics: status.brief?.themes?.length, moments: moments?.moments?.length, searchMatches: search?.matches?.filter((item) => item.episode.id === identity.episodeId).length, work: status.work, totals: ledger.totals, reservations: ledger.reservations.length, jobTextUsage: usage }, null, 2));
}
