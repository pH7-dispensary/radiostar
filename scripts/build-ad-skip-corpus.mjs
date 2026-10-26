// Offline evaluation preparation only. No paid provider calls or production writes.
import {mkdir,readFile,writeFile,rename,stat,readdir} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import ffprobe from 'ffprobe-static';
import {parseTranscript} from '../transcripts.mjs';
import {SkipService} from '../skip-service.mjs';
import {corpusDirectory} from '../ad-skip-corpus.mjs';
const root=resolve(process.argv[2]||corpusDirectory());
await mkdir(root,{recursive:true,mode:0o700});
const sources=JSON.parse(await readFile('evals/ad-skip-corpus-sources.json','utf8'));
if(sources.length<10||sources.length>20)throw Error('Corpus must contain 10–20 selected episodes.');
const digest=async path=>{const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');};
async function download(url,path,maxBytes){
  try{await stat(path);return {cached:true};}catch{}
  const response=await fetch(url,{signal:AbortSignal.timeout(240000)});if(!response.ok)throw Error(`HTTP ${response.status}: ${url}`);
  let size=0;const limiter=new Transform({transform(chunk,_,done){size+=chunk.length;done(size>maxBytes?Error('Download limit exceeded'):null,chunk);}});
  await pipeline(Readable.fromWeb(response.body),limiter,createWriteStream(path+'.part',{mode:0o600}));await rename(path+'.part',path);
  return {retrievedAt:new Date().toISOString(),finalUrl:response.url,etag:response.headers.get('etag'),bytes:size};
}
const licencePath=join(root,'publisher-licence.html');
await download(sources[0].permissionEvidence,licencePath,2000000);
const licenceText=await readFile(licencePath,'utf8');
if(!/Our shows are licensed under/i.test(licenceText)||!/Creative Commons BY-SA 4\.0/.test(licenceText))throw Error('Publisher licence evidence changed; inspect before acquiring audio.');
const evidenceHash=await digest(licencePath);let episodes=[];
try{episodes=JSON.parse(await readFile(join(root,'manifest.json'),'utf8')).episodes;}catch{}
const cachedNames=new Set(await readdir(root));
for(const source of sources){
 try{
  const audioPath=source.id+'.mp3',path=join(root,audioPath);
  const acquisition=await download(source.audioUrl,path,100*1024*1024);
  const audioContentHash=await digest(path);
  const durationMs=Math.round(Number(execFileSync(ffprobe.path,['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',path],{encoding:'utf8'}).trim())*1000);
  if(!Number.isFinite(durationMs)||durationMs<=0)throw Error('Invalid duration');
  const prior=episodes.find(e=>e.id===source.id);if(prior&&prior.audioContentHash!==audioContentHash)throw Error('Pinned variant changed; preserve annotations and create a new corpus version.');
  let segments=[],transcriptHash=null,cachedTranscript=null;
  try { if(cachedNames.has(source.id+"-cache.json")) { const cached=JSON.parse(await readFile(join(root,source.id+"-cache.json"),"utf8")); if(cached.transcript.audioContentHash!==audioContentHash)throw Error("Cached transcript is tied to another audio variant");cachedTranscript=cached.transcript;segments=cachedTranscript.segments;transcriptHash=createHash("sha256").update(JSON.stringify(segments)).digest("hex"); } } catch(error) { if(error.code!=="ENOENT")throw error; }
  if(source.transcriptUrl && !cachedTranscript){await download(source.transcriptUrl,join(root,source.id+'.vtt'),10*1024*1024);const text=await readFile(join(root,source.id+'.vtt'),'utf8');segments=parseTranscript(text,'text/vtt');transcriptHash=createHash('sha256').update(text).digest('hex');}
  const records=new Map();const store={get:(kind,key)=>records.get(kind)?.get(key),set:(kind,key,value)=>{if(!records.has(kind))records.set(kind,new Map());records.get(kind).set(key,value);},all:kind=>[...(records.get(kind)||new Map())]};
  const transcript={segments,durationMs,transcriptVersion:transcriptHash,contentHash:transcriptHash,audioVariant:source.audioUrl,provenance:{sourceType:'publisher',sourceUri:source.transcriptUrl}};
  // The publisher transcript is NOT asserted to match an inserted-ad audio variant.
  // Run the existing detector, with no verifier/network callback and no production store.
  const detector=new SkipService(store,{status:()=>({state:'READY',episode:{audioUrl:source.audioUrl},transcript})});
  const started=performance.now();const detected=detector.inspect(source.feedUrl,source.episodeId);
  const analysisMs=performance.now()-started;
  const candidates=detected.intervals.filter(r=>r.type==='advert').map(r=>({...r,independent:false,reviewStatus:'UNREVIEWED',audioContentHash,transcriptAlignment:cachedTranscript?'HASH_BOUND_CACHE':'UNVERIFIED'}));
  // Review context, not a detector prediction or a ground-truth label.
  const windows=[];for(const c of [...candidates].sort((a,b)=>a.startMs-b.startMs)){const last=windows.at(-1),startMs=Math.max(0,c.startMs-20000),endMs=Math.min(durationMs,c.endMs+30000);if(startMs>=durationMs)continue;if(last&&startMs<=last.endMs+10000){last.endMs=Math.max(last.endMs,endMs);last.candidateIds.push(c.id);}else windows.push({id:`${source.id}-review-${windows.length+1}`,startMs,endMs,candidateIds:[c.id],reason:'Unreviewed transcript candidate; verify alignment and full break boundaries.'});}
  if(!windows.length)windows.push({id:source.id+'-opening',startMs:0,endMs:Math.min(120000,durationMs),candidateIds:[],reason:'Opening sample only; absence of candidates is not proof of no adverts.'});
  const row={...source,audioPath,audioContentHash,durationMs,bytes:(await stat(path)).size,acquisition:prior?.acquisition||acquisition,permissionEvidenceHash:evidenceHash,transcriptHash,transcriptAlignment:cachedTranscript?'HASH_BOUND_CACHE':'UNVERIFIED',transcriptSegments:segments.length,candidates,reviewWindows:windows,analysisMs,detectorVersion:store.all('skip-analysis')[0]?.[1].processingVersion || null,reviewStatus:'PENDING',fullEpisodeReviewed:false};
  episodes=episodes.filter(e=>e.id!==row.id).concat(row);
  await writeFile(join(root,'manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),purpose:'Private evaluation; not production skip authorisation',publisherAttribution:'Jupiter Broadcasting — original episode titles and source links retained. Audio unmodified; review excerpts are cropped. CC BY-SA 4.0.',episodes},null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({id:row.id,bytes:row.bytes,durationMs,candidates:candidates.length,windows:windows.length,sha256:audioContentHash}));
 }catch(error){console.error(source.id+': '+error.message);process.exitCode=1;}
}
