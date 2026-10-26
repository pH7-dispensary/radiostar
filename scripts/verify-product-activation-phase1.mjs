// Explicit, bounded real-audio acceptance using the existing QA installation.
// No invitations, permission grants, budget changes or manual Analyse request.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {verifyAwsIdentity} from './aws-account-guard.mjs';
if(!process.argv.includes('--activate'))throw Error('Use --activate only for the authorised single-episode paid acceptance.');
verifyAwsIdentity();
const feedUrl='https://opensourcesecuritypodcast.libsyn.com/rss',episodeId='5e9a9317-8373-41d0-9465-641a66b2f90d';
const c=JSON.parse(readFileSync('.starcast/cloud-connection.json')),a=JSON.parse(readFileSync('.starcast/cloud-admin.json')),q=JSON.parse(readFileSync('.starcast/translation-verification.json'));
assert.equal(c.url,'https://d3ri12f40b85i3.cloudfront.net');
const gateway={'content-type':'application/json','x-star-cast-dev-token':c.token},listener={'content-type':'application/json','x-star-cast-pilot-token':q.deviceToken,authorization:'Bearer '+q.credential};
const login=await fetch(c.url+'/api/admin/session',{method:'POST',headers:gateway,body:JSON.stringify({adminToken:a.token,emergency:true})});assert.equal(login.status,201);
const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; '),csrf=cookie.match(/starcast_admin_csrf=([^;]+)/)[1],admin={...gateway,cookie,'x-star-cast-csrf':csrf};
async function api(path,headers=admin,body){const r=await fetch(c.url+path,{headers,method:body?'POST':'GET',body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});assert([200,202].includes(r.status),path+': HTTP '+r.status);return r.json();}
const sum=r=>r.usage.reduce((n,v)=>n+v.usd,0),save=()=>writeFileSync('.starcast/activation-live.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
const report={startedAt:new Date().toISOString(),feedUrl,episodeId,timeline:[],manualAnalysisRequests:0,rightsChanges:0,budgetChanges:0};let added=false,version=Date.now();
try{
 const before=await api('/api/admin/intelligence');report.before={costUsd:sum(before),usageEntries:before.usage.length,jobs:before.jobs.length};
 assert(!before.jobs.some(j=>(j.episodeId||j.episode?.id)===episodeId),'A job exists: inspect it rather than repeat paid acceptance');
 assert.equal(before.reservations.length,0);assert.equal(before.controls.dailyUsd,5);assert.equal(before.controls.monthlyUsd,25);assert.equal(before.controls.maxEpisodeSeconds,7200);assert.equal(before.controls.dailyTranscriptionSeconds,10800);
 const {feed}=await api('/api/catalogue/feed?'+new URLSearchParams({url:feedUrl}),listener);
 const latest=feed.episodes.filter(e=>e.publishedAt&&Date.parse(e.publishedAt)<=Date.now()).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,3);
 const ready=await api('/api/intelligence/ready',listener);assert.equal(latest.length,3);assert(latest.every(e=>ready.episodes.some(r=>r.id===e.id&&r.feedUrl===feedUrl)),'Latest-three must be cached; this acceptance pays for only one explicitly selected opened episode');
 const preflight=await api('/api/intelligence/preflight',listener,{feedUrl,episodeId});report.preflight=preflight;
 assert(preflight.withinLimit&&preflight.audioEnabled&&preflight.analysisEnabled);assert.equal(preflight.hasCachedTranscript,false);assert.equal(preflight.hasPublisherTranscript,false);assert(preflight.durationMs<=2000000&&preflight.estimatedAudioCost<0.21);
 assert(before.totals.day+0.5<=before.controls.dailyUsd&&before.totals.month+0.5<=before.controls.monthlyUsd&&before.totals.transcriptionSeconds+preflight.durationMs/1000<=before.controls.dailyTranscriptionSeconds,'The run must also fit standard limits, without relying on temporary pilot increases');
 assert(preflight.assessment.canTranscribeAudio&&preflight.assessment.canProcessForAi&&preflight.assessment.canDisplayDerivedIntelligence);assert(preflight.assessment.assessmentEvidence.some(e=>e.type==='PUBLISHER_LICENSE'&&e.value==='CC-BY'));assert(!preflight.assessment.canDisplayCaptions&&!preflight.assessment.canTranslateText&&!preflight.assessment.canCloneSpeakerVoice);
 const window=await api('/api/admin/intelligence/followed');assert(!window.rows.some(r=>r.feedUrl===feedUrl&&r.inWindow),'Do not alter a pre-existing follow');
 assert(window.budget.remainingDailyUsd>0.5&&window.budget.remainingMonthlyUsd>0.5&&window.budget.remainingAudioSeconds>=preflight.durationMs/1000);
 report.plan={uniqueNewEpisodes:1,cachedFollowedEpisodes:3,newAudioHours:preflight.durationMs/3600000,estimatedAudioUsd:preflight.estimatedAudioCost,textPlanningUsd:0.05,standardLimits:before.controls,existingAllowance:window.budget};save();
 added=true;report.followResponse=await api('/api/listener/follow',listener,{feedUrl,following:true,version});
 const path='/api/intelligence/status?'+new URLSearchParams({feedUrl,episodeId,source:'opened'});
 const deadline=Date.now()+45*60000;let last='',status;
 while(Date.now()<deadline){
  ({status}=await api(path,listener));const state=JSON.stringify([status.state,status.processingStage,status.code,status.work?.completedChunks]);
  if(state!==last){last=state;const event={at:new Date().toISOString(),state:status.state,stage:status.processingStage,code:status.code,work:status.work};report.timeline.push(event);save();console.log(JSON.stringify(event));}
  if(['READY','PARTIAL_READY'].includes(status.state)&&status.processing===false&&status.completedAt)break;
  if(['FAILED','UNAVAILABLE','BLOCKED'].includes(status.state)&&!status.processing)throw Error('Automatic processing stopped: '+status.code);
  await new Promise(resolve=>setTimeout(resolve,10000));
 }
 assert(status?.completedAt,'Processing deadline reached; inspect the durable job, do not restart blindly');
 assert(status.brief?.overview&&status.chapters?.length&&status.topics?.length);assert(!status.transcript);
 report.result={state:status.state,completedAt:status.completedAt,brief:status.brief,chapters:status.chapters,topics:status.topics,features:status.availableFeatures,featureStatus:status.featureStatus,transcriptChecks:status.transcriptChecks};
 let after,lastCost=null,quiet=0;
 // Completion is published before the independent semantic-index callback.
 // Observe its reservations settling before testing a warm cache read.
 for(let i=0;i<30;i++){after=await api('/api/admin/intelligence');const cost=sum(after);quiet=after.reservations.length===0&&cost===lastCost?quiet+1:0;lastCost=cost;if(quiet>=3)break;await new Promise(resolve=>setTimeout(resolve,10000));}
 assert(quiet>=3,'Post-processing usage is still active; do not misreport cache reuse');
 report.costUsd=sum(after)-sum(before);report.newUsage=after.usage.filter(u=>!before.usage.some(b=>b.id===u.id));report.newJobs=after.jobs.length-before.jobs.length;assert.equal(report.newJobs,1);assert(report.newUsage.some(u=>u.kind==='transcription'),'This must prove fresh audio transcription');
 const followed=await api('/api/admin/intelligence/followed');const cached=followed.rows.filter(r=>r.feedUrl===feedUrl&&r.inWindow);assert.equal(cached.length,3);assert(cached.every(r=>r.acquisition.intelligenceCacheHit));report.followed=cached.map(r=>({id:r.episodeId,state:r.state,cacheHit:r.acquisition.intelligenceCacheHit}));
 const again=await api(path,listener);assert.equal(again.status.completedAt,status.completedAt);
 const warm=await api('/api/admin/intelligence');assert.equal(sum(warm),sum(after));assert.equal(warm.jobs.length,after.jobs.length);report.cacheReuseWithoutPaidCall=true;save();
 console.log(JSON.stringify({completed:true,state:status.state,costUsd:report.costUsd,newJobs:report.newJobs}));
}finally{
 if(added){await api('/api/listener/follow',listener,{feedUrl,following:false,version:version+1});await api('/api/admin/intelligence/followed',admin,{action:'estimate'});report.testFollowRemoved=true;save();}
 await fetch(c.url+'/api/admin/session',{method:'DELETE',headers:admin});
}
