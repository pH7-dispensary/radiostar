export type SleepTimerChoice={kind:'minutes';minutes:number}|{kind:'end_of_episode'};
export type AiSleepSession={startedAt:number;predictedOnsetAt:number;earliestPauseAt:number;extensions:number[];recoveryPositionMs?:number};

/** A deterministic timer that pauses the shared audio engine, never a UI-only countdown. */
export class NativeSleepTimer {
  private timeout:ReturnType<typeof setTimeout>|null=null;
  private endsAt:number|null=null;
  private endsWithEpisode=false;
  constructor(private readonly pause:()=>Promise<void>){ }
  start(choice:SleepTimerChoice){this.cancel();if(choice.kind==='end_of_episode'){this.endsWithEpisode=true;return}this.endsAt=Date.now()+choice.minutes*60_000;this.timeout=setTimeout(()=>{void this.pause();this.cancel()},choice.minutes*60_000)}
  onEpisodeEnd(){if(this.endsWithEpisode)void this.pause();this.cancel()}
  cancel(){if(this.timeout)clearTimeout(this.timeout);this.timeout=null;this.endsAt=null;this.endsWithEpisode=false}
  get endAt(){return this.endsAt}
}

/**
 * Native playback bridge for the existing AI Sleep domain. Inference may request
 * `beginGraceAndFade`; it cannot infer sleep from background JavaScript alone.
 */
export class NativeAiSleepBridge {
  session:AiSleepSession|null=null;
  constructor(private readonly fadeAndPause:(durationMs:number)=>Promise<number>,private readonly now=()=>Date.now()){}
  start(predictedMinutes:number=30){let startedAt=this.now(), predictedOnsetAt=startedAt+predictedMinutes*60_000;this.session={startedAt,predictedOnsetAt,earliestPauseAt:predictedOnsetAt,extensions:[]};return this.session}
  extend(minutes:number){if(!this.session)throw Error('AI Sleep is not active');this.session={...this.session,earliestPauseAt:this.session.earliestPauseAt+minutes*60_000,extensions:[...this.session.extensions,minutes]};return this.session}
  async beginGraceAndFade(fadeMs=45_000){if(!this.session)throw Error('AI Sleep is not active');if(this.now()<this.session.earliestPauseAt)throw Error('Minimum listening protection is active');let recoveryPositionMs=await this.fadeAndPause(fadeMs);this.session={...this.session,recoveryPositionMs};return this.session}
  stop(){this.session=null}
}
