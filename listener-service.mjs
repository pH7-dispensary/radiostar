import { createHash, randomBytes, randomUUID } from "node:crypto";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const eventKey = (owner, event) => digest(`${owner}:${event}`);
const validEvent = (s) =>
  typeof s === "string" && /^[a-zA-Z0-9_-]{8,120}$/.test(s);
const categories = ["advert", "intro", "title_sequence", "preview", "outro"];
const defaultSkipPreferences = () => ({
  adSkipEnabled: false,
  ...Object.fromEntries(categories.map((category) => [category, false])),
});
export class ListenerError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Local adapter for the existing installation/referral/session/allowance contracts.
 * No public method can approve fraud checks or promote listening reports to verified usage.
 * A production receipt verifier must call reconcile() after authenticating its source.
 */
export class ListenerService {
  constructor(
    store,
    { now = Date.now, inviteOrigin = null, friendBonusMinutes = 0 } = {},
  ) {
    this.store = store;
    this.now = now;
    this.inviteOrigin =
      inviteOrigin && /^https:\/\/[^/]+$/.test(inviteOrigin)
        ? inviteOrigin
        : null;
    this.friendBonusMinutes =
      Number.isSafeInteger(friendBonusMinutes) && friendBonusMinutes >= 0
        ? friendBonusMinutes
        : 0;
  }
  register(credential) {
    if (
      typeof credential !== "string" ||
      !/^[a-zA-Z0-9_-]{32,200}$/.test(credential)
    )
      throw new ListenerError("A secure installation credential is required.");
    const hash = digest(credential);
    return this.store.transaction(() => {
      const old = this.store.get("installation", hash);
      if (this.store.get("revoked-installation", hash) || old?.revokedAt)
        throw new ListenerError("This listener profile has been deleted or revoked.", 401);
      if (old) return old;
      const listener = {
        id: randomUUID(),
        credentialHash: hash,
        code: randomBytes(9).toString("base64url"),
        createdAt: this.now(),
        onboardedAt: null,
        preferences: defaultSkipPreferences(),
        languagePreferences: { listeningLanguage: null, listenInMyLanguage: false, naturalVoices: true },
      };
      this.store.set("installation", hash, listener);
      this.store.set("invite-code", listener.code, { owner: listener.id });
      this.store.set("allowance-ledger", `base:${listener.id}`, {
        owner: listener.id,
        kind: "base",
        monthlyMinutes: 600,
        effectiveAt: this.now(),
      });
      return listener;
    });
  }
  authenticate(credential) {
    if (typeof credential !== "string" || credential.length > 200) return null;
    const listener = this.store.get("installation", digest(credential));
    return listener && !listener.revokedAt ? listener : null;
  }
  deleteProfile(listener) {
    return this.store.transaction(() => {
      const ownedKinds = ["invite-code", "allowance-ledger", "follow", "listening-event",
        "listening-session", "offline-listening", "problem-report", "verified-subject", "qualification-audit", "subscription"];
      for (const kind of ownedKinds)
        for (const [id, record] of this.store.all(kind))
          if (record.owner === listener.id) this.store.delete(kind, id);
      const feedback = new Set();
      for (const [id, record] of this.store.all("skip-feedback"))
        if (record.owner === listener.id) { feedback.add(id); this.store.delete("skip-feedback", id); }
      for (const [id, record] of this.store.all("skip-vote"))
        if (feedback.has(record.reportId)) this.store.delete("skip-vote", id);
      for (const [id, record] of this.store.all("referral"))
        if (record.referrer === listener.id || record.referred === listener.id) {
          // Other listeners keep already-earned recurring allowances, without a link to this person.
          for (const [entryId, entry] of this.store.all("allowance-ledger"))
            if (entry.referralId === record.id) {
              const { referralId, ...retained } = entry;
              this.store.set("allowance-ledger", entryId, retained);
            }
          this.store.delete("referral", id);
        }
      for (const [id, record] of this.store.all("pilot-device"))
        if (record.listenerId === listener.id)
          this.store.set("pilot-device", id, { id, revokedAt: new Date(this.now()).toISOString() });
      for (const [id, record] of this.store.all("rights-audit"))
        if (record.actor === listener.id) this.store.set("rights-audit", id, { ...record, actor: "deleted-listener" });
      this.store.delete("listening-clock", listener.id);
      this.store.delete("installation", listener.credentialHash);
      // Minimal revocation marker prevents a delayed registration from recreating a deleted profile.
      this.store.set("revoked-installation", listener.credentialHash, { revokedAt: this.now() });
      return { deleted: true };
    });
  }
  update(listener, patch) {
    const fresh = this.store.get("installation", listener.credentialHash);
    this.store.set("installation", listener.credentialHash, {
      ...fresh,
      ...patch,
    });
  }
  onboard(listener) {
    this.store.transaction(() => {
      if (!this.store.get("installation", listener.credentialHash).onboardedAt)
        this.update(listener, { onboardedAt: this.now() });
    });
    return this.summary(listener);
  }
  attribute(listener, code) {
    return this.store.transaction(() => {
      const inviter =
        typeof code === "string" && code.length <= 40
          ? this.store.get("invite-code", code)
          : null;
      if (!inviter || inviter.owner === listener.id)
        throw new ListenerError("This invite cannot be used by this listener.");
      const existing = this.store.get("referral", listener.id);
      if (existing) {
        if (existing.referrer !== inviter.owner)
          throw new ListenerError(
            "An invite is already linked to this listener.",
            409,
          );
        return { status: existing.status };
      }
      const fresh = this.store.get("installation", listener.credentialHash);
      // Invite attribution precedes onboarding; existing listeners cannot farm new-listener rewards.
      if (fresh.onboardedAt || this.now() - fresh.createdAt > 7 * 86400000)
        throw new ListenerError(
          "Invites are for new listeners before onboarding.",
        );
      this.store.set("referral", listener.id, {
        id: randomUUID(),
        referrer: inviter.owner,
        referred: listener.id,
        code,
        status: "pending",
        qualificationMinutes: 30,
        createdAt: this.now(),
      });
      return { status: "pending" };
    });
  }
  preferences(listener, input) {
    if (
      !input ||
      (input.adSkipEnabled !== undefined && typeof input.adSkipEnabled !== "boolean") ||
      categories.some(
        (c) => input[c] !== undefined && typeof input[c] !== "boolean",
      )
    )
      throw new ListenerError("Choose valid skip preferences.");
    return this.store.transaction(() => {
      const fresh = this.store.get("installation", listener.credentialHash);
      const preferences = {
        ...defaultSkipPreferences(),
        ...fresh.preferences,
        ...(input.adSkipEnabled === undefined ? {} : { adSkipEnabled: input.adSkipEnabled }),
        ...Object.fromEntries(
          categories
            .filter((c) => input[c] !== undefined)
            .map((c) => [c, input[c]]),
        ),
      };
      this.update(listener, { preferences });
      return { preferences, automaticSkipping: false };
    });
  }
  languagePreferences(listener, input) {
    if (!input || (input.listeningLanguage !== undefined &&
      (typeof input.listeningLanguage !== "string" || input.listeningLanguage.length > 35)) ||
      (input.listenInMyLanguage !== undefined && typeof input.listenInMyLanguage !== "boolean") ||
      (input.naturalVoices !== undefined && typeof input.naturalVoices !== "boolean"))
      throw new ListenerError("Choose valid language preferences.");
    return this.store.transaction(() => {
      const fresh = this.store.get("installation", listener.credentialHash);
      const languagePreferences = { ...fresh.languagePreferences, ...input };
      this.update(listener, { languagePreferences });
      return languagePreferences;
    });
  }
  follow(listener, { feedUrl, following }) {
    if (typeof feedUrl !== "string" || !feedUrl || typeof following !== "boolean")
      throw new ListenerError("A valid podcast follow update is required.");
    const id = `follow:${listener.id}:${digest(feedUrl)}`;
    if (!following) {
      this.store.delete("follow", id);
      return { following: false, feedUrl };
    }
    this.store.set("follow", id, {
      id,
      owner: listener.id,
      feedUrl,
      createdAt: this.now(),
      updatedAt: this.now(),
      intelligenceEnabled: this.store.get("installation", listener.credentialHash)?.intelligenceEnabled !== false,
    });
    return { following: true, feedUrl };
  }
  followedFeeds() {
    return [...new Set(this.store.all("follow").filter(([, record]) => record.intelligenceEnabled !== false).map(([, record]) => record.feedUrl))];
  }
  privacy(listener, { intelligenceEnabled }) {
    if (typeof intelligenceEnabled !== "boolean") throw new ListenerError("Choose a valid intelligence preference.");
    return this.store.transaction(() => {
      this.update(listener, { intelligenceEnabled });
      for (const [id, record] of this.store.all("follow"))
        if (record.owner === listener.id) this.store.set("follow", id, { ...record, intelligenceEnabled });
      return { intelligenceEnabled };
    });
  }
  summary(listener) {
    const now = this.now(),
      date = new Date(now),
      start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
      reset = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    const entries = this.store
      .all("allowance-ledger")
      .map(([, v]) => v)
      .filter(
        (v) =>
          v.owner === listener.id &&
          !v.reversedAt &&
          v.effectiveAt <= now &&
          (!v.expiresAt || v.expiresAt > now),
      );
    const earnedMinutes = entries
      .filter((v) => v.kind === "referral")
      .reduce((s, v) => s + v.monthlyMinutes, 0);
    const monthlyMinutes = entries.reduce((s, v) => s + v.monthlyMinutes, 0);
    const sessions = this.store
      .all("listening-session")
      .map(([, v]) => v)
      .filter(
        (v) =>
          v.owner === listener.id && v.endedAt > start && v.startedAt < reset,
      );
    const consumedMs = unionDuration(
      sessions
        .filter((v) => v.status === "verified")
        .map((v) => [Math.max(start, v.startedAt), Math.min(reset, v.endedAt)]),
    );
    const pendingMs = unionDuration(
      sessions
        .filter((v) => v.status !== "verified")
        .map((v) => [Math.max(start, v.startedAt), Math.min(reset, v.endedAt)]),
    );
    const referrals = this.store
      .all("referral")
      .map(([, v]) => v)
      .filter((v) => v.referrer === listener.id);
    const fresh = this.store.get("installation", listener.credentialHash);
    const ownReferral = this.store.get("referral", listener.id);
    const listenedMs = unionDuration(
      this.store
        .all("listening-session")
        .map(([, v]) => v)
        .filter((v) => v.owner === listener.id && v.status === "verified")
        .map((v) => [v.startedAt, v.endedAt]),
    );
    return {
      monthlyMinutes,
      earnedMinutes,
      consumedMinutes: consumedMs / 60000,
      remainingMinutes: Math.max(0, monthlyMinutes - consumedMs / 60000),
      pendingMinutes: pendingMs / 60000,
      resetAt: new Date(reset).toISOString(),
      qualifiedReferrals: referrals.filter((v) => v.status === "qualified")
        .length,
      pendingReferrals: referrals.filter((v) => v.status === "pending").length,
      code: fresh.code,
      inviteUrl: this.inviteOrigin
        ? `${this.inviteOrigin}/invite/${fresh.code}`
        : `starcast://invite/${fresh.code}`,
      webInviteAvailable: !!this.inviteOrigin,
      qualificationMinutes: 30,
      referralProgressMinutes: Math.min(30, listenedMs / 60000),
      referralStatus: ownReferral?.status || null,
      preferences: { ...defaultSkipPreferences(), ...(fresh.preferences || {}) },
      friendBonusMinutes: this.friendBonusMinutes,
      enforcement: false,
      verificationAvailable: false,
    };
  }
  heartbeat(listener, input) {
    const { eventId, sessionId, episodeId, feedUrl, positionMs, playing, speed } = input;
    if (
      !validEvent(eventId) ||
      !validEvent(sessionId) ||
      typeof episodeId !== "string" ||
      episodeId.length < 1 ||
      episodeId.length > 2000 ||
      (feedUrl !== undefined && (typeof feedUrl !== "string" || feedUrl.length > 4000)) ||
      !Number.isFinite(positionMs) ||
      positionMs < 0 ||
      typeof playing !== "boolean" ||
      !Number.isFinite(speed) ||
      speed < 0.5 ||
      speed > 3
    )
      throw new ListenerError("A valid playback update is required.");
    return this.store.transaction(() => {
      const key = eventKey(listener.id, eventId);
      if (this.store.get("listening-event", key)) return { received: true };
      const now = this.now(),
        previous = this.store.get("listening-clock", listener.id);
      // One clock per owner: no credit from overlapping devices, pauses, seeks, stale or offline time.
      if (
        previous &&
        previous.sessionId === sessionId &&
        previous.playing &&
        playing
      ) {
        const elapsed = now - previous.at,
          advance = positionMs - previous.positionMs;
        if (
          elapsed > 0 &&
          elapsed <= 30000 &&
          advance > 0 &&
          advance <= elapsed * Math.max(speed, previous.speed) + 1500
        ) {
          const duration = Math.min(
            elapsed,
            advance / Math.max(speed, previous.speed),
          );
          this.store.set("listening-session", key, {
            id: key,
            owner: listener.id,
            startedAt: now - duration,
            endedAt: now,
            status: "pending",
            source: "online_observation",
          });
        }
      }
      this.store.set("listening-clock", listener.id, {
        sessionId,
        episodeId,
        feedUrl: feedUrl || null,
        at: now,
        positionMs,
        playing,
        speed,
      });
      this.store.set("listening-event", key, { owner: listener.id, at: now });
      return { received: true };
    });
  }
  captionPlayback(listener, { feedUrl, episodeId, positionMs }) {
    const clock = this.store.get("listening-clock", listener.id);
    if (
      !clock ||
      clock.episodeId !== episodeId ||
      clock.feedUrl !== feedUrl ||
      !Number.isFinite(positionMs) ||
      positionMs < 0 ||
      this.now() - clock.at > 45_000 ||
      Math.abs(clock.positionMs - positionMs) > 90_000
    )
      throw new ListenerError(
        "Start playback before requesting captions for this moment.",
        403,
      );
    return clock;
  }
  reportProblem(listener, input) {
    const categories = ["incorrect_skip", "missed_advert", "playback", "episode_information", "ai_answer", "caption", "other"];
    if (!input || !validEvent(input.eventId) || !categories.includes(input.category))
      throw new ListenerError("Choose a valid problem category.");
    if (input.note !== undefined && (typeof input.note !== "string" || input.note.length > 1000))
      throw new ListenerError("Keep the report note under 1,000 characters.");
    if (input.positionMs !== undefined && (!Number.isFinite(input.positionMs) || input.positionMs < 0))
      throw new ListenerError("Problem position is invalid.");
    const id = eventKey(listener.id, input.eventId);
    if (!this.store.get("problem-report", id))
      this.store.set("problem-report", id, {
        id,
        owner: listener.id,
        category: input.category,
        feedUrl: typeof input.feedUrl === "string" ? input.feedUrl.slice(0, 4000) : null,
        episodeId: typeof input.episodeId === "string" ? input.episodeId.slice(0, 2000) : null,
        audioVariant: typeof input.audioVariant === "string" ? input.audioVariant.slice(0, 200) : null,
        positionMs: input.positionMs ?? null,
        feature: typeof input.feature === "string" ? input.feature.slice(0, 100) : null,
        appVersion: typeof input.appVersion === "string" ? input.appVersion.slice(0, 100) : null,
        note: input.note?.trim() || null,
        status: "open",
        createdAt: this.now(),
      });
    return { received: true };
  }
  offline(listener, input) {
    if (
      !validEvent(input.eventId) ||
      !Array.isArray(input.reports) ||
      input.reports.length > 100
    )
      throw new ListenerError("A bounded offline report is required.");
    const reports = input.reports
      .filter(
        (r) =>
          Number.isFinite(r.positionMs) &&
          r.positionMs >= 0 &&
          Number.isFinite(r.at) &&
          typeof r.playing === "boolean",
      )
      .map((r) => ({ positionMs: r.positionMs, at: r.at, playing: r.playing }));
    this.store.set("offline-listening", eventKey(listener.id, input.eventId), {
      owner: listener.id,
      reports,
      status: "pending",
      receivedAt: this.now(),
    });
    return { received: true, counted: false };
  }
  /** Internal trusted integration boundary, deliberately NOT routed over HTTP.
   * Caller must independently verify identity + receipt provenance. Never forward client input here.
   */
  reconcile({ owner, eventId, subjectHash, actor, sessions, fraudApproved }) {
    if (
      !validEvent(eventId) ||
      !/^[a-f0-9]{64}$/.test(subjectHash || "") ||
      !actor ||
      fraudApproved !== true ||
      !Array.isArray(sessions)
    )
      throw new ListenerError("Independent verification is required.");
    return this.store.transaction(() => {
      const auditKey = eventKey(actor, eventId);
      if (this.store.get("qualification-audit", auditKey))
        return { duplicate: true };
      const listener = this.store
        .all("installation")
        .map(([, v]) => v)
        .find((v) => v.id === owner && !v.revokedAt);
      if (!listener) throw new ListenerError("Listener unavailable.");
      if (listener.subjectHash && listener.subjectHash !== subjectHash)
        throw new ListenerError(
          "A verified listener cannot change identity through a receipt.",
        );
      const identity = this.store.get("verified-subject", subjectHash);
      if (identity && identity.owner !== owner)
        throw new ListenerError(
          "This verified identity already belongs to a listener.",
        );
      const accepted = sessions.map((id) =>
        this.store.get("listening-session", id),
      );
      if (accepted.some((s) => !s || s.owner !== owner))
        throw new ListenerError("Receipt does not match this listener.");
      this.store.set("verified-subject", subjectHash, { owner });
      this.update(listener, { subjectHash });
      for (const s of accepted)
        this.store.set("listening-session", s.id, {
          ...s,
          status: "verified",
          verifiedBy: actor,
          receipt: eventId,
        });
      this.store.set("qualification-audit", auditKey, {
        owner,
        actor,
        eventId,
        at: this.now(),
        sessions,
      });
      // Re-evaluate pending referrals after either side receives independently verified identity.
      for (const [, referral] of this.store.all("referral")) {
        if (referral.status !== "pending") continue;
        const people = this.store.all("installation").map(([, v]) => v);
        const friend = people.find(
            (v) => v.id === referral.referred && !v.revokedAt,
          ),
          inviter = people.find(
            (v) => v.id === referral.referrer && !v.revokedAt,
          );
        if (
          !friend?.onboardedAt ||
          !friend.subjectHash ||
          !inviter?.subjectHash ||
          friend.subjectHash === inviter.subjectHash
        )
          continue;
        const duration = unionDuration(
          this.store
            .all("listening-session")
            .map(([, v]) => v)
            .filter(
              (v) =>
                v.owner === friend.id &&
                v.status === "verified" &&
                v.startedAt >= referral.createdAt,
            )
            .map((v) => [v.startedAt, v.endedAt]),
        );
        if (duration < referral.qualificationMinutes * 60000) continue;
        this.store.set("referral", friend.id, {
          ...referral,
          status: "qualified",
          qualifiedAt: this.now(),
        });
        this.store.set("allowance-ledger", `referral:${referral.id}`, {
          owner: inviter.id,
          kind: "referral",
          monthlyMinutes: 300,
          referralId: referral.id,
          effectiveAt: this.now(),
          actor,
          eventId,
        });
        // Optional friend bonus expires at the next reset; never invent a permanent friend entitlement.
        const today = new Date(this.now()),
          expiresAt = Date.UTC(
            today.getUTCFullYear(),
            today.getUTCMonth() + 1,
            1,
          );
        if (this.friendBonusMinutes)
          this.store.set("allowance-ledger", `friend:${referral.id}`, {
            owner: friend.id,
            kind: "friend_bonus",
            monthlyMinutes: this.friendBonusMinutes,
            referralId: referral.id,
            effectiveAt: this.now(),
            expiresAt,
            actor,
            eventId,
          });
      }
      return { duplicate: false };
    });
  }
}
export function unionDuration(ranges) {
  let total = 0,
    end = -Infinity;
  for (const [a, b] of ranges.sort((x, y) => x[0] - y[0])) {
    if (b > Math.max(a, end)) total += b - Math.max(a, end);
    end = Math.max(end, b);
  }
  return total;
}
