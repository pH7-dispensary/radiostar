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
    return { controls: this.controls, preference: {
      listeningLanguage: validLanguage(preference.listeningLanguage) ? preference.listeningLanguage : null,
      listenInMyLanguage: preference.listenInMyLanguage === true,
      naturalVoices: preference.naturalVoices !== false,
    }, entitlement: { active: entitlement.active, expiresAt: entitlement.expiresAt },
    availability: this.controls.enabled && entitlement.active && this.controls.providerAvailable ? "AVAILABLE"
      : this.controls.enabled ? "PREPARING" : "UNAVAILABLE" };
  }
  eligible(feedUrl, episodeId) {
    const rights = this.rights.resolve(feedUrl, episodeId);
    return Boolean(rights.canTranslateText && rights.canGenerateDubbedAudio &&
      rights.canCacheTranslatedAudio && rights.canDistributeTranslation && !rights.suspendedAt && !rights.deletedAt);
  }
}
