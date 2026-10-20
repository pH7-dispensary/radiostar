import { AiSleepEngine, type SleepSummary } from "../../sleep.mjs";
import { readLocalDocument, writeLocalDocument } from "./localStorage";
let learningRevision = 0;
export async function resetSleepLearning() {
  learningRevision++;
  await writeLocalDocument(
    "star-cast-sleep-learning-v1",
    JSON.stringify({ history: [] }),
  );
}

export type SleepTimerChoice =
  { kind: "minutes"; minutes: number } | { kind: "end_of_episode" };
export type AiSleepSession = {
  startedAt: number;
  predictedOnsetAt: number;
  earliestPauseAt: number;
  extensions: number[];
  recoveryPositionMs?: number;
};

/** A deterministic timer that pauses the shared audio engine, never a UI-only countdown. */
export class NativeSleepTimer {
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private endsAt: number | null = null;
  private endsWithEpisode = false;
  constructor(
    private readonly pause: () => Promise<void>,
    private readonly onError: (error: unknown) => void = () => {},
  ) {}
  start(choice: SleepTimerChoice) {
    this.cancel();
    if (choice.kind === "end_of_episode") {
      this.endsWithEpisode = true;
      return;
    }
    if (![5, 10, 15, 20, 30, 45, 60, 90].includes(choice.minutes))
      throw Error("Choose a supported sleep timer.");
    this.endsAt = Date.now() + choice.minutes * 60_000;
    this.timeout = setTimeout(() => {
      void this.check().catch(this.onError);
    }, choice.minutes * 60_000);
  }
  async check(now = Date.now()) {
    if (this.endsAt !== null && now >= this.endsAt) {
      this.cancel();
      await this.pause();
    }
  }
  onEpisodeEnd() {
    if (this.endsWithEpisode) {
      this.cancel();
      void this.pause().catch(this.onError);
    }
  }
  cancel() {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
    this.endsAt = null;
    this.endsWithEpisode = false;
  }
  get endAt() {
    return this.endsAt;
  }
  get endOfEpisode() {
    return this.endsWithEpisode;
  }
}

