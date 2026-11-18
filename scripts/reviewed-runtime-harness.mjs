// Browser acceptance harness for the actual native AdSkipRuntime component.
// Only platform hooks/audio are adapted; selection, polling and consumed-range
// protection run from the shipped TSX source unchanged. Not an iPhone test.
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const names=['react','react-dom','react-dom/client','scheduler'];
export function runtimeAsset(path) {
 if(path==='/react.mjs') {
  const files={react:'react/cjs/react.production.js','react-dom':'react-dom/cjs/react-dom.production.js','react-dom/client':'react-dom/cjs/react-dom-client.production.js',scheduler:'scheduler/cjs/scheduler.production.js'};
  const factories=names.map(name=>`${JSON.stringify(name)}:(module,exports,require)=>{${readFileSync('native/node_modules/'+files[name],'utf8')}\n}`).join(',');
  return `const factories={${factories}},cache={};function require(name){if(!cache[name]){const module={exports:{}};cache[name]=module;factories[name](module,module.exports,require);}return cache[name].exports;}export const React=require('react'),createRoot=require('react-dom/client').createRoot;export const {useEffect,useRef,useState}=React;`;
 }
 if(path==='/runtime.mjs') {
  const source=stripTypeScriptTypes(readFileSync('native/src/AdSkipRuntime.tsx','utf8'),{mode:'strip'}).replace(/^import .*?;\s*$/gm,'');
  return `import {useEffect,useRef,useState} from '/react.mjs';import {usePlayback,listenerRequest,onAdSkipPreferenceChange,AppState,Crypto,nativeDiagnostics} from '/harness.mjs';import {executeVerifiedSkip} from '/adapter.mjs';\n${source}`;
 }
 if(path==='/harness.mjs')return `import{React}from'/react.mjs';const callbacks=new Set();export function usePlayback(){React.useSyncExternalStore(cb=>{callbacks.add(cb);return()=>callbacks.delete(cb)},()=>window.runtimeRevision);return window.runtimePlayback;}export const refresh=()=>{window.runtimeRevision++;for(const cb of callbacks)cb()};export const listenerRequest=(path,input)=>window.runtimeApi(path,input);export const onAdSkipPreferenceChange=()=>()=>{};export const AppState={addEventListener:()=>({remove(){}})},Crypto=crypto,nativeDiagnostics={record(){}};`;
 return null;
}
export async function verifyRuntime(page,hash) {
 return page.evaluate(async hash=>{
  const {React,createRoot}=await import('/react.mjs'),{AdSkipRuntime}=await import('/runtime.mjs'),{refresh}=await import('/harness.mjs');
  const audio=document.querySelector('audio');audio.pause();audio.currentTime=0;audio.playbackRate=1.5;
  let seeks=0,notice=null,sourceRevision=1,proofChecks=0;
  const seek=ms=>new Promise((resolve,reject)=>{seeks++;const timer=setTimeout(()=>reject(Error('Seek timeout')),3000);audio.addEventListener('seeked',()=>{clearTimeout(timer);resolve(audio.currentTime*1000)},{once:true});audio.currentTime=ms/1000;});
  window.runtimeRevision=0;window.runtimePlayback={source:window.runtimeSource,snapshot:{},manualSeekRevision:0,audioVariantFingerprint:hash,getPositionMs:()=>audio.currentTime*1000,getPlaybackRevision:()=>sourceRevision,seekAutomatically:seek,attachAudioProof:async proof=>{proofChecks++;return proof.audioVariantFingerprint===hash;}};
  const tick=()=>{window.runtimePlayback.snapshot={playing:!audio.paused,positionMs:audio.currentTime*1000,durationMs:audio.duration*1000,speed:audio.playbackRate};refresh();};
  const rootElement=document.createElement('div');document.body.append(rootElement);const root=createRoot(rootElement);
  const onNotice=value=>{notice=typeof value==='function'?value(notice):value;};
  const wait=async predicate=>{const start=performance.now();while(!predicate()){if(performance.now()-start>20000)throw Error('Runtime observation timeout');await new Promise(r=>setTimeout(r,25));}};
  const timer=setInterval(tick,50);
  try{
   root.render(React.createElement(AdSkipRuntime,{onNotice}));await audio.play();await wait(()=>audio.currentTime>.2);tick();await wait(()=>notice);
   const origin=window.runtimeReceipts.findLast(r=>r.kind==='automatic_skip')?.originMs;
   await wait(()=>window.runtimeReceipts.some(r=>r.kind==='automatic_skip'));
   const skip=window.runtimeReceipts.findLast(r=>r.kind==='automatic_skip'),target=audio.currentTime*1000,after=audio.currentTime;await wait(()=>audio.currentTime>after);
   const automaticSeeks=seeks;const undo=notice.undo;audio.pause();tick();await undo();const restored=audio.currentTime*1000;
   await audio.play();tick();await new Promise(r=>setTimeout(r,11000));const noRepeat=seeks===automaticSeeks+1;
   return{component:'native/src/AdSkipRuntime.tsx',lateAttachment:window.runtimeAttachedAt>0,attachmentPositionMs:window.runtimeAttachedAt,originMs:skip.originMs,targetMs:skip.positionMs,observedAfterSeekMs:target,restoredMs:restored,automaticSeeks,undoSeeks:seeks-automaticSeeks,noRepeatAfterUndo:noRepeat,observationAfterUndoMs:11000,rate:audio.playbackRate,continuedPlayback:!audio.paused&&audio.currentTime*1000>restored,proofChecks,physicalIphoneVerified:false};
  }finally{clearInterval(timer);audio.pause();root.unmount();rootElement.remove();}
 },hash);
}
