// Local evaluation workbench, not an alternative production admin or a rights bypass.
import {createServer} from 'node:http';
import {readFile,writeFile,rename,stat,realpath,readdir} from 'node:fs/promises';
import {createReadStream,writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import ffmpeg from 'ffmpeg-static';
import {parseTranscript} from '../transcripts.mjs';
import {corpusDirectory,reviewAnnotation,currentReviews,corpusMetrics,appendReviewEvent,verifyReviewChain} from '../ad-skip-corpus.mjs';
const assets=join(dirname(fileURLToPath(import.meta.url)),'corpus-review');
export async function createCorpusReviewServer({root=corpusDirectory(),port=0,readOnly=false}={}){
 root=await realpath(root);const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
 if(!Array.isArray(manifest.episodes)||manifest.episodes.length>20)throw Error('Invalid bounded corpus.');
 const pinned=new Map();
 for(const ep of manifest.episodes){if(!/^[a-z0-9-]+$/.test(ep.id))throw Error('Invalid episode ID');const path=await realpath(join(root,ep.audioPath));if(!path.startsWith(root+'/'))throw Error('Audio outside corpus');const h=createHash('sha256');for await(const bytes of createReadStream(path))h.update(bytes);if(h.digest('hex')!==ep.audioContentHash)throw Error('Pinned audio changed: '+ep.id);const info=await stat(path);pinned.set(ep.id,{path,mtimeMs:info.mtimeMs,size:info.size});}
 const auditPath=join(root,'reviews.json');let events=[];if((await readdir(root)).includes('reviews.json'))events=JSON.parse(await readFile(auditPath,'utf8'));verifyReviewChain(events);
 let priorityClips=[];try{priorityClips=JSON.parse(await readFile(join(root,'review-clips.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const contextCache=new Map();let contextBusy=false;
 async function context(id,startMs,endMs){
  const ep=manifest.episodes.find(e=>e.id===id),item=pinned.get(id);
  if(!ep||!Number.isFinite(startMs)||!Number.isFinite(endMs)||startMs<0||endMs<=startMs||endMs>ep.durationMs||endMs-startMs>300000)throw Error('Choose a review window of at most five minutes within the pinned audio.');
  const info=await stat(item.path);if(info.mtimeMs!==item.mtimeMs||info.size!==item.size)throw Error('Pinned audio changed');
  const key=JSON.stringify([id,startMs,endMs]);if(contextCache.has(key))return contextCache.get(key);
  if(contextBusy)throw Object.assign(Error('Audio context is preparing; retry shortly.'),{status:429});contextBusy=true;
  try{
   let segments=[];const names=await readdir(root);
   if(names.includes(id+'-cache.json')){const cached=JSON.parse(await readFile(join(root,id+'-cache.json'),'utf8'));if(cached.transcript.audioContentHash!==ep.audioContentHash)throw Error('Transcript belongs to another variant');segments=cached.transcript.segments;if(createHash('sha256').update(JSON.stringify(segments)).digest('hex')!==ep.transcriptHash)throw Error('Cached transcript changed');}
   else if(names.includes(id+'.vtt')){const vtt=await readFile(join(root,id+'.vtt'),'utf8');if(createHash('sha256').update(vtt).digest('hex')!==ep.transcriptHash)throw Error('Publisher transcript changed');segments=parseTranscript(vtt,'text/vtt');}
   const nearby=segments.filter(s=>s.startMs<endMs&&s.endMs>startMs);
   const {stdout}=await promisify(execFile)(ffmpeg,['-v','error','-ss',String(startMs/1000),'-protocol_whitelist','file,pipe','-i',item.path,'-t',String((endMs-startMs)/1000),'-vn','-ac','1','-ar','8000','-f','s16le','pipe:1'],{encoding:'buffer',maxBuffer:6*1024*1024,timeout:30000});
   const samples=Math.floor(stdout.length/2),peaks=Array(400).fill(0);for(let i=0;i<samples;i++){const bin=Math.min(399,Math.floor(i*400/samples));peaks[bin]=Math.max(peaks[bin],Math.abs(stdout.readInt16LE(i*2))/32768);}
   const value={audioContentHash:ep.audioContentHash,startMs,endMs,peaks,transcriptAlignment:ep.transcriptAlignment,transcript:nearby.slice(0,100).map(s=>({id:s.id,startMs:s.startMs,endMs:s.endMs,text:s.text.slice(0,400)})),truncated:nearby.length>100};
   if(contextCache.size>=20)contextCache.delete(contextCache.keys().next().value);contextCache.set(key,value);return value;
  }finally{contextBusy=false;}
 }
 const boot=randomBytes(32).toString('hex'),cookie=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');let bootUsed=false,origin,tail=Promise.resolve();const expires=Date.now()+8*3600000;
 const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
 async function save(input){
  const episode=manifest.episodes.find(e=>e.id===input.episodeId);if(!episode)throw Error('Unknown episode');
  const info=await stat(pinned.get(episode.id).path);if(info.mtimeMs!==pinned.get(episode.id).mtimeMs||info.size!==pinned.get(episode.id).size)throw Error('Audio changed during review; restart and reverify');
  const review=currentReviews(events,episode);if(input.expectedVersion!==review.version)throw Object.assign(Error('Review changed; reload before saving'),{status:409});
  if(input.audioContentHash!==episode.audioContentHash)throw Error('Hash mismatch');
  if(typeof input.reviewer!=='string'||input.reviewer.trim().length<2||input.reviewer.length>120)throw Error('Named human reviewer required');
  const event={episodeId:episode.id,audioContentHash:episode.audioContentHash,version:review.version+1,actor:input.reviewer.trim(),at:new Date().toISOString(),action:input.action};
  if(input.action==='annotation'){if(input.id&&!review.labels.some(l=>l.id===input.id))throw Error('Unknown annotation');event.annotation=reviewAnnotation(episode,input,{actor:event.actor,now:event.at,version:review.version});}
  else if(input.action==='remove'){if(!review.labels.some(l=>l.id===input.annotationId))throw Error('Unknown annotation');event.annotationId=input.annotationId;}
  else if(input.action==='complete'){
   if(input.fullEpisodeReviewed!==true||!review.labels.length||review.labels.some(l=>l.kind==='uncertain'))throw Error('Complete the entire audio review and resolve uncertain ranges first');
   const ads=review.labels.filter(l=>l.kind==='advert'),negative=review.labels.filter(l=>l.kind==='no_advert');
   if((!ads.length&&!negative.length)||(ads.length&&negative.length))throw Error('Record complete adverts or a full no-advert assessment, without contradictions');
   const sorted=review.labels.filter(l=>l.kind!=='no_advert').sort((a,b)=>a.startMs-b.startMs);if(sorted.some((l,i)=>i>0&&l.startMs<sorted[i-1].endMs))throw Error('Resolve overlapping labels before completion');
   event.fullEpisodeReviewed=true;
  }else throw Error('Unsupported action');
  const next=[...events,appendReviewEvent(events,event)];await writeFile(auditPath+'.tmp',JSON.stringify(next,null,2)+'\n',{mode:0o600});await rename(auditPath+'.tmp',auditPath);events=next;return {ok:true,version:event.version};
 }
 const server=createServer(async(req,res)=>{try{
  res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if(req.headers.host!==new URL(origin).host)return json(res,403,{error:'Unexpected host'});
  if(Date.now()>expires)return json(res,401,{error:'Review session expired. Restart the local workbench.'});
  const url=new URL(req.url,origin);
  if(req.method==='GET'&&url.pathname==='/session'&&!bootUsed&&url.searchParams.get('code')===boot){bootUsed=true;res.writeHead(303,{'set-cookie':`corpus_session=${cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`,location:'/'});return res.end();}
  if(!(req.headers.cookie||'').split(';').some(v=>v.trim()===`corpus_session=${cookie}`))return json(res,401,{error:'Open the one-time access link printed by the review command.'});
  if(req.method==='POST'){
   if(url.pathname!=='/review'||req.headers.origin!==origin||req.headers['x-corpus-csrf']!==csrf)return json(res,403,{error:'Invalid review origin or CSRF token'});
   if(readOnly)return json(res,403,{error:'This verification session is read-only. Use the writable review workbench.'});
   let body='';for await(const b of req){body+=b;if(Buffer.byteLength(body)>16000)return json(res,413,{error:'Review too large'});}
   const input=JSON.parse(body);const work=tail.then(()=>save(input));tail=work.catch(()=>{});return json(res,200,await work);
  }
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  if(url.pathname==='/manifest')return json(res,200,{...manifest,priorityClips,episodes:manifest.episodes.map(ep=>({...ep,review:currentReviews(events,ep)})),metrics:corpusMetrics(manifest.episodes,events),csrf});
  if(url.pathname.startsWith('/context/'))return json(res,200,await context(decodeURIComponent(url.pathname.slice(9)),Number(url.searchParams.get('startMs')),Number(url.searchParams.get('endMs'))));
  if(url.pathname==='/metrics')return json(res,200,corpusMetrics(manifest.episodes,events));
  if(url.pathname.startsWith('/audio/')){
   const item=pinned.get(decodeURIComponent(url.pathname.slice(7)));if(!item)return json(res,404,{error:'Unknown audio'});const info=await stat(item.path);if(info.size!==item.size||info.mtimeMs!==item.mtimeMs)return json(res,409,{error:'Pinned audio changed'});
   let start=0,end=item.size-1;const range=req.headers.range;
   if(range){const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match)return json(res,416,{error:'Unsupported range'});start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;if(start>end)return json(res,416,{error:'Invalid range'});}
   res.writeHead(range?206:200,{'content-type':'audio/mpeg','accept-ranges':'bytes','content-length':end-start+1,...(range?{'content-range':`bytes ${start}-${end}/${item.size}`}:{})});const stream=createReadStream(item.path,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());return stream.pipe(res);
  }
  const staticFile={'/':['index.html','text/html'],'/review.js':['review.js','text/javascript'],'/review.css':['review.css','text/css']}[url.pathname];if(!staticFile)return json(res,404,{error:'Not found'});res.setHeader('content-type',staticFile[1]);res.end(await readFile(join(assets,staticFile[0])));
 }catch(e){if(!res.headersSent)json(res,e.status||400,{error:e.message});else res.destroy();}});
 // Only one process may own the append-only review ledger. Browser verification
 // can share pinned audio read-only, but never race a human review writer.
 const lockPath=join(root,'review-writer.lock'),lock={pid:process.pid,nonce:randomBytes(16).toString('hex')};let ownsLock=false;
 const release=()=>{if(ownsLock){try{if(JSON.parse(readFileSync(lockPath,'utf8')).nonce===lock.nonce)unlinkSync(lockPath);}catch(e){if(e.code!=='ENOENT')throw e;}ownsLock=false;}};
 if(!readOnly){
  try{writeFileSync(lockPath,JSON.stringify(lock),{flag:'wx',mode:0o600});ownsLock=true;}
  catch(error){
   if(error.code!=='EEXIST')throw error;
   const previous=JSON.parse(readFileSync(lockPath,'utf8'));let alive=true;
   if(!Number.isInteger(previous.pid)||previous.pid<1)throw Error('Invalid review writer lock; inspect it before restarting.');
   try{process.kill(previous.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;else throw e;}
   if(alive)throw Error('A writable corpus-review session is already running. Reuse it; verification may use readOnly mode.');
   throw Error('The previous review writer exited without releasing review-writer.lock. Inspect its recorded PID and remove only that stale lock before restarting; reviews.json must be preserved.');
  }
 }
 server.once('close',release);
 try{
  // A previous writer may have saved while this process checked the large audio
  // files. Read the authoritative chain again after exclusive ownership.
  if(ownsLock){try{events=JSON.parse(await readFile(auditPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;events=[];}verifyReviewChain(events);}
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 }catch(error){release();throw error;}
 origin=`http://127.0.0.1:${server.address().port}`;
 return {server,origin,accessUrl:origin+'/session?code='+boot};
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){const app=await createCorpusReviewServer({root:resolve(process.argv[2]||corpusDirectory()),port:Number(process.env.CORPUS_REVIEW_PORT||4318)});console.log('Local review only; eight-hour session. Open once: '+app.accessUrl);}
