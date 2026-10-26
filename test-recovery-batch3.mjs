import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {LocalStore} from './persistence.mjs';
import {AdminService,AdministratorRole} from './admin-service.mjs';
import {createStarCastServer} from './server.mjs';
import {RequestLimits,viewerIdentity} from './request-limits.mjs';

const env={NODE_ENV:'production',STARCAST_ADMIN_TOKEN:'batch3-isolated-recovery',STARCAST_TRUST_CLOUDFRONT_VPC:'enabled',STARCAST_TRUSTED_PROXY_CIDR:'127.0.0.1/32'};
const dir=mkdtempSync(`${tmpdir()}/starcast-batch3-`),path=`${dir}/test.sqlite`;
const app=createStarCastServer({store:new LocalStore(path),env});
let now=Date.now();app.adminService.now=()=>now;
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${app.server.address().port}`;
let viewer=0;
async function request(route,{session,body,method=body?'POST':'GET',csrf=true,headers={}}={}) {
 const response=await fetch(base+route,{method,headers:{'content-type':'application/json',...(session?{cookie:session.cookie,...(csrf?{'x-star-cast-csrf':session.csrf}:{})}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();return {status:response.status,data,response};
}
async function login(body,status=201) {
 const result=await request('/api/admin/session',{body,headers:{'x-amz-cf-id':'isolated-trusted-proxy-fixture','x-forwarded-for':`198.51.100.${++viewer}`}});
 assert.equal(result.status,status,JSON.stringify(result.data));
 const cookie=result.response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 return {...result,cookie,csrf:cookie.match(/starcast_admin_csrf=([^;]+)/)?.[1]};
}
const password='fixture-only-password-not-a-production-credential';
let revoked;
try {
 const emergency=await login({adminToken:env.STARCAST_ADMIN_TOKEN,emergency:true});
 assert.match(emergency.response.headers.get('set-cookie'),/Max-Age=28800/);
 assert.match(emergency.response.headers.get('set-cookie'),/HttpOnly/);
 assert.match(emergency.response.headers.get('set-cookie'),/Secure/);
 const provision=async(input,session=emergency)=>request('/api/admin/administrators',{session,body:{password,reason:'Isolated security verification',confirmation:'CONFIRM',...input}});
 const ownerResult=await provision({bootstrap:true,name:'Fixture owner',login:'fixture-owner'});
 assert.equal(ownerResult.status,201,JSON.stringify(ownerResult.data));
 const owner=await login({login:'fixture-owner',password});
 assert.notEqual(owner.data.actor.id,'operations-super-admin');
 assert.equal(owner.data.actor.role,'SUPER_ADMIN');
 await login({adminToken:env.STARCAST_ADMIN_TOKEN},401);
 await login({adminToken:env.STARCAST_ADMIN_TOKEN,emergency:true});
 assert.equal((await provision({bootstrap:true,name:'Another owner',login:'duplicate-owner'})).status,409);
 const roles={};
 for(const role of Object.values(AdministratorRole)) {
  if(role==='SUPER_ADMIN'){roles[role]=owner;continue;}
  const created=await provision({name:`Fixture ${role}`,login:role.toLowerCase(),role},owner);assert.equal(created.status,201);
  const session=await login({login:role.toLowerCase(),password});roles[role]=session;
  for(const [route,permission] of [['/api/admin/administrators','administrators:read'],['/api/admin/rights','rights:read'],['/api/admin/pilot/invites','listeners:read'],['/api/admin/features','features:read']]) {
   const result=await request(route,{session});assert.equal(result.status,app.adminService.permissionsFor(role).includes(permission)?200:403,`${role} ${route}`);
  }
  assert.equal((await request('/api/admin/configuration',{session,body:{expectedVersion:1,values:{security:{adminSessionHours:1}},reason:'No escalation',confirmation:'CONFIRM'}})).status,403);
 }
 const ownerId=owner.data.actor.id;
 const config={expectedVersion:1,values:{security:{adminSessionHours:1}},reason:'Test one-hour expiry',confirmation:'CONFIRM'};
 assert.equal((await request('/api/admin/configuration',{session:owner,body:config,csrf:false})).status,403);
 assert.equal((await request('/api/admin/configuration',{session:owner,body:config})).status,200);
 assert.equal((await request('/api/admin/configuration',{session:owner,body:config})).status,409);
 assert.equal((await request('/api/admin/session',{session:owner})).data.expiresAt,now+3600000);
 const short=await login({login:'fixture-owner',password});assert.match(short.response.headers.get('set-cookie'),/Max-Age=3600/);
 assert.equal((await request('/api/admin/configuration',{session:owner,body:{...config,expectedVersion:2,values:{security:{adminSessionHours:8}}}})).status,200);
 assert.equal((await request('/api/admin/session',{session:short})).data.expiresAt,now+3600000,'increasing policy does not extend issued expiry');
 const long=await login({login:'fixture-owner',password});assert.match(long.response.headers.get('set-cookie'),/Max-Age=28800/);
 now+=3600001;
 assert.equal((await request('/api/admin/session',{session:short})).status,401);
 assert.equal((await request('/api/admin/session',{session:long})).status,200);
 const member=app.adminService.members().find(m=>m.role==='READ_ONLY');
 assert.equal((await provision({id:member.id,expectedVersion:member.version,password:'',active:false},long)).status,200);
 revoked=roles.READ_ONLY;
 assert.equal((await request('/api/admin/session',{session:revoked})).status,401);
 await login({login:member.login,password},401);
 const finance=app.adminService.members().find(m=>m.role==='FINANCE_ADMIN');
 assert.equal((await provision({id:finance.id,expectedVersion:finance.version,password:'changed-fixture-password-long-enough'},long)).status,200);
 assert.equal((await request('/api/admin/session',{session:roles.FINANCE_ADMIN})).status,401);
 await login({login:finance.login,password},401);
 const flags=app.adminService.featureFlags();
 const flag={id:'episodeBrief',state:'PRIVATE_BETA',rolloutPercent:10,audience:'PRIVATE_BETA',expectedVersion:1,reason:'Measured test cohort',confirmation:'CONFIRM'};
 assert.equal((await request('/api/admin/features',{session:long,body:flag})).status,200);
 assert.equal((await request('/api/admin/features',{session:long,body:flag})).status,409);
 assert.equal((await request('/api/admin/features',{session:roles.SUPPORT_AGENT,body:{...flag,expectedVersion:2}})).status,403);
 assert.equal((await request('/api/admin/features',{session:long,body:{...flag,id:'aiSleep'}})).status,400);
 const audit=app.adminService.audit({limit:500});
 assert(audit.some(a=>a.actor?.id===ownerId&&a.action==='configuration-changed'&&a.previousState&&a.newState&&a.reason));
 assert(!JSON.stringify(audit).includes(password));assert(!JSON.stringify(app.adminService.members()).includes('scrypt'));
 const events=app.store.all('admin-audit').map(([,e])=>e),byHash=new Map(events.map(e=>[e.hash,e]));
 let head=app.store.get('admin-audit-head','global').hash,seen=0;
 while(head){const e=byHash.get(head);assert(e);const {hash,...payload}=e;assert.equal(createHash('sha256').update(JSON.stringify(payload)).digest('hex'),hash);head=e.previousHash;seen++;}assert.equal(seen,events.length);
 assert.equal((await request('/api/admin/session',{session:long,method:'DELETE'})).status,200);
 assert.equal((await request('/api/admin/session',{session:long})).status,401);
 console.log('Batch 3: individual HTTP identities, all six roles, CSRF, CAS, credential rotation, revocation, recovery and one/eight-hour sessions verified.');
} finally {await new Promise(resolve=>app.server.close(resolve));app.store.close();}
const persisted=new LocalStore(path),service=new AdminService(persisted,{now:()=>now});
assert.equal(service.session(decodeURIComponent(revoked.cookie.match(/starcast_admin=([^;]+)/)[1])),null);
const actor={id:'fixture-owner',role:'SUPER_ADMIN'};
for(const percent of [0,1,10,100]) {
 const prior=service.featureFlags().find(f=>f.id==='episodeBrief');service.setFeatureFlag({id:prior.id,state:'PRIVATE_BETA',rolloutPercent:percent,audience:'PRIVATE_BETA',expectedVersion:prior.version,reason:'Deterministic distribution test',confirmation:'CONFIRM'},actor);
 let count=0;for(let i=0;i<10000;i++){const context={id:`listener-${i}`,privateBeta:true};const first=service.featureDecision(prior.id,context);assert.deepEqual(first,service.featureDecision(prior.id,context));if(first.allowed)count++;}
 if(percent===0||percent===100)assert.equal(count,percent*100);else assert(Math.abs(count-percent*100)<percent*100*.35,`${percent}% produced ${count}`);
 assert.equal(service.featureDecision(prior.id,{id:'not-invited'}).allowed,false);
}
const prior=service.featureFlags().find(f=>f.id==='episodeBrief');service.setFeatureFlag({...prior,state:'INTERNAL_TESTING',expectedVersion:prior.version,reason:'Internal audience test',confirmation:'CONFIRM'},actor);
assert.equal(service.featureDecision(prior.id,{id:'ordinary',privateBeta:true}).allowed,false);
assert.equal(service.featureDecision(prior.id,{id:'internal',internal:true}).allowed,true);
assert.equal(service.featureDecision('adSkip',{id:'internal',internal:true}).allowed,false,'feature flags do not enable verified skipping');
persisted.close();rmSync(dir,{recursive:true,force:true});
const req=(forwarded,peer='127.0.0.1')=>({socket:{remoteAddress:peer},headers:{'x-amz-cf-id':'fixture','x-forwarded-for':forwarded}});
assert.equal(viewerIdentity(req('spoof, 203.0.113.1'),env).key,'203.0.113.1');
assert.equal(viewerIdentity(req('different-spoof, 203.0.113.1'),env).key,'203.0.113.1');
assert.equal(viewerIdentity(req('203.0.113.1','192.0.2.1'),env).key,'192.0.2.1');
assert.equal(viewerIdentity(req('203.0.113.1'),{}).key,'127.0.0.1');
assert.equal(viewerIdentity(req('2001:db8:0:0:0:0:0:1'),env).key,'2001:db8::1');
const limits=new RequestLimits();for(let i=0;i<8;i++)assert(limits.permit(req('spoof, 203.0.113.1'),{env,kind:'admin-login'}));
assert.equal(limits.permit(req('another-spoof, 203.0.113.1'),{env,kind:'admin-login'}),false);
assert(limits.permit(req('203.0.113.2'),{env,kind:'admin-login'}),'unrelated CloudFront viewers have independent quotas');
for(let i=0;i<120;i++)assert(limits.permit(req('203.0.113.1'),{env,listenerId:'listener-a'}));
assert.equal(limits.permit(req('203.0.113.2'),{env,listenerId:'listener-a'}),false);
assert(limits.permit(req('203.0.113.1'),{env,listenerId:'listener-b'}));
const global=new RequestLimits();for(let i=0;i<80;i++)assert(global.permit(req(`203.0.113.${i}`),{env,kind:'enrollment'}));
assert.equal(global.permit(req('198.51.100.1'),{env,kind:'enrollment'}),false);
console.log('Batch 3: persisted revocation, deterministic 0/1/10/100 cohorts, audience isolation, trusted proxy, spoof resistance, independent listener limits and global ceiling verified.');

// Listener delivery and automatic preparation use the same live identity cohort.
const rolloutApp=createStarCastServer({store:new LocalStore(':memory:'),env:{NODE_ENV:'production',STARCAST_DEV_INTELLIGENCE_TOKEN:'fixture-gateway',STARCAST_ADMIN_TOKEN:'fixture-admin',STARCAST_TRUST_CLOUDFRONT_VPC:'enabled',STARCAST_TRUSTED_PROXY_CIDR:'127.0.0.1/32'}});
await new Promise(r=>rolloutApp.server.listen(0,'127.0.0.1',r));
const rolloutBase=`http://127.0.0.1:${rolloutApp.server.address().port}`;
try {
 const candidates=[];
 for(let i=0;i<32;i++) {
  const credential=`fixture-listener-credential-long-enough-${i}`,listener=rolloutApp.listeners.register(credential);
  rolloutApp.store.set('pilot-device',`fixture-${i}`,{id:`fixture-${i}`,listenerId:listener.id,expiresAt:new Date(Date.now()+86400000).toISOString()});
  candidates.push({...listener,credential});
 }
 for(const feature of ['episodeBrief','conversationSearch','automaticProcessing'])rolloutApp.adminService.setFeatureFlag({id:feature,state:'PRIVATE_BETA',rolloutPercent:10,audience:'PRIVATE_BETA',expectedVersion:1,reason:'HTTP cohort fixture',confirmation:'CONFIRM'},actor);
 for(const listener of candidates) {
  const headers={authorization:`Bearer ${listener.credential}`,'x-star-cast-dev-token':'fixture-gateway'};
  const response=await fetch(rolloutBase+'/api/intelligence/status?'+new URLSearchParams({feedUrl:'https://fixture.example/rss',episodeId:'one'}),{headers});assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.features.episodeBriefs,rolloutApp.adminService.featureDecision('episodeBrief',{id:listener.id,privateBeta:true}).allowed);
  const search=await fetch(rolloutBase+'/api/search/conversations',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({query:'documented evidence'})});
  assert.equal(search.status,rolloutApp.adminService.featureDecision('conversationSearch',{id:listener.id,privateBeta:true}).allowed?200:403);
 }
 assert.deepEqual(new Set(rolloutApp.followedPreparation.listeners().map(l=>l.id)),new Set(candidates.filter(l=>rolloutApp.adminService.featureDecision('automaticProcessing',{id:l.id,privateBeta:true}).allowed).map(l=>l.id)));
 const stranger=rolloutApp.listeners.register('fixture-non-beta-credential-long-enough');
 const noBeta=await(await fetch(rolloutBase+'/api/intelligence/status?'+new URLSearchParams({feedUrl:'https://fixture.example/rss',episodeId:'one'}),{headers:{authorization:'Bearer fixture-non-beta-credential-long-enough','x-star-cast-dev-token':'fixture-gateway'}})).json();assert.equal(noBeta.features.episodeBriefs,false);
 // Forwarded prefixes cannot buy additional attempts; independent viewers can log in.
 for(let i=0;i<8;i++)assert.equal((await fetch(rolloutBase+'/api/admin/session',{method:'POST',headers:{'content-type':'application/json','x-amz-cf-id':'trusted-fixture','x-forwarded-for':`spoof-${i}, 203.0.113.91`},body:JSON.stringify({adminToken:'wrong'})})).status,401);
 assert.equal((await fetch(rolloutBase+'/api/admin/session',{method:'POST',headers:{'content-type':'application/json','x-amz-cf-id':'trusted-fixture','x-forwarded-for':'fresh-spoof, 203.0.113.91'},body:JSON.stringify({adminToken:'fixture-admin'})})).status,429);
 assert.equal((await fetch(rolloutBase+'/api/admin/session',{method:'POST',headers:{'content-type':'application/json','x-amz-cf-id':'trusted-fixture','x-forwarded-for':'203.0.113.92'},body:JSON.stringify({adminToken:'fixture-admin'})})).status,201);
 console.log('Batch 3: real HTTP listener cohorts, non-beta exclusion, automatic-preparation cohort and proxy login isolation verified.');
} finally {await new Promise(r=>rolloutApp.server.close(r));rolloutApp.store.close();}

const legacyStore=new LocalStore(':memory:');
legacyStore.set('feature-flag','adSkip',{id:'adSkip',state:'PRIVATE_BETA',rolloutPercent:100,version:4,eligibilityRules:'Authenticated installations with listener Ad Skip enabled; independently verified exact-variant intervals only.'});
const migrated=new AdminService(legacyStore);
assert.equal(migrated.featureFlags().find(f=>f.id==='adSkip').version,5);
assert.equal(migrated.featureDecision('adSkip',{id:'beta',privateBeta:true}).allowed,true);
assert.equal(migrated.featureDecision('adSkip',{id:'ordinary'}).allowed,false);
assert.equal(migrated.audit()[0].previousState.version,4);
new AdminService(legacyStore);assert.equal(migrated.audit().length,1,'legacy mapping is idempotent');legacyStore.close();
