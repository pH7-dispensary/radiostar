// Explicit live acceptance: reassess existing demand and reuse cached content.
// Does not grant rights, change policies, request transcription or raise budgets.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { verifyAwsIdentity } from './aws-account-guard.mjs';
if (!process.argv.includes('--live')) throw Error('Use --live for the authorised AWS acceptance run.');
verifyAwsIdentity();
const connection=JSON.parse(readFileSync('.starcast/cloud-connection.json'));
const admin=JSON.parse(readFileSync('.starcast/cloud-admin.json'));
const qa=JSON.parse(readFileSync('.starcast/translation-verification.json'));
assert.equal(connection.url,'https://d3ri12f40b85i3.cloudfront.net');
const administrative={'x-star-cast-dev-token':connection.token,'x-star-cast-admin-token':admin.token,'content-type':'application/json'};
const listener={'x-star-cast-pilot-token':qa.deviceToken,authorization:'Bearer '+qa.credential,'content-type':'application/json'};
const api=async(path,headers=administrative,input)=>{const r=await fetch(connection.url+path,{headers,method:input?'POST':'GET',...(input?{body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(30000)});assert([200,202].includes(r.status),`${path}: HTTP ${r.status}`);return r.json();};
const health=await api('/api/health',{}),before=await api('/api/admin/intelligence');
assert.equal((await fetch(connection.url+'/api/intelligence/ready')).status,403);
await api('/api/admin/intelligence/followed',administrative,{action:'estimate'});
let followed;
for(let attempt=0;attempt<45;attempt++){followed=await api('/api/admin/intelligence/followed');if(!followed.refreshInProgress)break;await new Promise(r=>setTimeout(r,1000));}
assert.equal(followed.refreshInProgress,false,'Followed reassessment must finish');
const rights=(await api('/api/admin/rights')).records;
const ready=await api('/api/intelligence/ready',listener),results=[];
assert(ready.episodes.length,'Listener must have real AI-ready episodes');
assert(ready.episodes.every(e=>!e.feedUrl.includes('/fixtures/')));
for(const episode of ready.episodes){
 const cached=before.jobs.find(j=>(j.episodeId||j.episode?.id)===episode.id&&(j.feedUrl||j.episode?.feedUrl)===episode.feedUrl);
 assert(cached,'Only existing cached episodes may be opened');
 const {status}=await api('/api/intelligence/status?'+new URLSearchParams({feedUrl:episode.feedUrl,episodeId:episode.id}),listener);
 assert(['READY','PARTIAL_READY'].includes(status.state));assert.equal(status.jobId,cached.jobId);
 for(const feature of ['brief','chapters','topics','moments','search'])assert.equal(status.availableFeatures[feature],episode.availableFeatures[feature]);
 assert(!status.transcript);
 let moments=0,searchMatches=0;const queries=[];
 if(episode.availableFeatures.moments){
  let found;
  for(const query of [...(status.brief?.themes || []).slice(0,3),episode.title]){
   found=await api('/api/intelligence/moment',listener,{feedUrl:episode.feedUrl,episodeId:episode.id,query});
   queries.push({query,matches:found.moments.length});if(found.moments.length)break;
  }
  assert(found.moments.length,`No grounded moment for ${episode.title}`);
  assert(found.moments.every(m=>m.segmentId&&m.episode.id===episode.id&&m.startMs>=0&&m.endMs>m.startMs));moments=found.moments.length;
  if(episode.availableFeatures.search){const foundSearch=await api('/api/search/conversations',listener,{query:found.moments[0].context.split(/\s+/).slice(0,24).join(' '),feedUrls:[episode.feedUrl]});assert(foundSearch.matches.some(m=>m.episode.id===episode.id));searchMatches=foundSearch.matches.length;}
 }
 results.push({id:episode.id,feedUrl:episode.feedUrl,title:episode.title,artwork:!!episode.artworkUrl,features:status.availableFeatures,chapters:status.chapters?.length||0,topics:status.topics?.length||0,moments,searchMatches,queries,jobId:status.jobId});
}
const after=await api('/api/admin/intelligence'),operations=await api('/api/admin/operations');
assert.equal(after.jobs.length,before.jobs.length);assert.equal(after.usage.length,before.usage.length);assert.deepEqual(after.totals,before.totals);
const backlog=followed.rows.filter(row=>row.inWindow).map(row=>{const r=rights.find(r=>r.feedUrl===row.feedUrl&&r.episodeId===row.episodeId);return {feedUrl:row.feedUrl,episodeId:row.episodeId,podcast:row.podcast,title:row.title,state:row.state,eligible:row.eligible,decision:row.decision,code:row.code,acquisition:row.acquisition,assessmentVersion:r?.assessmentVersion,basis:r?.legalBasis,evidence:r?.assessmentEvidence};});
const result={at:new Date().toISOString(),health,ready:results,backlog,followedCounts:followed.counts,controls:after.controls,testingMode:after.testingMode,usageBefore:before.usage.length,usageAfter:after.usage.length,paidCalls:0,additionalAiUsd:0,totals:after.totals,infrastructure:operations.infrastructure,summary:operations.commandCentre.summary};
writeFileSync('.starcast/batch1-live.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({ready:results.length,backlog:backlog.length,counts:followed.counts,additionalAiUsd:0,health:health.backend,summary:result.summary},null,2));
