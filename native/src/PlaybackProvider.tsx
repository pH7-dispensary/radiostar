import {createContext,useContext,useEffect,useMemo,useRef,useState} from 'react';
import * as SecureStore from 'expo-secure-store';
import {createAudioPlayer,setAudioModeAsync,useAudioPlayerStatus} from 'expo-audio';
import type {PlaybackSnapshot} from './contracts';

export type Source={episodeId:string;url:string;title:string;show:string;artworkUrl?:string};
type Persisted={source:Source;snapshot:Pick<PlaybackSnapshot,'positionMs'|'speed'>};
type PlaybackContextValue={snapshot:PlaybackSnapshot;source:Source|null;play:(source:Source)=>Promise<void>;pause:()=>Promise<void>;seek:(ms:number)=>Promise<void>;setSpeed:(speed:number)=>Promise<void>;fadeAndPause:(durationMs:number)=>Promise<number>};
const KEY='star-cast-native-playback-v1';
const PlaybackContext=createContext<PlaybackContextValue|null>(null);

export function usePlayback(){let value=useContext(PlaybackContext);if(!value)throw Error('PlaybackProvider is required');return value}
export function PlaybackProvider({children}:{children:React.ReactNode}){
  let [snapshot,setSnapshot]=useState<PlaybackSnapshot>({episodeId:'',positionMs:0,durationMs:null,speed:1,playing:false,buffered:false,updatedAt:Date.now()}),[source,setSource]=useState<Source|null>(null),player=useMemo(()=>createAudioPlayer(null),[]),status=useAudioPlayerStatus(player),lastWrite=useRef(0);
  useEffect(()=>{
    void setAudioModeAsync({playsInSilentMode:true,shouldPlayInBackground:true,interruptionMode:'doNotMix'});
    let cancelled=false;
    void (async()=>{try{let raw=await SecureStore.getItemAsync(KEY);if(!raw||cancelled)return;let stored=JSON.parse(raw) as Persisted;if(!stored.source?.url)return;player.replace(stored.source.url);player.setPlaybackRate(stored.snapshot.speed||1);await player.seekTo((stored.snapshot.positionMs||0)/1000);if(!cancelled){setSource(stored.source);setSnapshot(s=>({...s,episodeId:stored.source.episodeId,positionMs:stored.snapshot.positionMs||0,speed:stored.snapshot.speed||1}))}}catch{/* Missing or stale state must not block playback. */}})();
    return()=>{cancelled=true;player.remove()}
  },[player]);
  useEffect(()=>{setSnapshot(previous=>({...previous,positionMs:Math.round((status.currentTime||0)*1000),durationMs:Number.isFinite(status.duration)?Math.round(status.duration*1000):previous.durationMs,playing:!!status.playing,buffered:!!status.isBuffering,updatedAt:Date.now()}))},[status.currentTime,status.duration,status.playing,status.isBuffering]);
  useEffect(()=>{if(!source||Date.now()-lastWrite.current<5_000)return;lastWrite.current=Date.now();void SecureStore.setItemAsync(KEY,JSON.stringify({source,snapshot:{positionMs:snapshot.positionMs,speed:snapshot.speed}} satisfies Persisted))},[source,snapshot.positionMs,snapshot.speed]);
  let value:PlaybackContextValue={
    snapshot,source,
    play:async next=>{if(source?.url!==next.url){player.replace(next.url);setSource(next);setSnapshot(s=>({...s,episodeId:next.episodeId,positionMs:0,durationMs:null,playing:false}))}player.setActiveForLockScreen(true,{title:next.title,artist:next.show,artworkUrl:next.artworkUrl},{showSeekBackward:true,showSeekForward:true});player.play()},
    pause:async()=>{player.pause()},
    seek:async ms=>{await player.seekTo(Math.max(0,ms)/1000)},
    setSpeed:async speed=>{player.setPlaybackRate(speed);setSnapshot(s=>({...s,speed}))},
    fadeAndPause:async durationMs=>{let pausedAt=snapshot.positionMs,steps=Math.max(1,Math.min(20,Math.round(durationMs/2_250)));for(let step=steps;step>0;step--){player.volume=step/steps;await new Promise<void>(resolve=>setTimeout(resolve,durationMs/steps))}player.pause();player.volume=1;return pausedAt}
  };
  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>
}
