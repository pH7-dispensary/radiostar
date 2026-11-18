import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {verifyAwsIdentity} from '../aws-account-guard.mjs';
verifyAwsIdentity();
const c=JSON.parse(readFileSync('.starcast/cloud-connection.json')),a=JSON.parse(readFileSync('.starcast/cloud-admin.json'));
assert.equal(c.url,'https://d3ri12f40b85i3.cloudfront.net');
const gateway={'content-type':'application/json','x-star-cast-dev-token':c.token};
const login=await fetch(c.url+'/api/admin/session',{method:'POST',headers:gateway,body:JSON.stringify({adminToken:a.token,emergency:true})});assert.equal(login.status,201);
const cookies=login.headers.getSetCookie().map(v=>v.split(';')[0]);
const admin={...gateway,cookie:cookies.join('; '),'x-star-cast-csrf':decodeURIComponent(cookies.find(v=>v.startsWith('starcast_admin_csrf=')).split('=').slice(1).join('='))};
async function api(path,body,headers=admin){const r=await fetch(c.url+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});const v=await r.json();assert(r.ok,path+': '+r.status+' '+(v.error||''));return v;}
const compactDecision=d=>d?{version:d.version,operationalPolicy:d.operationalPolicy,processingBasis:{...d.processingBasis,features:undefined},executionState:d.executionState,canDispatch:d.canDispatch,firstBlocker:d.firstBlocker,nextAction:d.nextAction}:null;
const save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n',{mode:0o600});
const privateFile='.starcast/universal-ad-skip-tester.json';
try{
 const mode=process.argv[2],pilot=await api('/api/admin/ad-skip/pilot'),before=await api('/api/admin/intelligence/testing');
 if(mode==='renew'){
  assert.equal(process.argv[3],'21','Supply the explicitly authorised 21-day duration');
  assert.equal(pilot.configuration.listenerIds.length,2);assert.equal(pilot.configuration.active,false,'Do not repeat an already completed renewal');
  const expiry=new Date(Date.now()+21*86400000-1000).toISOString(),devices=(await api('/api/admin/pilot/invites')).devices,renewed=[];
  for(const listenerId of pilot.configuration.listenerIds){const device=devices.filter(d=>d.listenerId===listenerId&&!d.revokedAt).sort((x,y)=>Date.parse(y.expiresAt)-Date.parse(x.expiresAt))[0];assert(device,'Existing tester device required');
   const result=await api('/api/admin/pilot/devices/renew',{deviceId:device.id,expectedExpiresAt:device.expiresAt,expiresAt:expiry,confirmation:'RENEW PILOT ACCESS',reason:'Owner explicitly authorised renewal of the same two Ad Skip testers for three weeks on 18 November 2026. Preferences and spending unchanged.'});assert(result.preferencesUnchanged&&result.spendingLimitsUnchanged);renewed.push(result.device);}
  await api('/api/admin/ad-skip/pilot',{enabled:true,listenerIds:pilot.configuration.listenerIds,expectedVersion:pilot.configuration.version,expiresAt:expiry,enableListenerPreferences:false,confirmation:'ENABLE AD SKIP PILOT',reason:'Owner explicitly authorised three weeks; same two enrolled testers. No new paid-testing allowance.'});
  const after=await api('/api/admin/ad-skip/pilot'),paid=await api('/api/admin/intelligence/testing');
  assert.deepEqual(paid.configuration,before.configuration);assert.deepEqual(paid.standardLimits,before.standardLimits);
  for(const prior of pilot.listeners.filter(v=>v.selected)){const next=after.listeners.find(v=>v.id===prior.id);assert.equal(next.preferenceEnabled,prior.preferenceEnabled);assert.equal(next.advertEnabled,prior.advertEnabled);}
  save('evals/universal-ad-skip-phase3-renewal.json',{at:new Date().toISOString(),renewedTesterCount:renewed.length,expiresAt:expiry,active:after.configuration.active,previousVersion:pilot.configuration.version,version:after.configuration.version,preferencesUnchanged:true,spendingLimitsUnchanged:true,standardLimits:paid.standardLimits,publicAutomaticSkipping:after.publicAutomaticSkipping});
  console.log({renewed:renewed.length,expiresAt:expiry,active:after.configuration.active,paidAllowanceUnchanged:true});
 }else if(mode==='qa-start'){
  assert(pilot.configuration.active);assert(!existsSync(privateFile),'Reuse or revoke the existing QA access');
  const invite=await api('/api/admin/pilot/invites',{label:'Phase 3 Ad Skip verification only — revoke after checks',maxUses:1,expiresAt:new Date(Date.now()+3600000).toISOString()});
  const enrolled=await api('/api/pilot/enroll',{code:invite.code},{'content-type':'application/json'});
  const t={deviceToken:enrolled.token,credential:randomBytes(32).toString('base64url'),deviceId:createHash('sha256').update(enrolled.token).digest('hex'),originalPilot:pilot.configuration};save(privateFile,t);
  const auth={'content-type':'application/json','x-star-cast-pilot-token':t.deviceToken,authorization:'Bearer '+t.credential};
  await api('/api/listener/register',{credential:t.credential},auth);
  t.listenerId=(await api('/api/admin/pilot/invites')).devices.find(d=>d.id===t.deviceId).listenerId;save(privateFile,t);
  await api('/api/listener/preferences',{adSkipEnabled:true,advert:true},auth);
  await api('/api/admin/ad-skip/pilot',{...pilot.configuration,expectedVersion:pilot.configuration.version,listenerIds:[...pilot.configuration.listenerIds,t.listenerId],enableListenerPreferences:false,confirmation:'ENABLE AD SKIP PILOT',reason:'Temporary one-hour automation access, explicitly authorised for verification; restore original membership afterwards.'});
  console.log({temporaryTesterCreated:true,spendingLimitsUnchanged:true});
 }else if(mode==='qa-stop'){
  const t=JSON.parse(readFileSync(privateFile));
  if(pilot.configuration.listenerIds.includes(t.listenerId))await api('/api/admin/ad-skip/pilot',{...pilot.configuration,expectedVersion:pilot.configuration.version,listenerIds:pilot.configuration.listenerIds.filter(id=>id!==t.listenerId),enableListenerPreferences:false,confirmation:'ENABLE AD SKIP PILOT',reason:'Verification completed; remove temporary tester without changing original membership, preferences or expiry.'});
  await api('/api/admin/pilot/devices/revoke',{deviceId:t.deviceId});t.revokedAt=new Date().toISOString();save(privateFile,t);
  const after=await api('/api/admin/ad-skip/pilot');assert.deepEqual(after.configuration.listenerIds,t.originalPilot.listenerIds);assert.equal(after.configuration.expiresAt,t.originalPilot.expiresAt);
  save('evals/universal-ad-skip-phase3-qa-cleanup.json',{at:t.revokedAt,temporaryTesterRevoked:true,originalMembershipRestored:true,originalExpiryPreserved:true});console.log({temporaryTesterRevoked:true});
 }else if(mode==='status'){
  const episodes=[];
  for(const target of JSON.parse(readFileSync('evals/policy-surgery-after.json')).episodes){const identity={feedUrl:target.feedUrl,episodeId:target.episodeId};const detail=await api('/api/admin/episodes/detail?'+new URLSearchParams(identity));const v=detail.episode;episodes.push({...identity,title:v.title,state:v.state,code:v.code,executionDecision:compactDecision(v.executionDecision),adSkip:v.adSkip||null});}
  const intelligence=await api('/api/admin/intelligence'),skips=await api('/api/admin/ad-skip');
  save('evals/universal-ad-skip-phase3-live.json',{at:new Date().toISOString(),episodes,pilot:{active:pilot.configuration.active,expiresAt:pilot.configuration.expiresAt,testers:pilot.configuration.listenerIds.length,publicAutomaticSkipping:pilot.publicAutomaticSkipping},controls:intelligence.controls,totals:intelligence.totals,reservations:intelligence.reservations,usageEntriesTotal:intelligence.usage.length,usage:intelligence.usage.filter(row=>Date.parse(row.at)>=Date.parse('2026-11-18T15:00:00Z')),skipCounts:skips.counts,release:skips.release});
  console.log({episodes:episodes.map(e=>({title:e.title,state:e.state,code:e.code})),pilotActive:pilot.configuration.active,totals:intelligence.totals});
 }else throw Error('Use renew 21, qa-start, qa-stop or status');
}finally{await fetch(c.url+'/api/admin/session',{method:'DELETE',headers:admin});}