/** Shared deterministic inference; only available observations are supplied. */
export class NativeAiSleepBridge {
  session: AiSleepSession | null = null;
  engine = new AiSleepEngine();
  ready = false;
  interrupted = false;
  recovered: { sourceKey: string; lastHeard: number; pausedAt: number } | null =
    null;
  private sourceKey = "";
  private fading = false;
  private serial = 0;
  private learningRevision = learningRevision;
  private syncLearningReset() {
    if (this.learningRevision !== learningRevision) {
      this.engine.history = [];
      this.learningRevision = learningRevision;
    }
  }
  constructor(
    private readonly fadeAndPause: (durationMs: number) => Promise<number>,
    private readonly now = () => Date.now(),
  ) {
    void readLocalDocument("star-cast-sleep-learning-v1")
      .then((raw) => {
        if (raw && !this.session) {
          const value = JSON.parse(raw);
          this.engine = new AiSleepEngine({
            history: Array.isArray(value.history) ? value.history : [],
          });
        }
      })
      .catch(() => {})
      .then(async () => {
        const raw = await readLocalDocument("star-cast-sleep-session-v1");
        if (!raw) return;
        const value = JSON.parse(raw);
        this.interrupted = value.state === "SETTLING";
        if (
          value.state === "PAUSED" &&
          typeof value.sourceKey === "string" &&
          Number.isFinite(value.lastHeard) &&
          value.lastHeard >= 0 &&
          Number.isFinite(value.pausedAt) &&
          value.pausedAt >= value.lastHeard
        ) {
          this.recovered = {
            sourceKey: value.sourceKey,
            lastHeard: value.lastHeard,
            pausedAt: value.pausedAt,
          };
          const completed = value.engineSession;
          // Restore only completed feedback context; never a running session.
          if (
            completed?.recorded === true &&
            Array.isArray(completed.extensions) &&
            [
              "startedAt",
              "preferredMinimumMs",
              "predictedSleepOnsetAt",
              "earliestPauseAt",
            ].every((key) => Number.isFinite(completed[key])) &&
            this.engine.history.at(-1)?.createdAt === completed.startedAt
          ) {
            this.engine.session = completed;
            this.engine.state = "PAUSED";
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        this.ready = true;
      });
  }
  private sync() {
    const session = this.engine.session;
    this.session = session
      ? {
          startedAt: session.startedAt,
          predictedOnsetAt: session.predictedSleepOnsetAt,
          earliestPauseAt: session.earliestPauseAt,
          extensions: session.extensions.map((x) => x.minutes),
          recoveryPositionMs: session.recoveryPosition ?? undefined,
        }
      : null;
    return this.session;
  }
  private persist() {
    this.syncLearningReset();
    void writeLocalDocument(
      "star-cast-sleep-learning-v1",
      JSON.stringify({ history: this.engine.history.slice(-90) }),
    ).catch(() => {});
  }
  start(positionMs = 0, sourceKey = "") {
    this.syncLearningReset();
    if (!this.ready)
      throw Error("Sleep preferences are loading. Please try again.");
    this.serial++;
    this.sourceKey = sourceKey;
    this.recovered = null;
    this.interrupted = false;
    this.engine.start({ now: this.now(), positionMs });
    void writeLocalDocument(
      "star-cast-sleep-session-v1",
      JSON.stringify({ sourceKey, state: "SETTLING", startedAt: this.now() }),
    ).catch(() => {});
    return this.sync()!;
  }
  extend(minutes: number) {
    this.serial++;
    this.fading = false;
    if (
      ![5, 15, 30].includes(minutes) ||
      !this.engine.extend(minutes, { now: this.now() }).extended
    )
      throw Error("AI Sleep is not active");
    // Keep the most recent session learning signal current without interpreting it as sleep.
    const current = this.engine.session!;
    this.engine.history = this.engine.history.filter(
      (x) => x.createdAt !== current.startedAt,
    );
    current.recorded = false;
    this.engine.recordSession();
    this.persist();
    return this.sync()!;
  }
  interact(positionMs: number, playing: boolean) {
    if (!this.session || this.fading) return;
    this.engine.observe({
      now: this.now(),
      positionMs,
      playing,
      interacted: true,
    });
    this.sync();
  }
  async tick(positionMs: number, playing: boolean) {
    if (!this.session || this.fading || this.engine.state === "PAUSED")
      return this.engine.state;
    const result = this.engine.observe({
      now: this.now(),
      positionMs,
      playing,
    });
    if (result.state === "FADING") {
      this.fading = true;
      const token = this.serial;
      try {
        const recovery = await this.fadeAndPause(45_000);
        if (token === this.serial && this.engine.session) {
          this.engine.session.pausePosition = recovery;
          this.engine.session.recoveryPosition = Math.max(
            0,
            recovery - 300_000,
          );
          this.engine.state = "PAUSED";
          this.engine.recordSession();
          this.persist();
          this.recovered = {
            sourceKey: this.sourceKey,
            lastHeard: Math.max(0, recovery - 300_000),
            pausedAt: recovery,
          };
          await writeLocalDocument(
            "star-cast-sleep-session-v1",
            JSON.stringify({
              ...this.recovered,
              state: "PAUSED",
              engineSession: this.engine.session,
            }),
          );
        }
      } catch (error) {
        if (token === this.serial) throw error;
      } finally {
        if (token === this.serial) this.fading = false;
      }
    }
    this.sync();
    return this.engine.state;
  }
  feedback(kind: "early" | "correct" | "late", minutes = 5) {
    this.engine.feedback(kind, minutes);
    this.persist();
  }
  async clearLearning() {
    this.engine.history = [];
    await writeLocalDocument(
      "star-cast-sleep-learning-v1",
      JSON.stringify({ history: [] }),
    );
  }
  async beginGraceAndFade(fadeMs = 45_000) {
    if (!this.session) throw Error("AI Sleep is not active");
    if (this.now() < this.session.earliestPauseAt)
      throw Error("Minimum listening protection is active");
    return this.fadeAndPause(fadeMs);
  }
  stop() {
    this.serial++;
    this.fading = false;
    this.recovered = null;
    void writeLocalDocument(
      "star-cast-sleep-session-v1",
      JSON.stringify({ state: "STOPPED" }),
    ).catch(() => {});
    if (this.engine.session?.extensions.length) this.engine.recordSession();
    this.persist();
    this.engine.cancel();
    this.sync();
  }
}
