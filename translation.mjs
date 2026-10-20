import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { PutObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";

const exec = promisify(execFile), require = createRequire(import.meta.url), ffprobePath = require("ffprobe-static").path;
const dollars = (value) => Number(Number(value).toFixed(6));
export const TranslationBetaState = Object.freeze({ DISABLED: "DISABLED", INTERNAL_TESTING: "INTERNAL_TESTING", PRIVATE_BETA: "PRIVATE_BETA", PUBLIC_BETA: "PUBLIC_BETA", PRODUCTION: "PRODUCTION" });
export const languages = Object.freeze([
  { tag: "en", label: "English" }, { tag: "zh-Hans", label: "Mandarin Chinese" }, { tag: "hi", label: "Hindi" }, { tag: "es", label: "Spanish" }, { tag: "ar", label: "Arabic" }, { tag: "fr", label: "French" }, { tag: "bn", label: "Bengali" }, { tag: "pt", label: "Portuguese" }, { tag: "ru", label: "Russian" }, { tag: "id", label: "Indonesian" }, { tag: "de", label: "German" }, { tag: "ja", label: "Japanese" },
]);
const tags = new Set(languages.map((language) => language.tag));
export const validLanguage = (value) => typeof value === "string" && tags.has(value);
export const languageFor = (value) => languages.find((language) => language.tag === value) || null;
export const translationKey = (input) => createHash("sha256").update(JSON.stringify([input.feedUrl, input.episodeId, input.audioVariant, input.sourceLanguage, input.targetLanguage, input.voiceProfile, input.translationVersion, input.rightsVersion])).digest("hex");
export function validAlignment(segments) {
  if (!Array.isArray(segments) || !segments.length) return false;
  let previousOriginal = 0, previousTranslated = 0;
  return segments.every((segment) => {
    const values = [segment.originalStartMs, segment.originalEndMs, segment.translatedStartMs, segment.translatedEndMs];
    if (!values.every(Number.isFinite) || segment.originalStartMs < previousOriginal || segment.translatedStartMs < previousTranslated || segment.originalEndMs <= segment.originalStartMs || segment.translatedEndMs <= segment.translatedStartMs) return false;
    previousOriginal = segment.originalEndMs; previousTranslated = segment.translatedEndMs; return true;
  });
}
export const translationControls = (env = process.env) => {
  const state = Object.values(TranslationBetaState).includes(env.RADIOSTAR_TRANSLATE_BETA) ? env.RADIOSTAR_TRANSLATE_BETA : TranslationBetaState.DISABLED;
  const providerAvailable = state === TranslationBetaState.INTERNAL_TESTING && env.RADIOSTAR_TRANSLATE_PROVIDER === "aws" && Boolean(env.STARCAST_TRANSLATION_BUCKET) && env.AWS_REGION === "eu-west-2";
  return { state, enabled: state !== TranslationBetaState.DISABLED, providerAvailable, automaticPlaybackAvailable: false, languages, dailyUsd: 2, monthlyUsd: 10, maxSourceSeconds: 600 };
};

// This ledger is independent of the OpenAI ledger. LocalStore transactions use BEGIN IMMEDIATE.
export class TranslationLedger {
  constructor({ store, controls }) { this.store = store; this.controls = controls; this.reservations = new Map(); this.usage = []; this.refresh(); }
  refresh() { const saved = this.store.get("translation-budget", "ledger"); if (saved) { this.reservations = new Map(saved.reservations || []); this.usage = saved.usage || []; } }
  mutate(fn) { return this.store.transaction(() => { this.refresh(); const value = fn(); this.store.set("translation-budget", "ledger", { reservations: [...this.reservations], usage: this.usage }); return value; }); }
  totals(now = Date.now()) { const day = new Date(now).toISOString().slice(0, 10), month = day.slice(0, 7), rows = [...this.usage, ...this.reservations.values()]; const sum = (filter) => dollars(rows.filter(filter).reduce((total, row) => total + row.estimatedCostUsd, 0)); return { dayUsd: sum((row) => row.at.startsWith(day)), monthUsd: sum((row) => row.at.startsWith(month)), rows: rows.length }; }
  reserve({ id, sourceSeconds, translatedCharacters, synthesisedCharacters, provider }) {
    return this.mutate(() => {
      if (!id || !Number.isFinite(sourceSeconds) || sourceSeconds <= 0 || sourceSeconds > this.controls.maxSourceSeconds || !Number.isInteger(translatedCharacters) || translatedCharacters < 1 || !Number.isInteger(synthesisedCharacters) || synthesisedCharacters < 1) throw Error("Translation request is outside the private beta limits.");
      if (this.reservations.has(id) || this.usage.some((row) => row.id === id)) throw Error("This translation has already been reserved.");
      // Conservative ceilings: AWS does not return per-call cost to the application.
      const estimatedCostUsd = dollars((translatedCharacters + synthesisedCharacters) * 0.00002), totals = this.totals();
      if (totals.dayUsd + estimatedCostUsd > this.controls.dailyUsd || totals.monthUsd + estimatedCostUsd > this.controls.monthlyUsd) throw Error("The private translation budget has been reached.");
      const record = { id, at: new Date().toISOString(), provider, sourceSeconds, translatedCharacters, synthesisedCharacters, estimatedCostUsd, status: "RESERVED" }; this.reservations.set(id, record); return record;
    });
  }
  reconcile(id, patch) { return this.mutate(() => { const reserved = this.reservations.get(id); if (!reserved) return null; this.reservations.delete(id); const row = { ...reserved, ...patch, status: patch.status || "COMPLETE", estimatedCostUsd: dollars(patch.estimatedCostUsd ?? reserved.estimatedCostUsd), completedAt: new Date().toISOString() }; this.usage.push(row); return row; }); }
  fail(id, reason) { return this.reconcile(id, { status: "FAILED", failure: String(reason || "provider failure").slice(0, 200), actualCostUsd: null }); }
}

const streamToBuffer = async (stream) => { const chunks = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); };
const withoutSpeaker = (segment) => String(segment.text || "").replace(/^\s*[^:]{1,80}:\s*/, "").trim();
async function mp3Duration(buffer) {
  const directory = await mkdtemp(join(tmpdir(), "starcast-translation-")), file = join(directory, "dub.mp3");
  try { await writeFile(file, buffer, { mode: 0o600 }); const { stdout } = await exec(ffprobePath, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file], { timeout: 20_000 }); const seconds = Number(String(stdout).trim()); if (!Number.isFinite(seconds) || seconds <= 0) throw Error("Generated audio has no valid duration."); return Number(seconds.toFixed(3)); } finally { await rm(directory, { recursive: true, force: true }); }
}

