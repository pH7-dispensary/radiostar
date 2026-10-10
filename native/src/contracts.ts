export type PlaybackReason = 'user'|'sleep_timer'|'interruption'|'ended'|'error';
export type PlaybackSnapshot = { episodeId:string; positionMs:number; durationMs:number|null; speed:number; playing:boolean; buffered:boolean; updatedAt:number };
export interface PlaybackEngine { play(source:{episodeId:string;url:string}):Promise<void>; pause(reason:PlaybackReason):Promise<void>; seek(positionMs:number):Promise<void>; setSpeed(speed:number):Promise<void>; snapshot():PlaybackSnapshot; }
export interface SleepTimerEngine { start(durationMs:number):void; cancel():void; onEpisodeEnd():void; }
export interface AISleepEngine { start():void; stop():void; }
export type PositionSync={episodeId:string;positionMs:number;sequence:number;updatedAt:string;completed?:boolean};
