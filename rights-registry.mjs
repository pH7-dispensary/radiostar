import { createHash, randomUUID } from "node:crypto";

export const RightsClassification = Object.freeze({
  LICENSED: "LICENSED",
  TDM_ELIGIBLE: "TDM_ELIGIBLE",
  RESTRICTED: "RESTRICTED",
  DISPUTED: "DISPUTED",
});

const permissions = [
  "canAcquireTranscript",
  "canProcessForAi",
  "canTranscribeAudio",
  "canDisplayCaptions",
  "canDisplayDerivedIntelligence",
  "canRetain",
  "canRegenerate",
  "canTranslateText",
  "canGenerateDubbedAudio",
  "canCacheTranslatedAudio",
  "canDistributeTranslation",
  "canCloneSpeakerVoice",
];
const key = (feedUrl, episodeId = "") =>
  createHash("sha256").update(JSON.stringify([feedUrl, episodeId])).digest("hex");
const bools = (input = {}) =>
  Object.fromEntries(permissions.map((name) => [name, input[name] === true]));

/**
 * Server-owned rights records deliberately default to no permission. A publisher
 * transcript link is provenance, not permission to process or display it.
 */
export class RightsRegistry {
  constructor(store, { now = Date.now } = {}) {
    this.store = store;
    this.now = now;
  }
  resolve(feedUrl, episodeId = "") {
    const episode = this.store.get("rights", key(feedUrl, episodeId));
    const podcast = this.store.get("rights", key(feedUrl));
    return (
      episode ||
      podcast || {
        id: null,
        feedUrl,
        episodeId: episodeId || null,
        classification: RightsClassification.RESTRICTED,
        publisher: null,
        licence: null,
        restrictions: "No rights assessment has authorised processing.",
        ...bools(),
        suspendedAt: null,
        deletedAt: null,
      }
    );
  }
  set(input, { actor = "admin" } = {}) {
    if (!input || typeof input.feedUrl !== "string" || !input.feedUrl)
      throw Error("A publisher feed is required.");
    if (!Object.values(RightsClassification).includes(input.classification))
      throw Error("Choose a valid rights classification.");
    if (input.episodeId !== undefined && typeof input.episodeId !== "string")
      throw Error("Episode identity is invalid.");
    for (const name of permissions)
      if (input[name] !== undefined && typeof input[name] !== "boolean")
        throw Error("Rights permissions must be true or false.");
    const id = key(input.feedUrl, input.episodeId || "");
    const prior = this.store.get("rights", id);
    const record = {
      id,
      feedUrl: input.feedUrl,
      episodeId: input.episodeId || null,
      publisher: typeof input.publisher === "string" ? input.publisher.slice(0, 300) : prior?.publisher || null,
      podcast: typeof input.podcast === "string" ? input.podcast.slice(0, 300) : prior?.podcast || null,
      classification: input.classification,
      licence: typeof input.licence === "string" ? input.licence.slice(0, 1000) : prior?.licence || null,
      restrictions: typeof input.restrictions === "string" ? input.restrictions.slice(0, 2000) : prior?.restrictions || null,
      assessmentDate: input.assessmentDate || new Date(this.now()).toISOString(),
      ...bools({ ...prior, ...input }),
      suspendedAt: input.suspendedAt || null,
      deletedAt: input.deletedAt || null,
      updatedAt: this.now(),
      updatedBy: actor,
      history: [...(prior?.history || []), {
        at: this.now(), actor, action: "assessment", classification: input.classification,
      }].slice(-50),
    };
    this.store.set("rights", id, record);
    return record;
  }
  suspend(feedUrl, episodeId, reason, { actor = "admin" } = {}) {
    const prior = this.resolve(feedUrl, episodeId);
    const id = key(feedUrl, episodeId || "");
    const record = {
      ...prior,
      id,
      feedUrl,
      episodeId: episodeId || null,
      classification: RightsClassification.DISPUTED,
      ...bools(),
      restrictions: String(reason || "Rights review pending.").slice(0, 2000),
      suspendedAt: this.now(),
      updatedAt: this.now(),
      updatedBy: actor,
      history: [...(prior.history || []), { at: this.now(), actor, action: "suspended", reason: String(reason || "").slice(0, 1000) }].slice(-50),
    };
    this.store.set("rights", id, record);
    return record;
  }
  markDeleted(feedUrl, episodeId, reason, { actor = "admin" } = {}) {
    const record = this.suspend(feedUrl, episodeId, reason, { actor });
    const deleted = {
      ...record,
      deletedAt: this.now(),
      history: [...record.history, { at: this.now(), actor, action: "deleted" }].slice(-50),
    };
    this.store.set("rights", deleted.id, deleted);
    return deleted;
  }
  list() {
    return this.store.all("rights").map(([, value]) => value);
  }
  audit(action, target, actor, metadata = {}) {
    this.store.set("rights-audit", randomUUID(), {
      action,
      target,
      actor,
      metadata,
      at: this.now(),
    });
  }
}
