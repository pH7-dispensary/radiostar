import { AiSleepEngine, type SleepSummary } from "../../sleep.mjs";
import { readLocalDocument, writeLocalDocument } from "./localStorage";
import type { SleepDriver, SleepRecord } from "./nativeSleep";
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
  fallbackDeadlineAt?: number;
};

/** A deterministic timer that pauses the shared audio engine, never a UI-only countdown. */
export class NativeSleepTimer {
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private endsAt: number | null = null;
  private endsWithEpisode = false;
  private id = "";
  lastRecord: SleepRecord | null = null;
  constructor(
    private readonly pause: () => Promise<void>,
    private readonly onError: (error: unknown) => void = () => {},
    private readonly driver?: SleepDriver,
  ) {}
  start(choice: SleepTimerChoice) {
    this.cancel();
    this.id = `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (choice.kind === "end_of_episode") {
      this.endsWithEpisode = true;
      if (this.driver?.available) this.armNative("end");
      return;
    }
    if (![5, 10, 15, 20, 30, 45, 60, 90].includes(choice.minutes))
      throw Error("Choose a supported sleep timer.");
    this.endsAt = Date.now() + choice.minutes * 60_000;
    if (this.driver?.available) { this.armNative("manual"); return; }
    this.timeout = setTimeout(() => {
      void this.check().catch(this.onError);
    }, choice.minutes * 60_000);
  }
  private armNative(kind: string) {
    const id = this.id;
    void this.driver!.arm(id, kind, this.endsAt || Date.now()+1000, 10000).then(row => {
      if(this.id === id) { this.endsAt = row.deadlineAt; this.lastRecord = row; }
    }).catch(error => { if(this.id === id) { this.cancel(); this.onError(error); } });
  }
  extend(minutes: number) {
    if (![5,15,30].includes(minutes) || !this.endsAt || this.endsWithEpisode) throw Error("Start a fixed sleep timer first.");
    this.endsAt = Math.max(Date.now(),this.endsAt)+minutes*60000;
    if (this.driver?.available) { const id=this.id; void this.driver.extend(id,minutes*60000).then(row=>{if(this.id===id)this.endsAt=row.deadlineAt;}).catch(error=>{if(this.id===id){this.cancel();this.onError(error);}}); }
    else { if(this.timeout) clearTimeout(this.timeout); this.timeout=setTimeout(()=>{void this.check().catch(this.onError);},this.endsAt-Date.now()); }
  }
  async check(now = Date.now()) {
    if (this.driver?.available) {
      const row = await this.driver.state();
      if (!this.id && row?.state === "PAUSED" && ["manual","end"].includes(row.kind)) this.id = row.id;
      if (row?.id !== this.id) this.lastRecord = null;
      if (row?.id === this.id) { this.lastRecord = row; this.endsAt = ["ARMED","FADING"].includes(row.state) ? row.deadlineAt : null; if(!this.endsAt) this.endsWithEpisode=false; }
      return;
    }
    if (this.endsAt !== null && now >= this.endsAt) {
      this.cancel();
      await this.pause();
    }
  }
  onEpisodeEnd() {
    if (this.driver?.available) { void this.check().catch(this.onError); return; }
    if (this.endsWithEpisode) {
      this.cancel();
      void this.pause().catch(this.onError);
    }
  }
  cancel() {
    if(this.id) void this.driver?.cancel(this.id).catch(this.onError);
    this.id = "";
    this.lastRecord = null;
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
  private nativeId = "";
  private fallbackDeadlineAt: number | undefined;
  nativeRecord: SleepRecord | null = null;
  private completedNativeId = "";
  private lastWall=0; private lastMonotonic=0; private deadlineOnly=false;
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
    private readonly driver?: SleepDriver,
    private readonly onError: (error: unknown) => void = () => {},
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
        const value = raw ? JSON.parse(raw) : {};
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
      .then(async () => {
        if (this.driver?.available) await this.reconcileNative();
      }).catch(this.onError)
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
          fallbackDeadlineAt: this.fallbackDeadlineAt,
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
    this.lastWall=this.now(); this.lastMonotonic=performance.now(); this.deadlineOnly=false;
    this.engine.start({ now: this.now(), positionMs });
    this.nativeId = `ai-${this.now()}-${Math.random().toString(36).slice(2)}`;
    this.armFallback();
    void writeLocalDocument(
      "star-cast-sleep-session-v1",
      JSON.stringify({ sourceKey, state: "SETTLING", startedAt: this.now(), engineSession: this.engine.session, nativeId: this.nativeId }),
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
    if(this.driver?.available) { const id=this.nativeId; void this.driver.extend(id,minutes*60000).then(row=>{if(this.nativeId===id){this.fallbackDeadlineAt=row.deadlineAt;this.sync();}}).catch(error=>{if(this.nativeId===id){this.stop();this.onError(error);}}); }
    void writeLocalDocument("star-cast-sleep-session-v1",JSON.stringify({sourceKey:this.sourceKey,state:"SETTLING",engineSession:this.engine.session,nativeId:this.nativeId})).catch(this.onError);
    return this.sync()!;
  }
  interact(positionMs: number, playing: boolean) {
    if (!this.session || ["OFF","PAUSED"].includes(this.engine.state)) return;
    if (this.fading) { this.serial++; this.fading = false; }
    if(this.deadlineOnly) { if(this.nativeRecord?.state === "FADING") void this.driver?.extend(this.nativeId,300000).catch(this.onError); return; }
    this.engine.observe({
      now: this.now(),
      positionMs,
      playing,
      interacted: true,
    });
    this.armFallback();
    this.sync();
  }
  private armFallback(fadeNow = false) {
    if (!this.driver?.available || !this.engine.session) return;
    const settings = this.engine.settings;
    this.fallbackDeadlineAt = fadeNow ? this.now()+settings.fadeMs : Math.max(this.engine.session.earliestPauseAt,this.now()+settings.graceMs)+settings.confirmationMs+settings.graceMs+settings.fadeMs;
    const token = this.serial;
    void this.driver.arm(this.nativeId,"ai",this.fallbackDeadlineAt!,settings.fadeMs).catch(error => { if(token===this.serial) { this.stop(); this.onError(error); } });
  }
  async reconcileNative() {
    if (!this.driver?.available) return;
    const row = await this.driver.state();
    if (!row || row.kind !== "ai" || (this.nativeId && row.id !== this.nativeId)) return;
    this.nativeRecord = row;
    this.fallbackDeadlineAt = row.deadlineAt;
    this.sync();
    if (this.completedNativeId === row.id && row.state === "PAUSED") return row;
    if (row.state === "PAUSED" && Number.isFinite(row.positionMs)) {
      this.completedNativeId=row.id; this.sourceKey=row.sourceKey; this.interrupted=false;
      this.recovered={sourceKey:row.sourceKey,lastHeard:row.recoveryMs ?? row.positionMs!,pausedAt:row.positionMs!};
      if (!this.engine.session) {
        const saved = await readLocalDocument("star-cast-sleep-session-v1");
        const previous = saved ? JSON.parse(saved) : null;
        if(previous?.nativeId===row.id) this.engine.session=previous.engineSession;
      }
      if (this.engine.session) {
        this.engine.session.pausePosition=row.positionMs!; this.engine.session.recoveryPosition=this.recovered.lastHeard;
        this.engine.recordSession(); this.persist();
      }
      this.engine.state="PAUSED"; this.sync();
      await writeLocalDocument("star-cast-sleep-session-v1",JSON.stringify({...this.recovered,state:"PAUSED",engineSession:this.engine.session,nativeId:row.id}));
    } else if (["CANCELLED","INTERRUPTED"].includes(row.state)) {
      this.interrupted=true; this.engine.cancel(); this.sync();
    }
    return row;
  }
  async tick(positionMs: number, playing: boolean) {
    if (this.driver?.available) {
      await this.reconcileNative();
      if(this.nativeRecord?.state === "FADING") return "FADING";
      const wall=this.now(),mono=performance.now();
      if(this.lastWall && Math.abs((wall-this.lastWall)-(mono-this.lastMonotonic))>5000) this.deadlineOnly=true;
      this.lastWall=wall;this.lastMonotonic=mono;
      if(this.deadlineOnly) return this.engine.state;
    }
    if (!this.session || this.fading || this.engine.state === "PAUSED")
      return this.engine.state;
    const result = this.engine.observe({
      now: this.now(),
      positionMs,
      playing,
    });
    if (result.state === "FADING" && this.driver?.available) { this.armFallback(true); return "FADING"; }
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
    if(this.nativeId || this.nativeRecord?.id) void this.driver?.cancel(this.nativeId || this.nativeRecord?.id).catch(this.onError);
    this.nativeId=""; this.nativeRecord=null; this.fallbackDeadlineAt=undefined;
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
