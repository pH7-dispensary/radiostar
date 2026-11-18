// One bounded, existing owned corpus request through the production API/SQS.
// Never grants rights or changes policies, pilots, allowances or credentials.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {verifyAwsIdentity} from '../aws-account-guard.mjs';
verifyAwsIdentity();
const connection=JSON.parse(readFileSync('.starcast/cloud-connection.json','utf8'));
const admin=JSON.parse(readFileSync('.starcast/cloud-admin.json','utf8'));
assert.equal(connection.url,'https://d3ri12f40b85i3.cloudfront.net');
const feedUrl=connection.url+'/fixtures/approved-test-feed.xml',episodeId='starcast-approved-test-episode-v1';
const query=new URLSearchParams({feedUrl,episodeId});
const headers={'content-type':'application/json','x-star-cast-dev-token':connection.token,'x-star-cast-admin-token':admin.token};
const request=async(path,{body,method=body?'POST':'GET',session=false,expected=200}={})=>{
  const response=await fetch(connection.url+path,{method,headers:session?sessionHeaders:headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,expected,path);return response.json();
};
const before=await request('/api/admin/intelligence');
assert.equal(before.reservations.length,0);
assert.deepEqual([before.controls.dailyUsd,before.controls.monthlyUsd,before.controls.dailyTranscriptionSeconds,before.controls.maxEpisodeSeconds],[5,25,10800,14400]);
const owned=await request('/api/admin/rights/review?'+query);
assert.equal(owned.record.classification,'LICENSED');
assert(owned.features['intelligence-processing'].allowed);
assert(owned.evidence.some(item=>/owned|original|fixture/i.test(item.value+' '+item.type)),'Existing owned authorisation is required');
assert.equal((await fetch(connection.url+'/api/admin/intelligence')).status,403);
const login=await fetch(connection.url+'/api/admin/session',{method:'POST',headers,body:JSON.stringify({adminToken:admin.token,emergency:true}),signal:AbortSignal.timeout(30000)});
assert.equal(login.status,201);
const cookies=login.headers.getSetCookie().map(value=>value.split(';')[0]);
const csrf=cookies.find(value=>value.startsWith('starcast_admin_csrf=')).split('=').slice(1).join('=');
const sessionHeaders={...headers,cookie:cookies.join('; '),'x-star-cast-csrf':decodeURIComponent(csrf)};
delete sessionHeaders['x-star-cast-admin-token'];
try{
  const session=await request('/api/admin/session',{session:true});assert.equal(session.actor.role,'SUPER_ADMIN');assert.equal(session.actor.source,'session');
  const result=await request('/api/admin/podcasts/prepare',{session:true,body:{feedUrl,confirmation:'CONFIRM',reason:'Phase 1 policy-surgery acceptance: dispatch only the existing owned corpus; reuse authorised transcript and provider caches.'}});
  assert.equal(result.outcomes.length,1);
  const outcome=result.outcomes[0];assert.equal(outcome.episodeId,episodeId);
  const end=Date.now()+180000;
  let detail;
  do{
    detail=await request('/api/admin/episodes/detail?'+query);
    if(['READY','PARTIAL_READY','FAILED','UNAVAILABLE'].includes(detail.episode.state))break;
    await new Promise(resolve=>setTimeout(resolve,2500));
  }while(Date.now()<end);
  assert(['READY','PARTIAL_READY'].includes(detail.episode.state),JSON.stringify({state:detail.episode.state,code:detail.episode.code}));
  const after=await request('/api/admin/intelligence');
  assert.deepEqual(after.controls,before.controls);
  const report={at:new Date().toISOString(),scope:'existing owned corpus only; not evidence of Danny Jones or Joe Rogan processing',adminSessionVerified:true,anonymousAdminRejected:true,
    request:outcome,finalState:detail.episode.state,executionDecision:detail.episode.executionDecision,
    timeline:detail.timeline.map(({at,type,jobId,code})=>({at,type,jobId,code})),
    newJobs:after.jobs.filter(job=>!before.jobs.some(prior=>prior.jobId===job.jobId)).map(({jobId,state})=>({jobId,state})),
    features:detail.episode.job?.featureStatus || null,
    cachedOutput:{brief:Boolean(detail.episode.job?.brief?.overview),chapters:detail.episode.job?.chapters?.length || 0,topics:detail.episode.job?.topics?.length || 0},
    newUsage:after.usage.slice(before.usage.length),totals:after.totals,controls:after.controls};
  if(process.argv.includes('--cache-only')){assert.equal(report.newJobs.length,0);assert.equal(report.newUsage.length,0);}
  writeFileSync(process.argv.includes('--cache-only')?'evals/policy-surgery-cache.json':'evals/policy-surgery-handoff.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({state:report.finalState,request:outcome,newJobs:report.newJobs,newUsageEntries:report.newUsage.length}));
}finally{await request('/api/admin/session',{method:'DELETE',session:true});}
