import { readFile, mkdtemp, rm, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffprobe from 'ffprobe-static';
import ffmpeg from 'ffmpeg-static';
import { toFile } from 'openai';
import { acquireAudioPrefix, AD_WINDOW_MAX_BYTES } from './bounded-audio.mjs';
const exec=promisify(execFile);
export const AUDIO_BLOCK_BYTES=65536;
const zero='0'.repeat(64),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const audioChain = (previous, bytes) => sha(Buffer.concat([Buffer.from(previous,'hex'),Buffer.from(sha(bytes),'hex')]));
const fail = message => Object.assign(Error(message),{code:'PROGRESSIVE_ALIGNMENT_UNAVAILABLE'});
async function index(path) {
  const {stdout}=await exec(ffprobe.path,['-v','error','-protocol_whitelist','file,pipe','-select_streams','a:0','-show_entries','format=format_name,start_time:packet=pos,size,pts_time,duration_time','-of','json',path],{timeout:30000,maxBuffer:16*1024*1024});
  const data=JSON.parse(stdout);
  if(data.format?.format_name!=='mp3')throw fail('Progressive analysis requires an exact MP3 packet timeline.');
  const packets=(data.packets||[]).map(p=>({byte:Number(p.pos),size:Number(p.size),ptsMs:Number(p.pts_time)*1000,durationMs:Number(p.duration_time)*1000}));
  if(!packets.length || packets.some(p=>!Number.isSafeInteger(p.byte)||!Number.isSafeInteger(p.size)||!Number.isFinite(p.ptsMs)||!(p.durationMs>0)))throw fail('The bounded source has no reliable packet timeline.');
  return {packets,startTimeMs:Number(data.format.start_time||0)*1000};
}
// Cursor timestamps are measured packet positions, never duration/byte ratios.
// The first overlapping block must match; native delivery must additionally
// match the chain of EVERY preceding block before any global seek is allowed.
export async function nextAudioCursor(path,{coverageEndMs,rangeStart=0,offsetMs,chainBefore=zero,packets:provided}={}) {
  const measured=provided?{packets:provided}:await index(path),packets=measured.packets;
  const offset=offsetMs??-measured.startTimeMs;
  const anchor=packets.find(p=>p.ptsMs+offset>=coverageEndMs-125000);
  if(!anchor || anchor.ptsMs+offset<30000)return null;
  const startByte=Math.floor((rangeStart+anchor.byte)/AUDIO_BLOCK_BYTES)*AUDIO_BLOCK_BYTES;
  if(startByte<=rangeStart)return null;
  const bytes=await readFile(path),local=startByte-rangeStart;
  if(local+AUDIO_BLOCK_BYTES>bytes.length)return null;
  let chain=chainBefore;for(let i=0;i<local;i+=AUDIO_BLOCK_BYTES)chain=audioChain(chain,bytes.subarray(i,i+AUDIO_BLOCK_BYTES));
  return {version:'mp3-window-cursor-v1',startByte,chainBefore:chain,anchorByte:rangeStart+anchor.byte,anchorPtsMs:anchor.ptsMs+offset,
    overlapSha256:sha(bytes.subarray(local,local+AUDIO_BLOCK_BYTES)),coverageStartMs:Math.max(0,coverageEndMs-120000)};
}
export async function prepareProgressiveAudioWindow(audioUrl,{cursor,signal,acquire=acquireAudioPrefix}={}) {
  if(cursor?.version!=='mp3-window-cursor-v1'||!Number.isSafeInteger(cursor.startByte)||cursor.startByte<0||cursor.startByte%AUDIO_BLOCK_BYTES||!Number.isFinite(cursor.coverageStartMs)||cursor.coverageStartMs<0||!Number.isFinite(cursor.anchorPtsMs)||!Number.isSafeInteger(cursor.anchorByte)||!/^([a-f0-9]{64})$/.test(cursor.chainBefore||'')||!/^([a-f0-9]{64})$/.test(cursor.overlapSha256||''))throw fail('A measured preceding window is required.');
  const dir=await mkdtemp(join(tmpdir(),'starcast-ad-progressive-')),path=join(dir,'window.mp3'),cleanup=()=>rm(dir,{recursive:true,force:true});
  try {
    const source=await acquire(audioUrl,path,{startByte:cursor.startByte,signal}),bytes=await readFile(path);
    if(bytes.length>AD_WINDOW_MAX_BYTES||sha(bytes.subarray(0,AUDIO_BLOCK_BYTES))!==cursor.overlapSha256)throw fail('The overlapping source bytes changed.');
    const {packets}=await index(path),anchor=packets.find(p=>p.byte+cursor.startByte===cursor.anchorByte);
    if(!anchor)throw fail('The previous timestamp anchor is absent.');
    const offsetMs=cursor.anchorPtsMs-anchor.ptsMs;
    const {stdout:frameJson}=await exec(ffprobe.path,['-v','error','-protocol_whitelist','file,pipe','-read_intervals','%+2','-select_streams','a:0','-show_entries','frame=best_effort_timestamp_time,nb_samples','-of','json',path],{signal,timeout:30000,maxBuffer:256000});
    const firstFrame=JSON.parse(frameJson).frames?.[0];
    if(!firstFrame || !Number.isFinite(Number(firstFrame.best_effort_timestamp_time)))throw fail('Decoded audio has no measured timestamp.');
    const timelineOffsetMs=offsetMs+Number(firstFrame.best_effort_timestamp_time)*1000;
    const coverageStartMs=Math.max(cursor.coverageStartMs,Math.ceil(timelineOffsetMs+2000));
    const availableEnd=packets.at(-1).ptsMs+packets.at(-1).durationMs+offsetMs;
    const coverageEndMs=Math.floor(Math.min(coverageStartMs+180000,availableEnd-(source.completeSource?0:2000)));
    if(coverageEndMs-coverageStartMs<1000)throw fail('No complete progressive window is available.');
    const last=packets.find(p=>p.ptsMs+offsetMs>=coverageEndMs+1500)||packets.at(-1);
    const wanted=Math.ceil((last.byte+last.size)/AUDIO_BLOCK_BYTES)*AUDIO_BLOCK_BYTES;
    const proofBytes=Math.min(wanted,source.completeSource?bytes.length:Math.floor(bytes.length/AUDIO_BLOCK_BYTES)*AUDIO_BLOCK_BYTES);
    if(last.byte+last.size>proofBytes && !source.completeSource)throw fail('Window proof does not cover its final packet.');
    await truncate(path,proofBytes);
    const content=bytes.subarray(0,proofBytes),contentHash=sha(content);let chain=cursor.chainBefore;
    for(let i=0;i<content.length;i+=AUDIO_BLOCK_BYTES)chain=audioChain(chain,content.subarray(i,i+AUDIO_BLOCK_BYTES));
    const completeSource=source.completeSource && proofBytes===bytes.length;
    const nextCursor=completeSource?null:await nextAudioCursor(path,{rangeStart:cursor.startByte,coverageEndMs,offsetMs,chainBefore:cursor.chainBefore,packets});
    return {path,cleanup,contentHash,delivery:source.delivery,timelineOffsetMs,durationMs:availableEnd,cursor:nextCursor,completeSource,
      windowProof:{version:'delivered-chain-v1',byteStart:cursor.startByte,byteLength:proofBytes,byteEnd:cursor.startByte+proofBytes,sha256:contentHash,chainHash:chain,blockBytes:AUDIO_BLOCK_BYTES,coverageStartMs,coverageEndMs},
      chunkFactory:async part=>{
        if(part.startMs<0||part.endMs>coverageEndMs-coverageStartMs||part.endMs<=part.startMs)throw Error('Chunk exceeds acquired progressive audio.');
        const output=join(dir,`chunk-${part.index}.mp3`),start=(coverageStartMs-timelineOffsetMs+part.startMs)/1000,end=(coverageStartMs-timelineOffsetMs+part.endMs)/1000;
        await exec(ffmpeg,['-nostdin','-y','-v','error','-protocol_whitelist','file,pipe','-i',path,'-af',`atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS`,'-vn','-ac','1','-ar','16000','-b:a','48k',output],{signal,timeout:60000});
        return toFile(await readFile(output),'ad-window.mp3',{type:'audio/mpeg'});
      }};
  }catch(error){await cleanup();throw error;}
}
