import assert from "node:assert/strict";
import { createStarCastServer } from "./server.mjs";
import { LocalStore } from "./persistence.mjs";
import { approvedTestCorpus } from "./approved-test-corpus.mjs";

const app = createStarCastServer({
  store: new LocalStore(":memory:"),
  env: {
    STARCAST_PRIVATE_PILOT: "enabled",
    STARCAST_DEV_INTELLIGENCE_TOKEN: "private-test-device-token",
    STARCAST_APPROVED_TEST_CORPUS: "enabled",
    STARCAST_TEST_CORPUS_ORIGIN: "https://d3ri12f40b85i3.cloudfront.net",
  },
});
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + app.server.address().port;
try {
  const feed = await fetch(base + approvedTestCorpus.feedPath);
  assert.equal(feed.status, 200);
  assert.match(await feed.text(), /Star Cast-owned synthetic/);
  assert.equal((await fetch(base + "/index.html")).status, 403, "test corpus must not weaken private-pilot static access");
  assert.equal((await fetch(base + "/fixtures/unknown")).status, 403, "only declared fixture paths are public");
} finally {
  await new Promise((resolve) => app.server.close(resolve));
  app.store.close();
}
console.log("Approved test corpus server boundary passed");
