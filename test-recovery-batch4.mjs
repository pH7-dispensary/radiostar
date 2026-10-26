import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm,utimes,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {BackupWorker} from './backup-worker.mjs';
import {LocalStore} from './persistence.mjs';
import {runtimeMetrics,metricEnvelope,observe} from './operations-monitor.mjs';
import {createStarCastServer} from './server.mjs';
import {ProcessingQueue} from './processing-queue.mjs';
const dir=await mkdtemp(`${tmpdir()}/starcast-batch4-`),database=`${dir}/backend.sqlite`,store=new LocalStore(database);store.set('fixture','one',{value:'consistent'});
store.set('intelligence-history','legacy',{feedUrl:'https://one.example/rss',episode:{id:'legacy'}});
assert.equal(store.episodeJobs('https://one.example/rss','legacy').length,1);
assert.equal(store.episodeJobs('https://other.example/rss','legacy').length,0);
assert(store.db.prepare("EXPLAIN QUERY PLAN SELECT payload FROM records WHERE kind IN ('intelligence-history','intelligence') AND json_extract(payload,'$.feedUrl')=?").all('https://one.example/rss').some(row=>row.detail.includes('records_episode_feed')));
let sends=0;const objects=new Map();const client={send:async command=>{sends++;const chunks=[];for await(const c of command.input.Body)chunks.push(c);objects.set(command.input.Key,Buffer.concat(chunks));return {ChecksumSHA256:command.input.ChecksumSHA256,VersionId:'fixture-version'};}};
try{
 const worker=new BackupWorker({database,directory:dir,bucket:'isolated',client,backoff:async()=>{}});
 const first=worker.run();assert.equal(worker.run(),first,'overlap returns the active job');const result=await first;assert.equal(result.integrity,'ok');assert.equal(sends,2);assert(objects.has('recovery/latest.sqlite'));
 await writeFile(`${dir}/restored.sqlite`,objects.get('recovery/latest.sqlite'));const restored=new LocalStore(`${dir}/restored.sqlite`);assert.deepEqual(restored.get('fixture','one'),{value:'consistent'});restored.close();
 const previous=await readFile(`${dir}/backup-verification.json`,'utf8');let attempts=0;
 const retry=new BackupWorker({database,directory:dir,bucket:'isolated',maxAttempts:3,backoff:async()=>{},client:{send:async(...args)=>{if(++attempts===1)throw Error('Temporary failure');return client.send(...args);}}});assert.equal((await retry.run()).attempt,2);
 const good=await readFile(`${dir}/backup-verification.json`,'utf8');
 const bad=new BackupWorker({database,directory:dir,bucket:'isolated',maxAttempts:1,client:{send:async()=>({ChecksumSHA256:'wrong'})}});await assert.rejects(bad.run(),/CHECKSUM/);assert.equal(await readFile(`${dir}/backup-verification.json`,'utf8'),good);assert.equal(JSON.parse(await readFile(`${dir}/backup-state.json`)).state,'FAILED');
 await writeFile(`${dir}/backup-work/diagnostic.sqlite`,'preserve');await writeFile(`${dir}/backup-work/backend-2020-01-01T00-00-00.000Z.sqlite`,'obsolete staging');await utimes(`${dir}/backup-work/backend-2020-01-01T00-00-00.000Z.sqlite`,new Date(0),new Date(0));await worker.run();assert.deepEqual(await readdir(`${dir}/backup-work`),['diagnostic.sqlite']);
 assert.equal(runtimeMetrics({}).WorkerReady,0);assert.equal(runtimeMetrics({}).BackupAgeSeconds,undefined);
 assert.equal(runtimeMetrics({heartbeat:{at:Date.now()-100000,workerRunning:true,eventLoopP99Ms:1}}).EventLoopP99Ms,undefined);
 const envelope=metricEnvelope({ApiReady:1,EventLoopP99Ms:undefined});assert.deepEqual(envelope._aws.CloudWatchMetrics[0].Metrics.map(m=>m.Name),['ApiReady']);
 const observation=await observe({directory:dir,fetcher:async()=>({ok:true,json:async()=>({backend:'ready'})})});assert.equal(observation.DatabaseIntegrity,1);assert.equal(observation.ApiReady,1);assert.equal(observation.WorkerReady,0);
 const app=createStarCastServer({store:new LocalStore(':memory:'),env:{STARCAST_ADMIN_TOKEN:'fixture',STARCAST_DEV_INTELLIGENCE_TOKEN:'fixture-device'}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 let renewals=0,acknowledged=0,received=false;let complete;
 const completed=new Promise(r=>complete=r),queue=new ProcessingQueue({queueUrl:'https://sqs.eu-west-2.amazonaws.com/208096650030/starcast-phase1-processing',renewalMs:250,client:{send:async c=>{if(c.constructor.name==='ReceiveMessageCommand'){if(received)return {Messages:[]};received=true;return {Messages:[{Body:'{"jobId":"isolated"}',ReceiptHandle:'fixture'}]};}if(c.constructor.name==='ChangeMessageVisibilityCommand')renewals++;if(c.constructor.name==='DeleteMessageCommand')acknowledged++;return {};}}});
 const queueWork=queue.run({recover:async()=>{},execute:async()=>{await completed;queue.stop();}});
 const child=fork(new URL('./test-backup-child.mjs',import.meta.url),[database,dir],{stdio:['ignore','ignore','pipe','ipc']});let expectedFailure=false;child.on('message',m=>{if(m.expectedFailure)expectedFailure=true;});const exited=once(child,'exit');
 let count=0,maxMs=0;const start=Date.now();
 try{while(Date.now()-start<61000){const at=performance.now();const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(2000)});assert.equal(r.status,200);maxMs=Math.max(maxMs,performance.now()-at);count++;if(expectedFailure)break;await delay(600);}const [code]=await exited;assert.equal(code,0);assert(expectedFailure);assert(Date.now()-start>=60000);assert(renewals>150);assert(count>=80);}
 finally{child.kill();complete();await queueWork;await new Promise(r=>app.server.close(r));app.store.close();}
 assert.equal(acknowledged,1);assert.equal(JSON.parse(await readFile(`${dir}/backup-state.json`)).state,'FAILED');
 console.log(JSON.stringify({test:'60-second failed upload isolation',durationMs:Date.now()-start,apiRequests:count,maxApiMs:maxMs,leaseRenewals:renewals,acknowledged}));
 const tf=await readFile('infra/aws/monitoring.tf','utf8');assert(tf.includes('treat_missing_data'));assert(tf.includes('datapoints_to_alarm = 2')||tf.includes('datapoints_to_alarm  = 2'));assert(!tf.includes('stop_instance'));assert(tf.includes('aws_sns_topic.operations.arn'));
 console.log('Batch 4 consistent snapshots, checksum, retries, failure isolation, overlap prevention, retention eligibility, missing telemetry and notification routing passed.');
}finally{store.close();await rm(dir,{recursive:true,force:true});}
