// Existing-cache checks only. No pilot changes, enrolment, paid jobs or playback receipts.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyAwsIdentity} from './aws-account-guard.mjs';
import {adSkipFixture} from '../ad-skip-fixture.mjs';
verifyAwsIdentity();
const connection=JSON.parse(readFileSync('.starcast/cloud-connection.json'));
assert.equal(connection.url,'https://d3ri12f40b85i3.cloudfront.net');
const admin=JSON.parse(readFileSync('.starcast/cloud-admin.json'));
const qa=JSON.parse(readFileSync('.starcast/translation-verification.json'));
const base={'content-type':'application/json','x-star-cast-dev-token':connection.token};
const session=await fetch(connection.url+'/api/admin/session',{method:'POST',headers:base,body:JSON.stringify({adminToken:admin.token,emergency:true})});assert.equal(session.status,201);
const cookies=session.headers.getSetCookie().map(v=>v.split(';')[0]);
const headers={...base,cookie:cookies.join('; ')},listener={'content-type':'application/json','x-star-cast-pilot-token':qa.deviceToken,authorization:'Bearer '+qa.credential};
async function request(path,auth=headers,body){const res=await fetch(connection.url+path,{method:body?'POST':'GET',headers:auth,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});assert.equal(res.status,200,path);return res.json();}
try {
 const health=await request('/api/health',{});
 assert.equal((await fetch(connection.url+'/api/admin/ad-skip')).status,403);
 const before=await request('/api/admin/intelligence/testing');
 const ops=await request('/api/admin/operations'),skips=await request('/api/admin/ad-skip');
 assert.equal(skips.release.productionAutomaticSkipping,false);
 assert(skips.diagnostics.length>0&&skips.diagnostics.every(row=>'completeBreakCoverage' in row&&'audioIdentity' in row));
 const manifest=adSkipFixture.manifest(),input={feedUrl:connection.url+adSkipFixture.feedPath,episodeId:adSkipFixture.episodeId,audioUrl:connection.url+adSkipFixture.audioPath,audioVariantFingerprint:manifest.audioContentHash};
 const status=await request('/api/skips/status',listener,input);
 assert.equal(status.verifiedCount,1);assert.equal(status.automaticSkipping,false);assert.equal(status.code,'PILOT_DISABLED');
 const denied=await fetch(connection.url+'/api/skips/authorise',{method:'POST',headers:listener,body:JSON.stringify({...input,intervalId:status.intervals[0].id,positionMs:15000,prefetch:true})});assert.equal(denied.status,400);
 const audio=await fetch(input.audioUrl);assert.equal(audio.status,200);const bytes=Buffer.from(await audio.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.audioContentHash);
 const intelligence=await request('/api/intelligence/status?'+new URLSearchParams({feedUrl:connection.url+'/fixtures/approved-test-feed.xml',episodeId:'starcast-approved-test-episode-v1'}),listener);
 assert(['READY','PARTIAL_READY'].includes(intelligence.status.state));assert(intelligence.status.brief&&intelligence.features.conversationSearch);
 const after=await request('/api/admin/intelligence/testing');assert.deepEqual(after.configuration,before.configuration);
 const output={at:new Date().toISOString(),release:ops.infrastructure.release,health,adminAuthentication:'verified',publicAutomaticSkipping:false,nonPilotLeaseDenied:true,pilotConfigurationUnchanged:true,pilotExpiresAt:after.configuration.expiresAt,ownedAudioHash:manifest.audioContentHash,ownedAudioBytes:bytes.length,ownedVerifiedIntervals:status.verifiedCount,cachedIntelligence:intelligence.status.state,diagnosticRows:skips.diagnostics.length,counts:skips.counts,physicalIphoneVerified:false,productionWrites:'Verification session and cached episode-status projection only; no pilot changes, new receipts or paid processing.'};
 writeFileSync('.starcast/batch6-live.json',JSON.stringify(output,null,2),{mode:0o600});console.log(JSON.stringify(output));
}finally{const csrf=decodeURIComponent(cookies.find(v=>v.startsWith('starcast_admin_csrf=')).split('=').slice(1).join('='));const res=await fetch(connection.url+'/api/admin/session',{method:'DELETE',headers:{...headers,'x-star-cast-csrf':csrf}});assert.equal(res.status,200);}
