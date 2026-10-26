// Evaluation-only annotations. Nothing here grants playback eligibility or changes rights.
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
export const corpusDirectory=()=>process.env.RADIOSTAR_CORPUS_DIR || (process.platform==='darwin'?join(homedir(),'Library','Application Support','RadioStar','AdSkipEvaluation'):resolve('.starcast/adskip-corpus'));
export const annotationKinds=['advert','product_discussion','no_advert','uncertain'];
export const advertFormats=['host_read','dynamic_insert','pre_recorded','self_promotion','unknown'];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function reviewAnnotation(episode,input,{actor,now=new Date().toISOString(),version=0}={}) {
  if(input.expectedVersion!==version)throw Object.assign(Error('Another review changed this episode. Reload before saving.'),{status:409});
  if(input.audioContentHash!==episode.audioContentHash)throw Error('Audio hash mismatch. Labels cannot transfer between variants.');
  if(input.listened!==true||input.independent!==true||typeof actor!=='string'||actor.trim().length<2)throw Error('A named human reviewer must independently listen to the audio.');
  if(!annotationKinds.includes(input.kind))throw Error('Choose a supported label.');
  const {startMs,endMs}=input;
  if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||startMs<0||endMs<=startMs||endMs>episode.durationMs)throw Error('Boundaries must be inside the exact audio duration.');
  if(input.kind==='no_advert'&&!(startMs===0&&endMs===episode.durationMs&&input.fullEpisodeReviewed===true))throw Error('No-advert episode labels require a complete listen.');
  if(input.kind==='advert'&&!advertFormats.includes(input.format))throw Error('Choose the advertising format, or unknown.');
  if(typeof input.notes!=='string'||input.notes.length>2000)throw Error('Review notes must be at most 2000 characters.');
  const candidateIds=Array.isArray(input.candidateIds)?input.candidateIds:[];
  if(candidateIds.some(id=>!episode.candidates.some(c=>c.id===id)))throw Error('Unknown candidate reference.');
  return {id:input.id||hash([episode.audioContentHash,version+1,now]),episodeId:episode.id,audioContentHash:episode.audioContentHash,kind:input.kind,format:input.kind==='advert'?input.format:null,startMs,endMs,notes:input.notes.trim(),candidateIds,independent:true,reviewer:actor.trim().slice(0,120),reviewedAt:now,fullEpisodeReviewed:input.fullEpisodeReviewed===true,version:version+1,evidenceReference:`sha256:${episode.audioContentHash}#t=${startMs/1000},${endMs/1000}`};
}
export function currentReviews(events,episode) {
 const labels=new Map();let version=0,complete=false;
 for(const event of events.filter(e=>e.episodeId===episode.id&&e.audioContentHash===episode.audioContentHash)){
  version=event.version;if(event.action==='annotation'){labels.set(event.annotation.id,event.annotation);complete=false;}
  if(event.action==='remove'){labels.delete(event.annotationId);complete=false;}
  if(event.action==='complete')complete=true;
 }
 return {version,complete,labels:[...labels.values()]};
}
const overlap=(a,b)=>Math.max(0,Math.min(a.endMs,b.endMs)-Math.max(a.startMs,b.startMs));
const unionMs=spans=>{let end=-Infinity,total=0;for(const s of [...spans].sort((a,b)=>a.startMs-b.startMs)){total+=Math.max(0,s.endMs-Math.max(end,s.startMs));end=Math.max(end,s.endMs);}return total;};
export function corpusMetrics(episodes,events,{boundaryToleranceMs=1000}={}) {
 let completeEpisodes=0,labelsCount=0,adverts=0,detected=0,predictions=0,falsePositives=0,completeBreaks=0,negativeEpisodes=0;const startErrors=[],endErrors=[];
 const formats={};let adMs=0,coveredMs=0,predictedMs=0,nonAdvertPredictedMs=0,productDiscussionOverlapMs=0;const perEpisode=[];
 for(const ep of episodes){const review=currentReviews(events,ep);labelsCount+=review.labels.length;if(!review.complete)continue;
  completeEpisodes++;const gold=review.labels.filter(l=>l.kind==='advert');if(!gold.length)negativeEpisodes++;
  // A full-reviewed corpus must explicitly adjudicate uncertain content first.
  const guesses=ep.candidates.filter(c=>c.type==='advert'&&c.verificationState!=='REJECTED');adverts+=gold.length;predictions+=guesses.length;
  const unionPredicted=unionMs(guesses);
  const intersections=guesses.flatMap(p=>gold.filter(g=>overlap(p,g)>0).map(g=>({startMs:Math.max(p.startMs,g.startMs),endMs:Math.min(p.endMs,g.endMs)})));
  predictedMs+=unionPredicted;nonAdvertPredictedMs+=unionPredicted-unionMs(intersections);
  productDiscussionOverlapMs+=unionMs(guesses.flatMap(p=>review.labels.filter(g=>g.kind==='product_discussion'&&overlap(p,g)>0).map(g=>({startMs:Math.max(p.startMs,g.startMs),endMs:Math.min(p.endMs,g.endMs)}))));
  const fp=guesses.filter(p=>!gold.some(g=>overlap(p,g)>0)).length;falsePositives+=fp;
  for(const g of gold){formats[g.format]=(formats[g.format]||0)+1;adMs+=g.endMs-g.startMs;const hits=guesses.filter(p=>overlap(p,g)>0);if(hits.length){detected++;const closest=hits.reduce((a,b)=>Math.abs(a.startMs-g.startMs)+Math.abs(a.endMs-g.endMs)<=Math.abs(b.startMs-g.startMs)+Math.abs(b.endMs-g.endMs)?a:b);startErrors.push(Math.abs(closest.startMs-g.startMs));endErrors.push(Math.abs(closest.endMs-g.endMs));}
   coveredMs+=unionMs(hits.map(p=>({startMs:Math.max(g.startMs,p.startMs),endMs:Math.min(g.endMs,p.endMs)})));
   // Coverage must be continuous, with BOTH boundaries within tolerance, and no overskip.
   if(hits.some(p=>Math.abs(p.startMs-g.startMs)<=boundaryToleranceMs&&Math.abs(p.endMs-g.endMs)<=boundaryToleranceMs))completeBreaks++;
  }
  perEpisode.push({id:ep.id,adverts:gold.length,candidates:guesses.length,falsePositives:fp});
 }
 const p95=v=>v.length?[...v].sort((a,b)=>a-b)[Math.ceil(v.length*.95)-1]:null;
 return {status:completeEpisodes?'MEASURED_REVIEWED_SUBSET':'AWAITING_HUMAN_REVIEW',episodes:episodes.length,completeEpisodes,reviewedLabels:labelsCount,negativeEpisodes,adverts,predictions,falsePositives:completeEpisodes?falsePositives:null,recall:adverts?detected/adverts:null,precision:predictions?(predictions-falsePositives)/predictions:null,completeBreakCoverage:adverts?completeBreaks/adverts:null,advertDurationCoverage:adMs?coveredMs/adMs:null,boundaryStartP95Ms:p95(startErrors),boundaryEndP95Ms:p95(endErrors),nonAdvertPredictedMs:completeEpisodes?nonAdvertPredictedMs:null,productDiscussionOverlapMs:completeEpisodes?productDiscussionOverlapMs:null,falsePositiveDurationRate:predictedMs?nonAdvertPredictedMs/predictedMs:null,boundaryToleranceMs,formats,perEpisode,note:'Recall requires complete human review of entire episodes, including missed adverts. Candidate-only reviews do not establish recall. These are detector metrics, not production-safe skip accuracy.'};
}
export function appendReviewEvent(events,event){const previousHash=events.at(-1)?.hash||null;const value={...event,previousHash};return {...value,hash:hash(value)};}
export function verifyReviewChain(events){let previousHash=null;for(const event of events){const {hash:stored,...value}=event;if(value.previousHash!==previousHash||stored!==hash(value))throw Error('Review audit chain is invalid.');previousHash=stored;}return true;}
