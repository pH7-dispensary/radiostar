import { createHash } from "node:crypto";
/** Provider-neutral Radio Star Translate contract. No provider is active here. */
export const TranslationBetaState = Object.freeze({
  DISABLED: "DISABLED", INTERNAL_TESTING: "INTERNAL_TESTING", PRIVATE_BETA: "PRIVATE_BETA",
  PUBLIC_BETA: "PUBLIC_BETA", PRODUCTION: "PRODUCTION",
});

export const languages = Object.freeze([
  { tag: "en", label: "English" }, { tag: "zh-Hans", label: "Mandarin Chinese" },
  { tag: "hi", label: "Hindi" }, { tag: "es", label: "Spanish" }, { tag: "ar", label: "Arabic" },
  { tag: "fr", label: "French" }, { tag: "bn", label: "Bengali" }, { tag: "pt", label: "Portuguese" },
  { tag: "ru", label: "Russian" }, { tag: "id", label: "Indonesian" }, { tag: "de", label: "German" },
  { tag: "ja", label: "Japanese" },
]);
const tags = new Set(languages.map((language) => language.tag));
export const validLanguage = (value) => typeof value === "string" && tags.has(value);
export const languageFor = (value) => languages.find((language) => language.tag === value) || null;
export const translationKey = (input) => createHash("sha256").update(JSON.stringify([
  input.feedUrl, input.episodeId, input.audioVariant, input.sourceLanguage,
  input.targetLanguage, input.voiceProfile, input.translationVersion, input.rightsVersion,
])).digest("hex");
export function validAlignment(segments) {
  if (!Array.isArray(segments) || !segments.length) return false;
  let previousOriginal = 0, previousTranslated = 0;
  return segments.every((segment) => {
    const values = [segment.originalStartMs, segment.originalEndMs, segment.translatedStartMs, segment.translatedEndMs];
    if (!values.every(Number.isFinite) || segment.originalStartMs < previousOriginal || segment.translatedStartMs < previousTranslated ||
      segment.originalEndMs <= segment.originalStartMs || segment.translatedEndMs <= segment.translatedStartMs) return false;
    previousOriginal = segment.originalEndMs; previousTranslated = segment.translatedEndMs;
    return true;
  });
}

export function translationControls(env = process.env) {
  const state = Object.values(TranslationBetaState).includes(env.RADIOSTAR_TRANSLATE_BETA)
    ? env.RADIOSTAR_TRANSLATE_BETA : TranslationBetaState.DISABLED;
  return { state, enabled: state !== TranslationBetaState.DISABLED,
    // A flag does not authorise generation until a provider passes evaluation.
    providerAvailable: false, automaticPlaybackAvailable: false, languages };
}

export class TranslationService {
  constructor({ rights, subscriptions, env = process.env } = {}) {
    this.rights = rights; this.subscriptions = subscriptions; this.controls = translationControls(env);
  }
  config(listener) {
    const preference = listener.languagePreferences || {};
    const entitlement = this.subscriptions.entitlement(listener);
    return { visible: this.visible(listener), controls: this.controls, preference: {
      listeningLanguage: validLanguage(preference.listeningLanguage) ? preference.listeningLanguage : null,
      listenInMyLanguage: preference.listenInMyLanguage === true,
      naturalVoices: preference.naturalVoices !== false,
    }, entitlement: { active: entitlement.active, expiresAt: entitlement.expiresAt },
    availability: this.controls.enabled && entitlement.active && this.controls.providerAvailable ? "AVAILABLE"
      : this.controls.enabled ? "PREPARING" : "UNAVAILABLE" };
  }
  visible(listener) {
    const access = listener && this.rights.store.get("translation-beta", listener.id);
    return Boolean(this.controls.enabled && access && !access.revokedAt);
  }
  setBetaAccess(listenerId, enabled, actor = "admin") {
    if (typeof listenerId !== "string" || !/^[0-9a-f-]{36}$/i.test(listenerId) || typeof enabled !== "boolean")
      throw Error("A valid beta listener and enabled state are required.");
    const existing = this.rights.store.get("translation-beta", listenerId);
    const record = { listenerId, enabled, authorisedAt: existing?.authorisedAt || Date.now(), updatedAt: Date.now(), actor,
      revokedAt: enabled ? null : Date.now() };
    this.rights.store.set("translation-beta", listenerId, record);
    return record;
  }
  eligible(feedUrl, episodeId) {
    const rights = this.rights.resolve(feedUrl, episodeId);
    return Boolean(rights.canTranslateText && rights.canGenerateDubbedAudio &&
      rights.canCacheTranslatedAudio && rights.canDistributeTranslation && !rights.suspendedAt && !rights.deletedAt);
  }
  cacheStatus(identity) {
    const key = translationKey(identity);
    return this.rights.store.get("translation", key) || null;
  }
  cacheReady(identity, record) {
    if (!this.eligible(identity.feedUrl, identity.episodeId) || !validLanguage(identity.sourceLanguage) ||
      !validLanguage(identity.targetLanguage) || identity.sourceLanguage === identity.targetLanguage || !validAlignment(record.alignment))
      throw Error("A rights-authorised, aligned translation is required.");
    const key = translationKey(identity);
    const value = { id: key, ...identity, state: "READY", audioUrl: record.audioUrl || null,
      alignment: record.alignment, createdAt: Date.now(), actualCostUsd: Number.isFinite(record.actualCostUsd) ? record.actualCostUsd : null };
    this.rights.store.set("translation", key, value);
    return value;
  }
  purgeEpisode(feedUrl, episodeId) {
    let removed = 0;
    for (const [id, record] of this.rights.store.all("translation"))
      if (record.feedUrl === feedUrl && record.episodeId === episodeId) { this.rights.store.delete("translation", id); removed++; }
    return { translations: removed };
  }
}
