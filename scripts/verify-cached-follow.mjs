// Controlled follow acceptance on an existing QA installation; no invite is used.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {verifyAwsIdentity} from './aws-account-guard.mjs';
if(!process.argv.includes('--live'))throw Error('Use --live for the authorised controlled follow test.');
verifyAwsIdentity();
const c=JSON.parse(readFileSync('.starcast/cloud-connection.json')),a=JSON.parse(readFileSync('.starcast/cloud-admin.json')),q=JSON.parse(readFileSync('.starcast/translation-verification.json'));
assert.equal(c.url,'https://d3ri12f40b85i3.cloudfront.net');
const admin={'x-star-cast-dev-token':c.token,'x-star-cast-admin-token':a.token,'content-type':'application/json'},listener={'x-star-cast-pilot-token':q.deviceToken,authorization:'Bearer '+q.credential,'content-type':'application/json'};
const api=async(path,headers=admin,input)=>{const r=await fetch(c.url+path,{headers,method:input?'POST':'GET',...(input?{body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(30000)});assert([200,202].includes(r.status),`${path}: ${r.status}`);return r.json();};
const feedUrl='https://opensourcesecuritypodcast.libsyn.com/rss';
const before=await api('/api/admin/intelligence'),initial=await api('/api/admin/intelligence/followed');
// Never remove a pre-existing follow. This test is only safe on an unfollowed feed.
assert(!initial.rows.some(r=>r.feedUrl===feedUrl&&r.inWindow),'Feed already followed; preserve it and inspect manually.');
const {feed}=await api('/api/catalogue/feed?'+new URLSearchParams({url:feedUrl}));
const latest=feed.episodes.filter(e=>e.publishedAt&&Date.parse(e.publishedAt)<=Date.now()).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,3);
const ready=await api('/api/intelligence/ready',listener);
assert.equal(latest.length,3);
assert(latest.every(e=>ready.episodes.some(r=>r.feedUrl===feedUrl&&r.id===e.id)),'Use only already cached latest-three episodes; do not start new paid work for acceptance.');
let added=false,observed,result;
try{
 added=true;result=await api('/api/listener/follow',listener,{feedUrl,following:true});
 assert.equal(result.following,true);
 for(let i=0;i<45;i++){
  observed=await api('/api/admin/intelligence/followed');
  const window=observed.rows.filter(r=>r.feedUrl===feedUrl&&r.inWindow);
  if(!observed.refreshInProgress&&window.length===3&&window.every(r=>r.state==='READY'&&r.eligible&&r.acquisition.transcriptCacheHit))break;
  await new Promise(r=>setTimeout(r,1000));
 }
 const window=observed.rows.filter(r=>r.feedUrl===feedUrl&&r.inWindow);
 assert.equal(window.length,3);assert(window.every(r=>r.state==='READY'&&r.eligible&&r.acquisition.transcriptCacheHit));
 // Repeat the real follow request to exercise dispatch idempotency.
 await api('/api/listener/follow',listener,{feedUrl,following:true});
 const after=await api('/api/admin/intelligence');
 assert.equal(after.jobs.length,before.jobs.length);assert.equal(after.usage.length,before.usage.length);assert.deepEqual(after.totals,before.totals);
 const evidence={at:new Date().toISOString(),followResponse:result.processing,episodes:window.map(r=>({id:r.episodeId,title:r.title,state:r.state,eligible:r.eligible,transcriptCacheHit:r.acquisition.transcriptCacheHit,features:r.availableFeatures})),newJobs:0,paidCalls:0,additionalAiUsd:0};
 writeFileSync('.starcast/batch1-follow.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{
 if(added){await api('/api/listener/follow',listener,{feedUrl,following:false});await api('/api/admin/intelligence/followed',admin,{action:'estimate'});}
}
