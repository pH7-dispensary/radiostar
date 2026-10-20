import assert from "node:assert/strict";
import { createStarCastServer } from "./server.mjs";
import { LocalStore } from "./persistence.mjs";
import { episodeKey } from "./episode-pipeline.mjs";

const feedUrl = "https://publisher.example/operations.xml";
const episodeId = "operations-episode";
const reportId = "a".repeat(64);
const app = createStarCastServer({
  store: new LocalStore(":memory:"),
  env: {
    NODE_ENV: "production",
    STARCAST_DEV_INTELLIGENCE_TOKEN: "operations-listener",
    STARCAST_ADMIN_TOKEN: "operations-admin",
  },
});
app.store.set("intelligence", episodeKey(feedUrl, episodeId), {
  state: "QUEUED",
  jobId: "operations-job",
  feedUrl,
  episodeId,
  queuedAt: new Date(Date.now() - 1_000).toISOString(),
  startedAt: new Date(Date.now() - 1_000).toISOString(),
  deadlineAt: new Date(Date.now() + 60_000).toISOString(),
  attempts: 1,
  episode: { id: episodeId, title: "Operations fixture", showName: "Radio Star fixtures", feedUrl },
});
app.store.set("problem-report", reportId, {
  id: reportId,
  owner: "anonymous-listener",
  category: "ai_answer",
  feature: "Episode brief",
  feedUrl,
  episodeId,
  status: "open",
  createdAt: Date.now(),
});

await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const headers = { "content-type": "application/json", "x-star-cast-admin-token": "operations-admin" };
const request = (path, options = {}) => fetch(base + path, { ...options, headers: { ...headers, ...(options.headers || {}) } });

try {
  assert.equal((await fetch(base + "/api/admin/operations")).status, 403, "operations records are never public");
  const operations = await request("/api/admin/operations");
  assert.equal(operations.status, 200);
  const body = await operations.json();
  assert.equal(body.summary.jobs, 1, "persisted jobs drive the operations total");
  assert.equal(body.coverage.scope, "Persisted operations records", "coverage does not claim a global RSS denominator");
  assert.equal(body.cost.aws.status, "NOT_AVAILABLE", "missing AWS billing data is not represented as zero cost");
  assert.equal(body.listeners.reports[0].status, "OPEN", "legacy lowercase support state is projected consistently");
  assert.equal(body.infrastructure.components.some((component) => component.name === "Durable database"), true, "database health remains component evidence");

  const search = await request("/api/admin/search?q=operations");
  assert.equal(search.status, 200);
  const searchBody = await search.json();
  assert.equal(searchBody.groups.some((group) => group.type === "EPISODES"), true, "global search reuses authoritative job records");

  const cancelled = await request("/api/admin/intelligence/cancel", { method: "POST", body: JSON.stringify({ feedUrl, episodeId, reason: "Fixture cancellation" }) });
  assert.equal(cancelled.status, 200, "only the durable queued job can be cancelled");
  assert.equal((await cancelled.json()).status.state, "CANCELLED");
  assert.equal(app.store.get("intelligence", episodeKey(feedUrl, episodeId)).state, "CANCELLED", "queue cancellation persists before the worker can begin");

  const resolved = await request(`/api/admin/reports/${reportId}`, { method: "PATCH", body: JSON.stringify({ status: "RESOLVED", resolutionNote: "Reviewed the grounded evidence and recorded the outcome." }) });
  assert.equal(resolved.status, 200, "support workflow requires an authorised server-side update");
  assert.equal((await resolved.json()).report.status, "RESOLVED");
  const audit = await request("/api/admin/audit?action=listener-report-updated");
  assert.equal((await audit.json()).events.some((event) => event.action === "listener-report-updated"), true, "support outcomes are tamper-evidently audited");
} finally {
  await new Promise((resolve) => app.server.close(resolve));
  app.store.close();
}

console.log("Admin operational evidence, queued cancellation, report workflow and role-scoped search passed");
