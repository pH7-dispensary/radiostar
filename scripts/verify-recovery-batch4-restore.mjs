// Run only against a disposable restored copy. Never opens a production path.
import assert from 'node:assert/strict';
import {copyFile,readFile,writeFile} from 'node:fs/promises';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {LocalStore} from '../persistence.mjs';
import {createStarCastServer} from '../server.mjs';
const [source,directory,output]=process.argv.slice(2);
if(!source||!directory||!output||source.includes('/var/lib/starcast')||directory.includes('/var/lib/starcast'))throw Error('A disposable restore directory is required');
const start=performance.now();await copyFile(source,`${directory}/restored.sqlite`);const store=new LocalStore(`${directory}/restored.sqlite`);
assert.equal(Object.values(store.db.prepare('PRAGMA integrity_check').get())[0],'ok');
const counts=Object.fromEntries(store.db.prepare('SELECT kind,count(*) AS n FROM records GROUP BY kind').all().map(r=>[r.kind,r.n]));
assert(counts.intelligence>0&&counts.installation>0&&counts.rights>0&&counts['feed-observation']>0);
const ledgerBefore=JSON.stringify(store.all('budget')),readyBefore=store.all('intelligence').filter(([,j])=>j.state==='READY').map(([id])=>id);
const restorationMs=performance.now()-start;const realFetch=globalThis.fetch;let blockedExternalRequests=0;
globalThis.fetch=(url,options)=>{const target=new URL(typeof url==='string'?url:url.url||url);if(target.hostname!=='127.0.0.1'){blockedExternalRequests++;throw Error('Outbound network disabled for isolated restoration');}return realFetch(url,options);};
const fakeRss='<rss><channel><title>Isolated catalogue benchmark</title><item><guid>fixture</guid><title>Restoration fixture</title><enclosure url="https://fixture.invalid/audio.mp3"/></item></channel></rss>';
const boot=performance.now();const app=createStarCastServer({store,env:{STARCAST_DATA_DIR:directory,STARCAST_DEV_INTELLIGENCE_TOKEN:'isolated-gateway',STARCAST_ADMIN_TOKEN:'isolated-emergency-credential',STARCAST_PAID_INTELLIGENCE:'disabled',STARCAST_AUDIO_TRANSCRIPTION:'disabled',RADIOSTAR_TRANSLATE_BETA:'DISABLED'},fetchFeed:async()=>fakeRss,client:{responses:{create:async()=>{throw Error('Paid provider disabled');}}}});
assert.equal(app.queue,null);assert.equal(app.ledger.controls.enabled,false);
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const startupMs=performance.now()-boot,base=`http://127.0.0.1:${app.server.address().port}`;
const healthStart=performance.now();assert.equal((await realFetch(base+'/api/health')).status,200);const healthMs=performance.now()-healthStart;
const headers={'content-type':'application/json','x-star-cast-dev-token':'isolated-gateway'};
let cookie;const report={counts,restorationMs,startupMs,healthMs,totalRestoreMs:performance.now()-start,environment:{node:process.version,platform:process.platform,arch:process.arch},benchmarks:[]};
try {
 const login=await realFetch(base+'/api/admin/session',{method:'POST',headers,body:JSON.stringify({adminToken:'isolated-emergency-credential',emergency:true})});assert.equal(login.status,201);cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const devices=[];for(let i=0;i<32;i++){const credential=`isolated-benchmark-listener-credential-${i}`;devices.push({credential,...app.listeners.register(credential)});}
 const discovery=await(await realFetch(base+'/api/intelligence/ready',{headers:{...headers,authorization:`Bearer ${devices[0].credential}`}})).json();assert(discovery.episodes.length>0);
 const episode=discovery.episodes[0],params=new URLSearchParams({feedUrl:episode.feedUrl,episodeId:episode.id});
 const sample=await(await realFetch(base+'/api/intelligence/status?'+params,{headers:{...headers,authorization:`Bearer ${devices[0].credential}`}})).json();assert(['READY','PARTIAL_READY'].includes(sample.status.state));assert(sample.status.brief);
 const scenarios=[['cached-intelligence','/api/intelligence/status?'+params],['catalogue-mocked-rss','/api/catalogue/feed?url=https%3A%2F%2Ffixture.invalid%2Frss'],['search','/api/search/conversations',{query:sample.status.brief.themes?.[0]||'evidence'}],['admin-list','/api/admin/podcasts?pageSize=20'],['processing-status','/api/admin/intelligence']];
 const percentile=(a,p)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))];
 for(const concurrency of [1,4,8,16]){
  const loop=monitorEventLoopDelay({resolution:10});loop.enable();const cpu=process.cpuUsage(),at=performance.now(),latencies=[],statuses={},byScenario={};let index=0;
  await Promise.all(Array.from({length:concurrency},async()=>{while(index<100){const n=index++,[name,path,body]=scenarios[n%scenarios.length],t=performance.now();const response=await realFetch(base+path,{method:body?'POST':'GET',headers:{...headers,cookie,authorization:`Bearer ${devices[n%devices.length].credential}`},...(body?{body:JSON.stringify(body)}:{})});await response.arrayBuffer();const ms=performance.now()-t;latencies.push(ms);statuses[response.status]=(statuses[response.status]||0)+1;(byScenario[name]||=[]).push(ms);}}));
  const durationMs=performance.now()-at,used=process.cpuUsage(cpu);loop.disable();
  report.benchmarks.push({concurrency,requests:latencies.length,durationMs,requestsPerSecond:latencies.length/(durationMs/1000),p50Ms:percentile(latencies,.5),p95Ms:percentile(latencies,.95),statuses,errorRate:(100-(statuses[200]||0))/100,cpuMs:(used.user+used.system)/1000,rssBytes:process.memoryUsage().rss,eventLoopP99Ms:loop.percentile(99)/1e6,scenarios:Object.fromEntries(Object.entries(byScenario).map(([name,values])=>[name,{p50Ms:percentile(values,.5),p95Ms:percentile(values,.95)}]))});
 }
 assert.equal(JSON.stringify(store.all('budget')),ledgerBefore,'restoration and benchmark must not consume or release real paid reservations');
 assert(readyBefore.every(id=>store.get('intelligence',id)?.state==='READY'));
 const dbStart=performance.now();for(let i=0;i<100;i++)store.get('intelligence',readyBefore[0]);report.database={pointLookups100Ms:performance.now()-dbStart,queryPlan:store.db.prepare('EXPLAIN QUERY PLAN SELECT payload FROM records WHERE kind=? AND id=?').all('intelligence',readyBefore[0]).map(r=>r.detail)};
 const scanStart=performance.now();for(let i=0;i<25;i++)store.all('intelligence');report.database.wholeKindReads25Ms=performance.now()-scanStart;
 report.verified={integrity:true,canonicalRecords:true,listenersPreserved:true,intelligenceCache:true,administratorSessionCompatibility:true,productionQueueDisabled:true,paidProcessingDisabled:true,paidLedgerUnchanged:true,readyJobsPreserved:true,blockedExternalRequests};
 report.scope='Restored production records, isolated fixture listener credentials and emergency login; catalogue RSS mocked to avoid external calls. Not a live concurrency guarantee or full EC2 replacement RTO.';
 await writeFile(output,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({restoreMs:report.totalRestoreMs,benchmarks:report.benchmarks.map(({scenarios,...row})=>row),verified:report.verified}));
}finally{globalThis.fetch=realFetch;await new Promise(r=>app.server.close(r));store.close();}
