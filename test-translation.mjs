import assert from "node:assert/strict";
import { LocalStore } from "./persistence.mjs";
import { ListenerService } from "./listener-service.mjs";
import { RightsRegistry, RightsClassification } from "./rights-registry.mjs";
import { TranslationService, TranslationBetaState, languageFor, translationControls, validAlignment } from "./translation.mjs";
import { createStarCastServer } from "./server.mjs";
const store = new LocalStore(":memory:");
try {
  const listeners = new ListenerService(store), listener = listeners.register("a".repeat(64));
  const rights = new RightsRegistry(store), subscriptions = { entitlement: () => ({ active: true, expiresAt: 123 }) };
  const disabled = new TranslationService({ rights, subscriptions, env: {} });
  assert.equal(disabled.config(listener).availability, "UNAVAILABLE");
  assert.equal(languageFor("pt")?.label, "Portuguese");
  assert.equal(translationControls({ RADIOSTAR_TRANSLATE_BETA: "invalid" }).state, TranslationBetaState.DISABLED);
  listeners.languagePreferences(listener, { listeningLanguage: "pt", naturalVoices: true, listenInMyLanguage: true });
  const beta = new TranslationService({ rights, subscriptions, env: { RADIOSTAR_TRANSLATE_BETA: "INTERNAL_TESTING" } });
  assert.equal(beta.config(listener).availability, "PREPARING", "a flag cannot enable unconfigured generation");
  rights.set({ feedUrl: "https://publisher.example/feed", episodeId: "episode", classification: RightsClassification.LICENSED,
    canTranslateText: true, canGenerateDubbedAudio: true, canCacheTranslatedAudio: true, canDistributeTranslation: true });
  assert.equal(beta.eligible("https://publisher.example/feed", "episode"), true);
  const identity = { feedUrl: "https://publisher.example/feed", episodeId: "episode", audioVariant: "source-v1", sourceLanguage: "en", targetLanguage: "pt", voiceProfile: "licensed-default", translationVersion: "v1", rightsVersion: "v1" };
  const alignment = [{ originalStartMs: 0, originalEndMs: 1000, translatedStartMs: 0, translatedEndMs: 1100 }];
  assert.equal(validAlignment(alignment), true);
  beta.cacheReady(identity, { alignment, audioUrl: "https://cache.example/dub.mp3", actualCostUsd: 0.02 });
  assert.equal(beta.cacheStatus(identity)?.state, "READY");
  rights.suspend("https://publisher.example/feed", "episode", "rights holder review");
  assert.equal(beta.eligible("https://publisher.example/feed", "episode"), false, "a takedown always wins");
  assert.equal(beta.purgeEpisode(identity.feedUrl, identity.episodeId).translations, 1);
} finally { store.close(); }
const app = createStarCastServer({ store: new LocalStore(":memory:"), env: { STARCAST_DEV_INTELLIGENCE_TOKEN: "translation-test-token", STARCAST_ADMIN_TOKEN: "translation-admin-token", RADIOSTAR_TRANSLATE_BETA: "INTERNAL_TESTING" } });
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
try {
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const credential = "b".repeat(64), headers = { "content-type": "application/json", "x-star-cast-dev-token": "translation-test-token", authorization: `Bearer ${credential}` };
  assert.equal((await fetch(base + "/api/listener/register", { method: "POST", headers, body: JSON.stringify({ credential }) })).status, 200);
  const initial = await fetch(base + "/api/listener/translation", { headers });
  assert.equal(initial.status, 404, "translation stays hidden without server beta authorisation");
  const listener = app.listeners.authenticate(credential);
  assert.equal((await fetch(base + "/api/admin/translation/beta", { method: "POST", headers: { ...headers, "x-star-cast-admin-token": "translation-admin-token" }, body: JSON.stringify({ listenerId: listener.id, enabled: true }) })).status, 200);
  assert.equal((await fetch(base + "/api/listener/translation", { headers })).status, 200);
  assert.equal((await fetch(base + "/api/listener/translation", { method: "POST", headers, body: JSON.stringify({ listeningLanguage: "made-up" }) })).status, 400);
  const saved = await fetch(base + "/api/listener/translation", { method: "POST", headers, body: JSON.stringify({ listeningLanguage: "pt", listenInMyLanguage: true }) });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).preference.listeningLanguage, "pt");
} finally { await new Promise((resolve) => app.server.close(resolve)); app.store.close(); }
console.log("Translation language, beta, entitlement and rights gates passed");
