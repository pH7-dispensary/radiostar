import {fetchPublisherTranscript,transcriptRefsFromItem} from '../transcripts.mjs';
import {BudgetLedger,defaultControls,generateEpisodeIntelligence} from '../openai-intelligence.mjs';
import {hybridRetrieve} from '../intelligence.mjs';

if(process.env.STARCAST_REAL_INTELLIGENCE_EVAL!=='1')throw Error('Set STARCAST_REAL_INTELLIGENCE_EVAL=1 to run a paid single-episode evaluation.');
const feedUrl='https://podcastd45a61.podigee.io/feed/mp3',episodeId='75e774b25bbe4ad3513206ced99717cb',startedAt=Date.now(),cache=new Map(),ledger=new BudgetLedger({...defaultControls,enabled:true});
const xml=await (await fetch(feedUrl,{signal:AbortSignal.timeout(20_000)})).text(),item=[...xml.matchAll(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)].map(x=>x[0]).find(value=>((value.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)||[])[1]||'').trim()===episodeId);
if(!item)throw Error('Selected publisher episode is no longer available.');
const transcript=await fetchPublisherTranscript(transcriptRefsFromItem(item).find(ref=>ref.type==='application/json'));
transcript.episodeId=episodeId;transcript.transcriptVersion='publisher-eval-v1';
async function runIntelligence(){if(cache.has(episodeId))return {...cache.get(episodeId),cacheHit:true};let result=await generateEpisodeIntelligence({transcript,ledger,requestId:'real-evaluation-episode-1'});cache.set(episodeId,result);return {...result,cacheHit:false}}
const first=await runIntelligence(),second=await runIntelligence(),moment=hybridRetrieve(transcript,'Spiel',3).find(result=>Number.isFinite(result.startMs));
if(!first.chapters.length)throw Error('No grounded chapters passed validation.');
if(!moment)throw Error('No timestamped retrieval result was returned.');
console.log(JSON.stringify({episodeId,transcript:{source:'publisher_rss',format:transcript.originalFormat,readiness:transcript.quality.readiness,segments:transcript.segments.length},brief:{overview:first.brief.overview,themes:first.brief.themes},chapters:first.chapters.map(({title,startMs,endMs,sourceSegmentIds})=>({title,startMs,endMs,sourceSegmentIds})),moment:{startMs:moment.startMs,endMs:moment.endMs,segmentId:moment.segmentId},cache:{firstRequestCacheHit:first.cacheHit,secondRequestCacheHit:second.cacheHit,providerCalls:ledger.usage.length},usage:ledger.usage,processingMs:Date.now()-startedAt},null,2));
