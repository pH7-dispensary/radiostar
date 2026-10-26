// Production acceptance: cached data only, no permission grants or paid analysis.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {SEMANTIC_VERSION} from '../semantic-search.mjs';
import {verifyAwsIdentity} from './aws-account-guard.mjs';
verifyAwsIdentity();
const phase=process.argv[2]||'before';if(!['before','after','final'].includes(phase))throw Error('Unknown verification phase');
const db=new DatabaseSync('.starcast/batch8-snapshot.sqlite',{readOnly:true});
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
const all=kind=>db.prepare('SELECT id,payload FROM records WHERE kind=?').all(kind).map(r=>({...JSON.parse(r.payload),recordId:r.id}));
const canonical=all('intelligence'),derived=all('derived-provider');
const connection=JSON.parse(readFileSync('.starcast/cloud-connection.json')),admin=JSON.parse(readFileSync('.starcast/cloud-admin.json')),qa=JSON.parse(readFileSync('.starcast/translation-verification.json'));
assert.equal(connection.url,'https://d3ri12f40b85i3.cloudfront.net');
const gateway={'content-type':'application/json','x-star-cast-dev-token':connection.token};
const listener={'content-type':'application/json','x-star-cast-pilot-token':qa.deviceToken,authorization:'Bearer '+qa.credential};
const login=await fetch(connection.url+'/api/admin/session',{method:'POST',headers:gateway,body:JSON.stringify({adminToken:admin.token,emergency:true})});assert.equal(login.status,201);
const actor=await login.json(),cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),csrf=cookie.match(/starcast_admin_csrf=([^;]+)/)?.[1],administrative={...gateway,cookie};
const timings=[];async function api(path,headers=administrative,body){const start=performance.now();const r=await fetch(connection.url+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,`${path.split('?')[0]}: HTTP ${r.status}`);const value=await r.json();timings.push({path:path.split('?')[0],ms:Math.round(performance.now()-start)});return value;}
const report={at:new Date().toISOString(),phase,queries:[],cachedEpisodes:[]};
try{
 assert.equal(actor.actor.role,'SUPER_ADMIN');assert(login.headers.get('set-cookie').includes('HttpOnly'));assert(login.headers.get('set-cookie').includes('Secure'));
 const before=await api('/api/admin/intelligence'),ops=await api('/api/admin/operations'),members=await api('/api/admin/administrators'),flags=await api('/api/admin/features'),configuration=await api('/api/admin/configuration'),testing=await api('/api/admin/intelligence/testing'),skips=await api('/api/admin/ad-skip');
 const session=await api('/api/admin/session');assert.equal(session.viewerIdentification,'cloudfront-vpc');
 assert.equal((await fetch(connection.url+'/api/admin/operations')).status,403);
 assert.equal((await fetch(connection.url+'/api/admin/configuration',{method:'POST',headers:administrative,body:'{}'})).status,403,'CSRF is mandatory');
 for(const [key,value]of Object.entries({dailyUsd:5,monthlyUsd:25,dailyTranscriptionSeconds:10800,maxEpisodeSeconds:7200}))assert.equal(before.controls[key],value);
 assert.equal(skips.release.productionAutomaticSkipping,false);
 const feedUrl='https://opensourcesecuritypodcast.libsyn.com/rss',episodeId='b866917c-0245-4bcf-a06a-83f55ea44ca6';
 for(const id of [episodeId,'d04532a8-4020-449e-acd6-98fa8a1b6159']){
  const existing=canonical.find(v=>(v.episodeId||v.episode?.id)===id);assert(existing?.transcript?.segments?.length,'Only existing authorised cached episodes may be requested');
  const {status:s}=await api('/api/intelligence/status?'+new URLSearchParams({feedUrl,episodeId:id}),listener);assert(['READY','PARTIAL_READY'].includes(s.state));assert(!s.transcript);assert(s.brief?.overview&&s.chapters?.length&&s.topics?.length);
  let end=-1;for(const ch of s.chapters){assert(ch.startMs>=end&&ch.endMs>ch.startMs);assert(ch.sourceSegmentIds.every(segmentId=>existing.transcript.segments.some(seg=>seg.id===segmentId)));end=ch.endMs;}
  assert(s.topics.every(t=>t.sourceSegmentIds.length&&t.sourceSegmentIds.every(segmentId=>existing.transcript.segments.some(seg=>seg.id===segmentId))));
  report.cachedEpisodes.push({episodeId:id,state:s.state,briefMode:s.brief.mode,chapters:s.chapters.length,topics:s.topics.length,features:s.availableFeatures});
 }
 const cases=[['exact','safety is not security',['seg-29']],['paraphrase','How does the guest define being safe in terms of avoiding losses?',['seg-35']],['Portuguese','Como é definida a segurança em termos de ausência de perdas?',['seg-35']],['Chinese','安全与信息安全之间有什么区别？',['seg-29','seg-35']],['absent','Who won the lunar chess championship?',[]]];
 const sourceFor=m=>canonical.find(v=>(v.episodeId||v.episode?.id)===m.episode.id&&(v.feedUrl||v.episode?.feedUrl)===m.episode.feedUrl)?.transcript?.segments.find(s=>s.id===m.segmentId);
 for(const [kind,query,expected]of cases){const key='query:'+SEMANTIC_VERSION+':'+createHash('sha256').update(JSON.stringify([query])).digest('hex');assert(derived.some(d=>d.recordId===key&&d.state==='READY'),'Query must have a completed cache entry; refuse a new paid evaluation');const r=await api('/api/search/conversations',listener,{query,feedUrls:[feedUrl]});assert.equal(r.retrieval.mode,'semantic-with-lexical-fallback');for(const match of r.matches){const s=sourceFor(match);assert(s);assert.equal(match.startMs,s.startMs);assert.equal(match.endMs,s.endMs);assert(s.text.includes(match.context));}for(const claim of r.claims){const s=sourceFor(r.matches[claim.citation-1]);assert(s.text.includes(claim.text));}const matched=expected.length?r.matches.some(m=>m.episode.id===episodeId&&expected.includes(m.segmentId)):r.matches.length===0;assert(matched,kind+' expected evidence missing');report.queries.push({kind,matched,answerState:r.answerState,retrieval:r.retrieval,sourceCount:r.matches.length});}
 const moment=await api('/api/intelligence/moment',listener,{feedUrl,episodeId,query:'absence of loss events'});assert(moment.moments.some(m=>m.segmentId==='seg-35'&&m.startMs===219851));report.momentTimestampMs=219851;
 const ready=await api('/api/intelligence/ready',listener);report.readyDiscovery={keys:Object.keys(ready),episodes:(ready.episodes||ready.results||[]).map(e=>({id:e.episodeId||e.id,title:e.title,state:e.state}))};
 const after=await api('/api/admin/intelligence');assert.equal(after.usage.length,before.usage.length);assert.equal(after.usage.reduce((n,u)=>n+u.usd,0),before.usage.reduce((n,u)=>n+u.usd,0));assert.deepEqual(after.reservations,before.reservations);assert.equal(after.jobs.length,before.jobs.length);
 const followed=ops.followedPreparation;
 Object.assign(report,{health:await api('/api/health',{}),release:ops.infrastructure.release,infrastructure:ops.infrastructure,followed:{snapshot:followed.snapshot,uniqueEpisodes:followed.uniqueEpisodes,counts:followed.counts,estimate:followed.estimate,acquisition:followed.acquisition,budget:followed.budget,rows:followed.rows.map(r=>({feedUrl:r.feedUrl,episodeId:r.episodeId,title:r.title,state:r.state,code:r.code,inWindow:r.inWindow,eligible:r.eligible}))},admin:{emergencyLogin:true,individualMembers:members.administrators.length,migration:members.migration,sessionHours:configuration.configuration.values.security.adminSessionHours,proxy:session.viewerIdentification,csrf:'rejected',anonymous:'rejected'},features:flags.features.map(({id,state,rolloutPercent,audience})=>({id,state,rolloutPercent,audience})),testing:testing.configuration,adSkip:{counts:skips.counts,release:skips.release,diagnostics:skips.diagnostics},costs:{controls:after.controls,usageEntries:after.usage.length,recordedUsd:after.usage.reduce((n,u)=>n+u.usd,0),reservations:after.reservations.length,additionalPaidCalls:0},timings});
 writeFileSync('.starcast/batch8-'+phase+'.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({phase,release:report.release,health:report.health.backend,followed:{snapshot:followed.snapshot,episodes:followed.uniqueEpisodes,counts:followed.counts,estimate:followed.estimate},cachedEpisodes:report.cachedEpisodes,queries:report.queries,costs:report.costs,admin:report.admin},null,2));
}finally{db.close();assert.equal((await fetch(connection.url+'/api/admin/session',{method:'DELETE',headers:{...administrative,'x-star-cast-csrf':csrf}})).status,200);assert.equal((await fetch(connection.url+'/api/admin/session',{headers:administrative})).status,401);}
