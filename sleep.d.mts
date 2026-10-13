export type SleepSummary={preferredEstimateMs:number|null;correct:boolean|null;extensions:Array<{minutes:number;at:number}>;createdAt:number};
export type SleepSession={startedAt:number;predictedSleepOnsetAt:number;preferredMinimumMs:number;earliestPauseAt:number;extensions:Array<{minutes:number;at:number}>;recoveryPosition:number|null;pausePosition:number|null;[key:string]:unknown};
export class AiSleepEngine {
  constructor(options?:{settings?:Record<string,number|boolean>;history?:SleepSummary[]});
  history:SleepSummary[];session:SleepSession|null;state:string;confidence:number;
  start(options?:{now?:number;positionMs?:number;localHour?:number}):{started:boolean};
  extend(minutes:number,options?:{now:number}):{extended:boolean};
  personalisedEstimateMs():number;
  recordSession():void;cancel():void;
  observe(options?:{now?:number;positionMs?:number;playing?:boolean;interacted?:boolean}):{state:string;action?:string;fadeProgress?:number};
  feedback(kind:string,minutes?:number):SleepSummary|undefined;
}
