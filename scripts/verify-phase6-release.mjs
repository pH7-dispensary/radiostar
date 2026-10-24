// Read-only cached release acceptance. Never requests analysis or grants rights.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyAwsIdentity } from './aws-account-guard.mjs';
verifyAwsIdentity();
const c=JSON.parse(readFileSync('.starcast/cloud-connection.json'));
const a=JSON.parse(readFileSync('.starcast/cloud-admin.json'));
const qa=JSON.parse(readFileSync('.starcast/translation-verification.json'));
assert.equal(c.url,'https://d3ri12f40b85i3.cloudfront.net');
const administrative={'x-star-cast-dev-token':c.token,'x-star-cast-admin-token':a.token,'content-type':'application/json'};
const listener={'x-star-cast-pilot-token':qa.deviceToken,authorization:'Bearer '+qa.credential,'content-type':'application/json'};
async function api(path,headers=administrative,input) {
  const r=await fetch(c.url+path,{headers,method:input?'POST':'GET',...(input?{body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(30000)});
  assert.equal(r.status,200,path);return r.json();
}
const before=await api('/api/admin/intelligence'), results=[];
const feedUrl='https://opensourcesecuritypodcast.libsyn.com/rss';
for(const [episodeId,query] of [
  ['e6859d5a-90a9-41f4-a35a-844d80dd1aee','open source'],
  ['e542ae40-bc4d-4be7-8600-03709dbba409','sovereignty'],
  ['6204235e-cc8f-44d1-9ccc-a8ce487b1f57','curl'],
  ['7fc65ac1-12d2-45fa-9bad-ba7cba82dc20','vulnerabilities'],
]) {
  const cached=before.jobs.find(j=>(j.episodeId||j.episode?.id)===episodeId&&(j.feedUrl||j.episode?.feedUrl)===feedUrl);
  assert.equal(cached?.state,'READY','Do not open uncached episodes in a read-only verification');
  const {status:s}=await api('/api/intelligence/status?'+new URLSearchParams({feedUrl,episodeId}),listener);
  assert.equal(s.state,'READY');assert.equal(s.jobId,cached.jobId);assert(!s.transcript);
  assert(s.brief?.overview?.length>12 && s.brief?.detail?.length>12);
  for(const f of ['brief','chapters','topics','moments','search'])assert.equal(s.availableFeatures[f],true);
  assert.equal(s.featureStatus.adCandidates.state,'READY');
  let end=-1;for(const ch of s.chapters){assert(ch.startMs>=end&&ch.endMs>ch.startMs&&ch.sourceSegmentIds.length);end=ch.endMs;}
  assert(s.topics.length&&s.topics.every(t=>t.sourceSegmentIds.length));
  const m=await api('/api/intelligence/moment',listener,{feedUrl,episodeId,query});
  assert(m.moments.length&&m.moments.every(x=>x.segmentId&&x.episode.id===episodeId&&x.startMs>=0&&x.endMs>x.startMs));
  // A broad topic can legitimately rank other episodes above this one. Use
  // actual retrieved source wording to verify this episode's index membership.
  const sourceQuery=m.moments[0].context.split(/\s+/).slice(0,24).join(' ');
  const search=await api('/api/search/conversations',listener,{query:sourceQuery,feedUrls:[feedUrl]});
  assert(search.matches.some(x=>x.episode.id===episodeId),`Indexed source missing for ${episodeId}`);
  const usage=before.usage.filter(x=>x.jobId===s.jobId);
  results.push({episodeId,jobId:s.jobId,brief:true,chapters:s.chapters.length,topics:s.topics.length,moments:m.moments.length,searchIndex:s.searchIndex,recordedCostUsd:usage.reduce((n,x)=>n+x.usd,0),recordedAudioSeconds:usage.filter(x=>x.kind==='transcription').reduce((n,x)=>n+x.seconds,0),work:s.work});
}
const after=await api('/api/admin/intelligence'),o=await api('/api/admin/operations');
assert.equal(after.jobs.length,before.jobs.length);assert.equal(after.usage.length,before.usage.length);assert.deepEqual(after.totals,before.totals);
assert.equal(o.commandCentre.summary.platformHealth,'HEALTHY');
const f=o.followedPreparation;
console.log(JSON.stringify({at:new Date().toISOString(),cachedRealEpisodes:results,paidCalls:0,physicalIphoneVerified:false,
  followed:{snapshot:f.snapshot,uniqueEpisodes:f.uniqueEpisodes,counts:f.counts,acquisition:f.acquisition,estimate:f.estimate},
  summary:o.commandCentre.summary,processing:o.processing.counts,cost:o.commandCentre.cost,
  storedOutputs:{briefs:after.jobs.filter(j=>j.brief?.overview).length,chapters:after.jobs.filter(j=>j.chapters?.length).length,topics:after.jobs.filter(j=>j.topics?.length).length,indexes:after.jobs.filter(j=>j.searchIndex).length},
  adSkip:o.commandCentre.adSkip,release:o.infrastructure.release},null,2));
