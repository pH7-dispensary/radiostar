import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import {corpusDirectory,corpusMetrics,verifyReviewChain} from '../ad-skip-corpus.mjs';
const root=corpusDirectory(),manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));let events=[];
try{events=JSON.parse(await readFile(join(root,'reviews.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}verifyReviewChain(events);
const digest=async path=>{const hash=createHash('sha256');for await(const b of createReadStream(path))hash.update(b);return hash.digest('hex');};
for(const e of manifest.episodes)if(await digest(join(root,e.audioPath))!==e.audioContentHash)throw Error('Audio changed: '+e.id);
const clips=[{id:'lan-164',startMs:520000,endMs:750000,question:'Locate the complete Linode sponsorship. Check whether the current short detected fragment misses the rest of the break.'},{id:'lup-610',startMs:1939000,endMs:2080000,question:'Confirm the ConfigCat host-read boundaries and whether the two detected spans belong to one complete break.'},{id:'lup-675',startMs:2689000,endMs:2840000,question:'Check the promotional-code context, classify the advert format, and distinguish product discussion from the complete advert.'},{id:'lup-690',startMs:0,endMs:120000,question:'Check whether opening audio contains an inserted advert absent from the publisher transcript. The entire episode still requires review.'},{id:'lan-299',startMs:0,endMs:120000,question:'News negative-control sample. Do not label the whole episode no-advert until all 13 minutes have been heard.'}];
await mkdir(join(root,'clips'),{recursive:true,mode:0o700});
let previousClips=[];try{previousClips=JSON.parse(await readFile(join(root,'review-clips.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
for(const clip of clips){const e=manifest.episodes.find(e=>e.id===clip.id);const name=clip.id+'-'+clip.startMs+'-'+clip.endMs+'.wav';const path=join(root,'clips',name);
 // Accurate decoded trim, then a lossless PCM review excerpt. Global times retain source offset.
 const prior=previousClips.find(p=>p.id===clip.id&&p.startMs===clip.startMs&&p.endMs===clip.endMs&&p.audioContentHash===e.audioContentHash);let reusable=false;
 if(prior)try{reusable=await digest(path)===prior.clipHash;}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!reusable)execFileSync(ffmpeg,['-v','error','-y','-i',join(root,e.audioPath),'-ss',String(clip.startMs/1000),'-t',String((clip.endMs-clip.startMs)/1000),'-vn','-c:a','pcm_s16le',path],{timeout:120000});
 clip.audioContentHash=e.audioContentHash;clip.clipHash=await digest(path);clip.path='clips/'+name;clip.independent=false;clip.status='HUMAN_REVIEW_REQUIRED';clip.attribution=`${e.title} — ${e.publisher}; ${e.sourcePage}; ${e.licenceUrl}. Cropped PCM excerpt; no editorial changes.`;
}
await writeFile(join(root,'review-clips.json'),JSON.stringify(clips,null,2)+'\n',{mode:0o600});
const exported={...manifest,episodes:manifest.episodes.map(({audioPath,candidates,...e})=>({...e,candidates:candidates.map(({excerpt,...c})=>c)})),audioStorage:'Local private Application Support directory; audio and transcripts are not committed',clips,metrics:corpusMetrics(manifest.episodes,events)};
await writeFile('evals/ad-skip-corpus-manifest.json',JSON.stringify(exported,null,2)+'\n');
await writeFile('evals/ad-skip-corpus-results.json',JSON.stringify(exported.metrics,null,2)+'\n');
console.log({episodes:manifest.episodes.length,bytes:manifest.episodes.reduce((n,e)=>n+e.bytes,0),hours:manifest.episodes.reduce((n,e)=>n+e.durationMs,0)/3600000,candidates:manifest.episodes.reduce((n,e)=>n+e.candidates.length,0),clips:clips.length,metrics:exported.metrics.status});
