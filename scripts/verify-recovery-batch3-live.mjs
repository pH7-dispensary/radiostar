// Read-only production verification, except creating/revoking its own recovery session.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const connection=JSON.parse(readFileSync('.starcast/cloud-connection.json'));
const token=JSON.parse(readFileSync('.starcast/cloud-admin.json')).token;
const headers={'x-star-cast-dev-token':connection.token,'content-type':'application/json'};
const origin=connection.url;
async function get(path,extra={}){const r=await fetch(origin+path,{headers:{...headers,...extra}});assert.equal(r.status,200,`${path}: ${r.status}`);return r.json();}
const response=await fetch(origin+'/api/admin/session',{method:'POST',headers,body:JSON.stringify({adminToken:token,emergency:true})});assert.equal(response.status,201);
const login=await response.json(),cookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; '),csrf=cookie.match(/starcast_admin_csrf=([^;]+)/)?.[1];
try {
 assert.equal(login.actor.id,'operations-super-admin');assert.equal(login.actor.role,'SUPER_ADMIN');assert.equal(login.actor.emergency,true);
 assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.match(response.headers.get('set-cookie'),/Secure/);
 const configuration=(await get('/api/admin/configuration',{cookie})).configuration;
 assert.match(response.headers.get('set-cookie'),new RegExp(`Max-Age=${configuration.values.security.adminSessionHours*3600}`));
 const session=await get('/api/admin/session',{cookie,'x-forwarded-for':'198.51.100.99'});assert.equal(session.viewerIdentification,'cloudfront-vpc');
 assert.equal(session.expiresAt,login.expiresAt);
 const members=await get('/api/admin/administrators',{cookie}),features=await get('/api/admin/features',{cookie});
 assert(features.features.filter(f=>f.editable).every(f=>['AUTHENTICATED','PRIVATE_BETA','INTERNAL_TESTERS'].includes(f.audience)));
 assert(features.features.filter(f=>!f.editable).every(f=>['aiSleep','referrals','subscriptions'].includes(f.id)));
 assert.equal((await fetch(origin+'/api/admin/administrators',{headers})).status,403);
 assert.equal((await fetch(origin+'/api/admin/configuration',{method:'POST',headers:{...headers,cookie},body:JSON.stringify({})})).status,403);
 const qa=JSON.parse(readFileSync('.starcast/translation-verification.json'));
 const listenerHeaders={'x-star-cast-pilot-token':qa.deviceToken,authorization:`Bearer ${qa.credential}`};
 const status=await get('/api/intelligence/status?'+new URLSearchParams({feedUrl:origin+'/fixtures/approved-test-feed.xml',episodeId:'starcast-approved-test-episode-v1'}),listenerHeaders);
 assert.equal(status.features.episodeBriefs,true);assert.equal(status.features.conversationSearch,true);
 assert.equal(status.status.state,'READY');assert(status.status.brief);
 const op=await get('/api/admin/operations',{cookie});
 const output={verifiedAt:new Date().toISOString(),release:op.infrastructure.release,recovery:{identity:login.actor.id,role:login.actor.role,sessionHours:configuration.values.security.adminSessionHours,viewerIdentification:session.viewerIdentification},migration:members.migration,administratorCount:members.administrators.length,flags:features.features.map(({id,state,rolloutPercent,audience,editable,version})=>({id,state,rolloutPercent,audience,editable,version})),listener:{authentication:'verified',cachedIntelligence:status.status.state,features:status.features},health:await get('/api/health'),limitations:['Individual production login awaits owner provisioning.','Independent viewer quotas verified with isolated HTTP proxy fixtures; two physical networks not exercised.'],productionMutations:'Only verification session creation/revocation; no accounts, policies, budgets or paid jobs changed.'};
 writeFileSync('.starcast/batch3-live.json',JSON.stringify(output,null,2),{mode:0o600});console.log(JSON.stringify(output));
}finally{assert.equal((await fetch(origin+'/api/admin/session',{method:'DELETE',headers:{...headers,cookie,'x-star-cast-csrf':csrf}})).status,200);assert.equal((await fetch(origin+'/api/admin/session',{headers:{...headers,cookie}})).status,401);}
