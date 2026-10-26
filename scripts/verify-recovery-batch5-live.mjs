// Bounded acceptance against existing authorised caches. No analysis requests,
// permissions changes, transcription, invitation consumption or TestFlight build.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SEMANTIC_VERSION} from '../semantic-search.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { verifyAwsIdentity } from './aws-account-guard.mjs';
if (!process.argv.includes('--live') || process.env.STARCAST_EVALUATION_AUTHORISED !== '0.05') throw Error('Explicit --live and the approved $0.05 evaluation cap are required.');
verifyAwsIdentity();
const connection=JSON.parse(readFileSync('.starcast/cloud-connection.json'));
const admin=JSON.parse(readFileSync('.starcast/cloud-admin.json'));
const qa=JSON.parse(readFileSync('.starcast/translation-verification.json'));
assert.equal(connection.url,'https://d3ri12f40b85i3.cloudfront.net');
const db=new DatabaseSync(process.env.STARCAST_EVALUATION_SNAPSHOT,{readOnly:true});
const canonical=db.prepare("SELECT payload FROM records WHERE kind='intelligence'").all().map(r=>JSON.parse(r.payload));db.close();
const gateway={'content-type':'application/json','x-star-cast-dev-token':connection.token};
const listener={'content-type':'application/json','x-star-cast-pilot-token':qa.deviceToken,authorization:'Bearer '+qa.credential};
const login=await fetch(connection.url+'/api/admin/session',{method:'POST',headers:gateway,body:JSON.stringify({adminToken:admin.token,emergency:true})});
assert.equal(login.status,201);const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),csrf=cookie.match(/starcast_admin_csrf=([^;]+)/)?.[1];
const api=async(path,headers=listener,body)=>{const start=performance.now();const r=await fetch(connection.url+path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,`${path}: HTTP ${r.status}`);return{body:await r.json(),ms:performance.now()-start};};
const administrative={...gateway,cookie};
const derivedCost=x=>x.usage.filter(r=>r.id.startsWith('derived:')).reduce((n,r)=>n+r.usd,0);
const feedUrl='https://opensourcesecuritypodcast.libsyn.com/rss',episodeId='b866917c-0245-4bcf-a06a-83f55ea44ca6';
const cases=[
 ['exact','safety is not security',['seg-29']],
 ['paraphrase','How does the guest define being safe in terms of avoiding losses?',['seg-35']],
 ['Portuguese','Como é definida a segurança em termos de ausência de perdas?',['seg-35']],
 ['Chinese','安全与信息安全之间有什么区别？',['seg-29','seg-35']],
 ['absent','Who won the lunar chess championship?',[]],
 ['fresh-paraphrase','How does the guest explain safety as freedom from unwanted losses?',['seg-35']],
 ['provider-cache-miss','How does Thomas define safety using the concept of loss events?',['seg-35']],
];
const sourceFor=m=>canonical.find(v=>v.episode?.id===m.episode.id&&v.episode?.feedUrl===m.episode.feedUrl)?.transcript.segments.find(s=>s.id===m.segmentId);
const report={at:new Date().toISOString(),queries:[],cachedEpisodes:[]};
try {
 const before=(await api('/api/admin/intelligence',administrative)).body;
 assert.equal(before.controls.dailyUsd,5);assert.equal(before.controls.monthlyUsd,25);
 assert(derivedCost(before)<.049,'Leave at least $0.001 for seven bounded query embeddings');
 assert.equal((await fetch(connection.url+'/api/search/conversations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:cases[0][1]})})).status,403);
 for(const [kind,query,expected]of cases){
  const {body:r,ms}=await api('/api/search/conversations',listener,{query,feedUrls:[feedUrl]});
  assert.equal(r.retrieval.mode,'semantic-with-lexical-fallback');
  for(const match of r.matches){const s=sourceFor(match);assert(s,'Source must exist in the authorised snapshot');assert.equal(match.startMs,s.startMs);assert.equal(match.endMs,s.endMs);assert(s.text.includes(match.context));}
  for(const claim of r.claims){const m=r.matches[claim.citation-1],s=sourceFor(m);assert(s.text.includes(claim.text));assert.equal(claim.startMs,s.startMs);}
  const matched=expected.length?r.matches.some(m=>m.episode.id===episodeId&&expected.includes(m.segmentId)):r.matches.length===0;
  const requestKey='derived:query:'+SEMANTIC_VERSION+':'+createHash('sha256').update(JSON.stringify([query])).digest('hex');
  report.queries.push({kind,query,ms,matched,previouslyRecorded:before.usage.some(row=>row.id===requestKey),answerState:r.answerState,retrieval:r.retrieval,matches:r.matches.map(m=>({episodeId:m.episode.id,segmentId:m.segmentId,startMs:m.startMs,endMs:m.endMs}))});
 }
 const first=(await api('/api/admin/intelligence',administrative)).body;
 const warm=await api('/api/search/conversations',listener,{query:cases.at(-1)[1],feedUrls:[feedUrl]});
 const second=(await api('/api/admin/intelligence',administrative)).body;
 assert.equal(derivedCost(first),derivedCost(second),'Repeated query must not buy another embedding');report.warmQueryMs=warm.ms;
 for(const id of [episodeId,'d04532a8-4020-449e-acd6-98fa8a1b6159']){
  const {status:s}=(await api('/api/intelligence/status?'+new URLSearchParams({feedUrl,episodeId:id}))).body;
  assert(['READY','PARTIAL_READY'].includes(s.state));assert(!s.transcript&&!s.claimReview);
  assert(s.brief?.overview&&s.chapters?.length&&s.topics?.length);
  report.cachedEpisodes.push({id,state:s.state,briefMode:s.brief.mode,chapters:s.chapters.length,topics:s.topics.length,features:s.availableFeatures});
 }
 const moment=(await api('/api/intelligence/moment',listener,{feedUrl,episodeId,query:'absence of loss events'})).body;
 assert(moment.moments.some(m=>m.segmentId==='seg-35'&&m.startMs===219851));report.momentTimestampMs=219851;
 const after=(await api('/api/admin/intelligence',administrative)).body;
 assert.equal(after.usage.filter(x=>x.kind==='transcription').length,before.usage.filter(x=>x.kind==='transcription').length);
 assert(derivedCost(after)<=.05);assert.equal(after.jobs.length,before.jobs.length);
 report.liveQueryCostUsd=derivedCost(after)-derivedCost(before);report.totalEvaluationUsd=derivedCost(after);report.controls=after.controls;report.reservations=after.reservations.length;
 report.embeddingUsage=after.usage.filter(x=>x.kind==='embedding'&&x.id.includes(SEMANTIC_VERSION)).map(x=>({source:x.episodeKey||'query',usd:x.usd,inputTokens:x.inputTokens}));
 report.health=(await api('/api/health',{})).body;
 report.allExpectedQueriesMatched=report.queries.every(q=>q.matched);
 writeFileSync('.starcast/batch5-live.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
 assert(report.allExpectedQueriesMatched,'Inspect recorded evidence for unmatched queries; do not fabricate a passing result.');
} finally {await fetch(connection.url+'/api/admin/session',{method:'DELETE',headers:{...administrative,'x-star-cast-csrf':csrf}});}
