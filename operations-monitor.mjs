import {DatabaseSync} from 'node:sqlite';
import {readFile,statfs} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export const metricUnits={ApiReady:'Count',WorkerReady:'Count',DatabaseIntegrity:'Count',DiskUsedPercent:'Percent',FreeInodes:'Count',BackupAgeSeconds:'Seconds',EventLoopP99Ms:'Milliseconds',ProcessingFailures5m:'Count',TelemetryHeartbeat:'Count',ApiLatencyMs:'Milliseconds',CapacityWaitingJobs:'Count',StalledProcessingJobs:'Count',ProviderFailures5m:'Count',IncorrectSkipReports1h:'Count'};
export function metricEnvelope(values,now=Date.now()){
 const metrics=Object.entries(metricUnits).filter(([key])=>Number.isFinite(values[key])).map(([Name,Unit])=>({Name,Unit,StorageResolution:60}));
 return {_aws:{Timestamp:now,CloudWatchMetrics:[{Namespace:'RadioStar/Operations',Dimensions:[['Environment']],Metrics:metrics}]},Environment:'production',...Object.fromEntries(metrics.map(({Name})=>[Name,values[Name]]))};
}
export function runtimeMetrics({heartbeat,backup,now=Date.now()}){
 const fresh=heartbeat && now-heartbeat.at>=0 && now-heartbeat.at<90000;
 return {WorkerReady:fresh&&heartbeat.workerRunning?1:0,EventLoopP99Ms:fresh?heartbeat.eventLoopP99Ms:undefined,BackupAgeSeconds:backup?.integrity==='ok'&&backup.uploaded&&Date.parse(backup.verifiedAt)<=now?(now-Date.parse(backup.verifiedAt))/1000:undefined};
}
// Aggregate persisted events without loading transcripts or listener identifiers.
// Capacity waits and unknown provider outcomes are visible dependencies, not stalls.
export function processingMetrics(db,now=Date.now()){
 const count=(sql,...args)=>db.prepare(sql).get(...args).n;
 const recent=new Date(now-300000).toISOString(),end=new Date(now).toISOString();
 return {
  CapacityWaitingJobs:count(`SELECT COUNT(*) AS n FROM records WHERE kind IN ('intelligence','skip-source') AND json_extract(payload,'$.code')='BUDGET_LIMIT' AND json_extract(payload,'$.state') IN ('BLOCKED','FAILED','BUDGET_PAUSED','WAITING_FOR_CAPACITY')`),
  StalledProcessingJobs:count(`SELECT COUNT(*) AS n FROM records WHERE kind='intelligence' AND json_extract(payload,'$.completedAt') IS NULL AND json_extract(payload,'$.state') IN ('QUEUED','DISCOVERING','TRANSCRIBING','UNDERSTANDING','ORGANISING','PROCESSING','PARTIAL_READY') AND (julianday(json_extract(payload,'$.deadlineAt')) < julianday(?) OR (json_extract(payload,'$.deadlineAt') IS NULL AND julianday(COALESCE(json_extract(payload,'$.updatedAt'),json_extract(payload,'$.startedAt'),json_extract(payload,'$.createdAt'))) < julianday(?) - 2.0/24))`,end,end),
  ProviderFailures5m:count(`SELECT COUNT(*) AS n FROM records WHERE kind='processing-event' AND json_extract(payload,'$.state') IN ('FAILED','BLOCKED') AND json_extract(payload,'$.code') IN ('PROVIDER_RATE_LIMIT','PROVIDER_UNAVAILABLE','PROVIDER_TIMEOUT','PROVIDER_OUTCOME_UNKNOWN') AND json_extract(payload,'$.at') BETWEEN ? AND ?`,recent,end),
  IncorrectSkipReports1h:count(`SELECT COUNT(*) AS n FROM records WHERE kind='skip-feedback' AND json_extract(payload,'$.kind')='skipped_conversation' AND json_extract(payload,'$.createdAt') BETWEEN ? AND ?`,new Date(now-3600000).toISOString(),end),
 };
}
export async function observe({directory='/var/lib/starcast',url='https://d3ri12f40b85i3.cloudfront.net/api/health',fetcher=fetch,now=Date.now()}={}){
 const json=async name=>{try{return JSON.parse(await readFile(`${directory}/${name}`,'utf8'));}catch{return null;}};
 const values={TelemetryHeartbeat:1,...runtimeMetrics({heartbeat:await json('runtime-health.json'),backup:await json('backup-verification.json'),now})};
 const start=performance.now();try{const response=await fetcher(url,{signal:AbortSignal.timeout(5000)});const payload=await response.json();values.ApiReady=response.ok&&payload.backend==='ready'?1:0;}catch{values.ApiReady=0;}values.ApiLatencyMs=performance.now()-start;
 try{const disk=await statfs(directory);values.DiskUsedPercent=(1-disk.bavail/disk.blocks)*100;values.FreeInodes=disk.ffree;}catch{/* Missing disk metric is alarmed, never fabricated as healthy. */}
 let db;try{db=new DatabaseSync(`${directory}/backend.sqlite`,{readOnly:true});db.exec('PRAGMA busy_timeout=2000');values.DatabaseIntegrity=Object.values(db.prepare('PRAGMA quick_check').get())[0]==='ok'?1:0;
 values.ProcessingFailures5m=db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='processing-event' AND json_extract(payload,'$.state')='FAILED' AND json_extract(payload,'$.at')>=?").get(new Date(now-300000).toISOString()).n;
 Object.assign(values,processingMetrics(db,now));
 }catch{values.DatabaseIntegrity=0;}finally{db?.close();}
 return metricEnvelope(values,now);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await observe()));
