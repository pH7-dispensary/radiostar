import {DatabaseSync} from 'node:sqlite';
import {readFile,statfs} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export const metricUnits={ApiReady:'Count',WorkerReady:'Count',DatabaseIntegrity:'Count',DiskUsedPercent:'Percent',FreeInodes:'Count',BackupAgeSeconds:'Seconds',EventLoopP99Ms:'Milliseconds',ProcessingFailures5m:'Count',TelemetryHeartbeat:'Count',ApiLatencyMs:'Milliseconds'};
export function metricEnvelope(values,now=Date.now()){
 const metrics=Object.entries(metricUnits).filter(([key])=>Number.isFinite(values[key])).map(([Name,Unit])=>({Name,Unit,StorageResolution:60}));
 return {_aws:{Timestamp:now,CloudWatchMetrics:[{Namespace:'RadioStar/Operations',Dimensions:[['Environment']],Metrics:metrics}]},Environment:'production',...Object.fromEntries(metrics.map(({Name})=>[Name,values[Name]]))};
}
export function runtimeMetrics({heartbeat,backup,now=Date.now()}){
 const fresh=heartbeat && now-heartbeat.at>=0 && now-heartbeat.at<90000;
 return {WorkerReady:fresh&&heartbeat.workerRunning?1:0,EventLoopP99Ms:fresh?heartbeat.eventLoopP99Ms:undefined,BackupAgeSeconds:backup?.integrity==='ok'&&backup.uploaded&&Date.parse(backup.verifiedAt)<=now?(now-Date.parse(backup.verifiedAt))/1000:undefined};
}
export async function observe({directory='/var/lib/starcast',url='https://d3ri12f40b85i3.cloudfront.net/api/health',fetcher=fetch,now=Date.now()}={}){
 const json=async name=>{try{return JSON.parse(await readFile(`${directory}/${name}`,'utf8'));}catch{return null;}};
 const values={TelemetryHeartbeat:1,...runtimeMetrics({heartbeat:await json('runtime-health.json'),backup:await json('backup-verification.json'),now})};
 const start=performance.now();try{const response=await fetcher(url,{signal:AbortSignal.timeout(5000)});const payload=await response.json();values.ApiReady=response.ok&&payload.backend==='ready'?1:0;}catch{values.ApiReady=0;}values.ApiLatencyMs=performance.now()-start;
 try{const disk=await statfs(directory);values.DiskUsedPercent=(1-disk.bavail/disk.blocks)*100;values.FreeInodes=disk.ffree;}catch{/* Missing disk metric is alarmed, never fabricated as healthy. */}
 let db;try{db=new DatabaseSync(`${directory}/backend.sqlite`,{readOnly:true});db.exec('PRAGMA busy_timeout=2000');values.DatabaseIntegrity=Object.values(db.prepare('PRAGMA quick_check').get())[0]==='ok'?1:0;
 values.ProcessingFailures5m=db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='processing-event' AND json_extract(payload,'$.state')='FAILED' AND json_extract(payload,'$.at')>=?").get(new Date(now-300000).toISOString()).n;
 }catch{values.DatabaseIntegrity=0;}finally{db?.close();}
 return metricEnvelope(values,now);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await observe()));
