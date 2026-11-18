// Bounded, explicitly authorised Phase 2 acceptance. All paid work stays in the
// production ledger. Test credentials are saved only in the ignored directory.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {verifyAwsIdentity} from '../aws-account-guard.mjs';
import {compactEvidence} from './intelligence-engine-evidence.mjs';
verifyAwsIdentity();
const connection=JSON.parse(readFileSync('.starcast/cloud-connection.json','utf8'));
const admin=JSON.parse(readFileSync('.starcast/cloud-admin.json','utf8'));
assert.equal(connection.url,'https://d3ri12f40b85i3.cloudfront.net');
const mode=process.argv[2], privatePath='.starcast/intelligence-engine-tester.json';
const oss='https://opensourcesecuritypodcast.libsyn.com/rss';
const hpr='https://hackerpublicradio.org/hpr_mp3_rss.php?hostid=269&limit=100';
const longId='https://hub.hackerpublicradio.org/ccdn.php?filename=/eps/hpr2578/hpr2578.mp3';
const latest=['d61ca0a3-f8d4-42b2-b79a-15ba7675deba','8162a061-1fdc-4376-9525-9b8bb5006306','898601cb-9cb8-4a35-b9dd-ae52b91193ec'];
const targets=[...[...latest,'70592bd7-8013-4eff-a9c5-dcc570b9b216'].map(episodeId=>({feedUrl:oss,episodeId})),{feedUrl:hpr,episodeId:longId}];
const headers={'content-type':'application/json','x-star-cast-dev-token':connection.token,'x-star-cast-admin-token':admin.token};
let sessionHeaders;
const requestTimings=[];
const request=async(path,{body,method=body?'POST':'GET',auth=headers,expected=200}={})=>{
 const started=performance.now();let response;
 try{response=await fetch(connection.url+path,{method,headers:auth,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(55000)});}
 catch(error){throw Error(JSON.stringify({path:path.split('?')[0],method,error:error.name,elapsedMs:Math.round(performance.now()-started)}));}
 let data;try{data=await response.json();}catch(error){throw Error(JSON.stringify({path:path.split('?')[0],method,status:response.status,error:error.name,phase:'response-body',elapsedMs:Math.round(performance.now()-started)}));}
 requestTimings.push({path:path.split('?')[0],method,status:response.status,elapsedMs:Math.round(performance.now()-started)});
 if(![expected].flat().includes(response.status))throw Error(JSON.stringify({path,status:response.status,error:data.error,code:data.code}));return data;
};
const save=(path,data)=>writeFileSync(path,JSON.stringify(compactEvidence(data),null,2)+'\n',{mode:0o600});
const session=async()=>{
 const login=await fetch(connection.url+'/api/admin/session',{method:'POST',headers,body:JSON.stringify({adminToken:admin.token,emergency:true}),signal:AbortSignal.timeout(30000)});
 assert.equal(login.status,201);
 const cookies=login.headers.getSetCookie().map(v=>v.split(';')[0]);
 sessionHeaders={...headers,cookie:cookies.join('; '),'x-star-cast-csrf':decodeURIComponent(cookies.find(v=>v.startsWith('starcast_admin_csrf=')).split('=').slice(1).join('='))};
 delete sessionHeaders['x-star-cast-admin-token'];
};
const tester=()=>JSON.parse(readFileSync(privatePath,'utf8'));
const listenerHeaders=()=>{const t=tester();return {'content-type':'application/json','x-star-cast-pilot-token':t.token,authorization:'Bearer '+t.credential};};
const before=await request('/api/admin/intelligence');
assert.deepEqual([before.controls.dailyUsd,before.controls.monthlyUsd,before.controls.dailyTranscriptionSeconds,before.controls.maxEpisodeSeconds],[5,25,10800,14400]);
try {
 if(mode==='approve-long') {
  assert.equal(before.reservations.length,0,'Begin the bounded acceptance with no competing provider reservations');
  await session();
  const review=await request('/api/admin/rights/review?'+new URLSearchParams({feedUrl:hpr,episodeId:longId}));
  assert(!review.record.approvalAssessment,'Do not overwrite an existing approval');
  const input={scope:'episode',feedUrl:hpr,episodeId:longId,classification:'LICENSED',basisType:'PUBLISHER_LICENCE',
   evidenceIssuer:'Hacker Public Radio / Honkeymagoo',
   evidenceReference:'https://hackerpublicradio.org/eps/hpr2578/index.html ; https://hackerpublicradio.org/about.html ; https://hackerpublicradio.org/hpr_mp3_rss.php?hostid=269&limit=100#copyright ; https://creativecommons.org/licenses/by-sa/4.0/',
   legalBasis:'Publisher episode page and RSS explicitly license this contribution under CC BY-SA 4.0. Internal transcription and attributed short derived intelligence are within the publisher grant, with source attribution, licence notice and ShareAlike conditions retained. No caption distribution, dubbing or voice replication permission is activated.',
   reason:'User-authorised Phase 2 near-four-hour verification. Public publisher licence checked by engineering automation; no independent human review is claimed. One episode only, standard shared spending and audio caps.',
   authorityConfirmed:true,territories:['WORLDWIDE'],selectedFeatures:['transcription','brief','chapters','topics','moments','search'],applyToFuture:true,maxEpisodes:1,tier:'ZERO',expectedAssessmentRevision:review.revision};
  const preview=await request('/api/admin/rights/approval-preview',{body:input,auth:sessionHeaders});
  assert.equal(preview.summary.expectedNewJobs,1);assert.equal(preview.summary.stillRestricted,0);assert.equal(preview.futureEpisodes,false);
  const result=await request('/api/admin/rights/approve-process',{body:{previewId:preview.previewId,confirmation:'APPROVE & PROCESS'},auth:sessionHeaders,expected:202});
  save('evals/intelligence-engine-long-approval.json',{at:new Date().toISOString(),input,preview,result:{approval:result.approval,status:result.status,jobs:result.jobs},baselineUsage:before.usage,baselineTotals:before.totals});
  console.log(JSON.stringify({jobs:result.jobs.map(({jobId,state,code})=>({jobId,state,code})),futureEpisodes:preview.futureEpisodes}));
 } else if(mode==='follow') {
  assert(!existsSync(privatePath),'Reuse the acceptance installation; do not create duplicate access');
  await session();
  const invite=await request('/api/admin/pilot/invites',{auth:sessionHeaders,body:{label:'Phase 2 automatic intelligence verification',maxUses:1,expiresAt:new Date(Date.now()+86400000).toISOString()},expected:201});
  const enrolled=await request('/api/pilot/enroll',{body:{code:invite.code},auth:{'content-type':'application/json'},expected:201});
  const t={...enrolled,credential:randomBytes(32).toString('base64url'),inviteId:invite.invite.id,deviceId:createHash('sha256').update(enrolled.token).digest('hex')};save(privatePath,t);
  const registered=await request('/api/listener/register',{auth:listenerHeaders(),body:{credential:t.credential}});
  const followed=await request('/api/listener/follow',{auth:listenerHeaders(),body:{feedUrl:oss,following:true,version:1},expected:[200,202]});
  const duplicate=await request('/api/listener/follow',{auth:listenerHeaders(),body:{feedUrl:oss,following:true,version:1},expected:[200,202]});
  assert.equal(duplicate.changed,false);
  save('evals/intelligence-engine-follow.json',{at:new Date().toISOString(),testOnly:true,feedUrl:oss,expectedLatest:latest,followed,duplicate,registrationSucceeded:Boolean(registered)});
  console.log(JSON.stringify({followed,duplicate}));
 } else if(mode==='status') {
  const episodes=[];
  for(const target of targets){const readStarted=performance.now();const detail=await request('/api/admin/episodes/detail?'+new URLSearchParams(target));const e=detail.episode,j=e.job;
   episodes.push({...target,readMs:Math.round(performance.now()-readStarted),title:e.title,state:e.state,code:e.code,executionDecision:e.executionDecision,jobId:j?.jobId,jobState:j?.state,reason:j?.reason,work:j?.work,resumeAfter:j?.resumeAfter,capacityWait:j?.capacityWait,features:j?.featureStatus,featureExecution:j?.featureExecution,source:j?.transcript?.sourceType,hash:j?.transcript?.audioContentHash,segmentCount:j?.transcript?.segments?.length,brief:j?.brief,chapters:j?.chapters,topics:j?.topics,processingMs:j?.processingMs,transcriptChecks:j?.transcriptChecks,timeline:detail.timeline});}
  const after=await request('/api/admin/intelligence'),followed=await request('/api/admin/intelligence/followed');
  save('evals/intelligence-engine-live.json',{at:new Date().toISOString(),episodes,controls:after.controls,totals:after.totals,reservations:after.reservations,usage:after.usage,followed});
  console.log(JSON.stringify({episodes:episodes.map(({title,state,code,jobState,work,resumeAfter,segmentCount})=>({title,state,code,jobState,work,resumeAfter,segmentCount})),totals:after.totals,reservations:after.reservations.length,followed:followed.counts}));
 } else if(mode==='ledger') {
  const file='evals/intelligence-engine-live.json',value=JSON.parse(readFileSync(file,'utf8'));
  Object.assign(value,{ledgerAt:new Date().toISOString(),controls:before.controls,totals:before.totals,reservations:before.reservations,usage:before.usage});save(file,value);
  console.log(JSON.stringify({totals:before.totals,reservations:before.reservations.length}));
 } else if(mode==='named') {
  const episodes=[];
  for(const target of JSON.parse(readFileSync('evals/radiostar-universal-eligibility.json','utf8')).episodes){
   const query=new URLSearchParams({feedUrl:target.feedUrl,episodeId:target.episodeId});
   const detail=await request('/api/admin/episodes/detail?'+query),review=await request('/api/admin/rights/review?'+query),e=detail.episode;
   episodes.push({feedUrl:target.feedUrl,episodeId:target.episodeId,title:e.title,duration:e.duration,state:e.state,code:e.code,decision:e.executionDecision,evidence:review.evidence,history:detail.processingHistory.map(({jobId,state,code})=>({jobId,state,code})),transcript:e.transcript,features:e.job?.featureStatus||null});
  }
  save('evals/intelligence-engine-named.json',{at:new Date().toISOString(),newAssessmentRequested:false,episodes});
  console.log(JSON.stringify(episodes.map(({title,state,code})=>({title,state,code}))));
 } else if(mode==='search') {
  const results=[];
  for(const target of [targets[0],targets[3]]){
   const status=await request('/api/intelligence/status?'+new URLSearchParams(target),{auth:listenerHeaders()});
   const query=target.episodeId===latest[0]?'Apache Software Foundation community security':'Project Lightwell';
   const moment=await request('/api/intelligence/moment',{auth:listenerHeaders(),body:{...target,query}});
   const search=await request('/api/search/conversations',{auth:listenerHeaders(),body:{query,feedUrls:[oss]}});
   results.push({...target,query,status,moment,search});
  }
  const after=await request('/api/admin/intelligence');
  save('evals/intelligence-engine-search.json',{at:new Date().toISOString(),results,requestTimings,totals:after.totals,newUsage:after.usage.filter(u=>!before.usage.some(b=>b.id===u.id))});
  console.log(JSON.stringify(results.map(r=>({episodeId:r.episodeId,state:r.status.status.state,features:r.status.status.availableFeatures,momentKeys:Object.keys(r.moment.moments),searchKeys:Object.keys(r.search)}))));
 } else if(mode==='global-search') {
  const query='open source software security';
  const result=await request('/api/search/conversations',{auth:listenerHeaders(),body:{query}});
  save('evals/intelligence-engine-global-search.json',{at:new Date().toISOString(),query,scope:'ALL_PROCESSED',result,requestTimings});
  console.log(JSON.stringify({matches:result.matches.length,podcasts:[...new Set(result.matches.map(m=>m.episode.feedUrl))],answerState:result.answerState,coverage:result.coverage}));
 } else if(mode==='cleanup') {
  await session();
  await request('/api/listener/follow',{auth:listenerHeaders(),body:{feedUrl:oss,following:false,version:2}});
  await request('/api/admin/pilot/devices/revoke',{auth:sessionHeaders,body:{deviceId:tester().deviceId}});
  save('evals/intelligence-engine-test-cleanup.json',{at:new Date().toISOString(),testFollowRemoved:true,testDeviceRevoked:true,userInvitationsChanged:false});console.log('Temporary test follow removed and only its new installation access revoked.');
 } else throw Error('Choose approve-long, follow, status, ledger, named, search, global-search or cleanup.');
} finally {if(sessionHeaders)await request('/api/admin/session',{method:'DELETE',auth:sessionHeaders});}