export class TranslationService {
  constructor({ rights, subscriptions, intelligencePolicy = null, env = process.env, store } = {}) { this.rights = rights; this.subscriptions = subscriptions; this.intelligencePolicy = intelligencePolicy; this.env = env; this.controls = translationControls(env); this.store = store || rights.store; this.ledger = new TranslationLedger({ store: this.store, controls: this.controls }); }
  config(listener) { const preference = listener.languagePreferences || {}, entitlement = this.subscriptions.entitlement(listener); return { visible: this.visible(listener), controls: this.controls, preference: { listeningLanguage: validLanguage(preference.listeningLanguage) ? preference.listeningLanguage : null, listenInMyLanguage: preference.listenInMyLanguage === true, naturalVoices: preference.naturalVoices !== false }, entitlement: { active: entitlement.active, expiresAt: entitlement.expiresAt }, availability: this.controls.enabled && this.controls.providerAvailable ? "AVAILABLE" : this.controls.enabled ? "PREPARING" : "UNAVAILABLE" }; }
  visible(listener) { const access = listener && this.rights.store.get("translation-beta", listener.id); return Boolean(this.controls.enabled && access?.enabled === true && !access.revokedAt); }
  setBetaAccess(listenerId, enabled, actor = "admin") { if (typeof listenerId !== "string" || !/^[0-9a-f-]{36}$/i.test(listenerId) || typeof enabled !== "boolean") throw Error("A valid beta listener and enabled state are required."); const existing = this.rights.store.get("translation-beta", listenerId), record = { listenerId, enabled, authorisedAt: existing?.authorisedAt || Date.now(), updatedAt: Date.now(), actor, revokedAt: enabled ? null : Date.now() }; this.rights.store.set("translation-beta", listenerId, record); return record; }
  eligible(feedUrl, episodeId) { const rights = this.rights.resolve(feedUrl, episodeId), operational = this.intelligencePolicy?.allows(feedUrl, episodeId, "dubbing"); return Boolean(rights.canTranslateText && rights.canGenerateDubbedAudio && rights.canCacheTranslatedAudio && rights.canDistributeTranslation && !rights.suspendedAt && !rights.deletedAt && (!operational || operational.allowed)); }
  cacheStatus(identity) { return this.rights.store.get("translation", translationKey(identity)) || null; }
  cacheReady(identity, record) { if (!this.eligible(identity.feedUrl, identity.episodeId) || !validLanguage(identity.sourceLanguage) || !validLanguage(identity.targetLanguage) || identity.sourceLanguage === identity.targetLanguage || !validAlignment(record.alignment)) throw Error("A rights-authorised, aligned translation is required."); const id = translationKey(identity), value = { id, ...identity, state: "READY", audioKey: record.audioKey || null, alignment: record.alignment, createdAt: Date.now(), actualCostUsd: Number.isFinite(record.actualCostUsd) ? record.actualCostUsd : null, audioDurationSeconds: record.audioDurationSeconds ?? null, speakerDistinct: record.speakerDistinct === true, provider: record.provider || null }; this.rights.store.set("translation", id, value); return value; }
  async generateOwnedFixture({ listener, identity, segments, sourceSeconds }) {
    if (!this.visible(listener) || !this.controls.providerAvailable) throw Error("Translation is not available for this private listener.");
    if (!this.eligible(identity.feedUrl, identity.episodeId)) throw Error("Translation rights are not authorised for this episode.");
    const cached = this.cacheStatus(identity); if (cached?.state === "READY") return { cacheReuse: true, record: cached }; if (cached?.state === "PROCESSING") throw Error("This translation is already processing.");
    if (!Array.isArray(segments) || !segments.length || !segments.every((s) => Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.endMs > s.startMs && withoutSpeaker(s))) throw Error("The owned fixture requires complete timed speech.");
    const sourceText = segments.map(withoutSpeaker).join("\n\n"), id = translationKey(identity), reservation = this.ledger.reserve({ id, sourceSeconds, translatedCharacters: sourceText.length, synthesisedCharacters: Math.ceil(sourceText.length * 1.35), provider: "aws-translate+polly" });
    this.store.set("translation", id, { id, ...identity, state: "PROCESSING", reservedAt: Date.now(), reservationId: reservation.id });
    try {
      const region = "eu-west-2", translate = new TranslateClient({ region }), polly = new PollyClient({ region }), s3 = new S3Client({ region }), translated = [];
      // Whole timed speaker turns preserve local conversational context; no expensive correction model is used.
      for (const segment of segments) { const response = await translate.send(new TranslateTextCommand({ Text: withoutSpeaker(segment), SourceLanguageCode: "en", TargetLanguageCode: "pt" })); if (!response.TranslatedText) throw Error("Translate returned no text."); translated.push({ ...segment, translatedText: response.TranslatedText }); }
      const audio = [];
      for (const segment of translated) { const speech = await polly.send(new SynthesizeSpeechCommand({ Engine: "neural", LanguageCode: "pt-PT", VoiceId: "Ines", OutputFormat: "mp3", Text: segment.translatedText, TextType: "text" })); if (!speech.AudioStream) throw Error("Polly returned no audio."); audio.push(await streamToBuffer(speech.AudioStream)); }
      const output = Buffer.concat(audio); if (output.length < 1024) throw Error("Generated audio is unexpectedly small.");
      const audioDurationSeconds = await mp3Duration(output), key = `translation-cache/${id}.mp3`;
      await s3.send(new PutObjectCommand({ Bucket: this.env.STARCAST_TRANSLATION_BUCKET, Key: key, Body: output, ContentType: "audio/mpeg", ServerSideEncryption: "AES256", CacheControl: "private, no-store", Metadata: { source_language: "en", target_language: "pt-PT", beta: "internal" } }));
      let position = 0; const totalOriginal = segments.reduce((total, segment) => total + (segment.endMs - segment.startMs), 0);
      const alignment = translated.map((segment) => { const originalDuration = segment.endMs - segment.startMs, translatedDuration = Math.max(1, Math.round(audioDurationSeconds * 1000 * originalDuration / totalOriginal)), row = { originalStartMs: segment.startMs, originalEndMs: segment.endMs, translatedStartMs: position, translatedEndMs: position + translatedDuration, speaker: segment.speaker || null }; position += translatedDuration; return row; });
      const usage = this.ledger.reconcile(id, { status: "COMPLETE", audioDurationSeconds, translatedCharacters: sourceText.length, synthesisedCharacters: translated.reduce((total, segment) => total + segment.translatedText.length, 0), actualCostUsd: null, costEstimated: true });
      const record = this.cacheReady(identity, { audioKey: key, alignment, actualCostUsd: usage.estimatedCostUsd, audioDurationSeconds, speakerDistinct: false, provider: "aws-translate+polly" }); this.rights.audit("translation-generated", id, "listener", { provider: record.provider, sourceSeconds, audioDurationSeconds, cacheReuse: false, speakerDistinct: false }); return { cacheReuse: false, record };
    } catch (error) { this.ledger.fail(id, error.message); this.store.set("translation", id, { id, ...identity, state: "FAILED", failedAt: Date.now() }); throw error; }
  }
  async signedAudioUrl(identity) { const record = this.cacheStatus(identity); if (record?.state !== "READY" || !record.audioKey || !this.eligible(identity.feedUrl, identity.episodeId)) return null; return getSignedUrl(new S3Client({ region: "eu-west-2" }), new GetObjectCommand({ Bucket: this.env.STARCAST_TRANSLATION_BUCKET, Key: record.audioKey, ResponseContentType: "audio/mpeg", ResponseCacheControl: "no-store" }), { expiresIn: 300 }); }
  status() { this.ledger.refresh(); return { controls: this.controls, totals: this.ledger.totals(), usage: this.ledger.usage, reservations: [...this.ledger.reservations.values()] }; }
  purgeEpisode(feedUrl, episodeId) { let removed = 0; for (const [id, record] of this.rights.store.all("translation")) if (record.feedUrl === feedUrl && record.episodeId === episodeId) { this.rights.store.delete("translation", id); removed++; } return { translations: removed }; }
  purgeFeed(feedUrl) { let removed = 0; for (const [id, record] of this.rights.store.all("translation")) if (record.feedUrl === feedUrl) { this.rights.store.delete("translation", id); removed++; } return { translations: removed }; }
}
