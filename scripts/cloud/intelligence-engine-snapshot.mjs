// Read-only, account-guarded Phase 2 production evidence. No provider calls.
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {verifyAwsIdentity} from '../aws-account-guard.mjs';
verifyAwsIdentity();
const aws=args=>JSON.parse(execFileSync('aws',[...args,'--profile','radiostar','--region','eu-west-2','--output','json','--no-cli-pager'],{encoding:'utf8',timeout:30000}));
const output=JSON.parse(execFileSync('.starcast/tools/terraform',['-chdir=infra/aws','output','-json'],{encoding:'utf8'}));
const instance=output.instance_id.value;
if(!aws(['ec2','describe-instances','--instance-ids',instance]).Reservations[0].Instances[0].Tags.some(t=>t.Key==='Project'&&t.Value==='StarCast'))throw Error('Wrong instance');
const source=`
import {DatabaseSync} from 'node:sqlite';
import {gzipSync} from 'node:zlib';
import {readFileSync,writeFileSync,statfsSync} from 'node:fs';
import {observe} from './operations-monitor.mjs';
import {planAudioSegments} from './transcription.mjs';
import {validSearchIndex} from './intelligence-delivery.mjs';
import {validSemanticIndex} from './semantic-search.mjs';
import {createHash,randomUUID} from 'node:crypto';
const db=new DatabaseSync('/var/lib/starcast/backend.sqlite',{readOnly:true});
const records=kind=>db.prepare('SELECT id,payload FROM records WHERE kind=?').all(kind).map(row=>({key:row.id,...JSON.parse(row.payload)}));
const disk=statfsSync('/var/lib/starcast'),jobs=records('intelligence'),budget=records('budget').find(x=>x.key==='ledger');
const counts=rows=>rows.reduce((a,r)=>{const k=r.state||'NONE';a[k]=(a[k]||0)+1;return a;},{});
const costs={};for(const u of budget?.usage||[]){const k=u.kind||'text';const r=costs[k]||={usd:0,seconds:0,requests:0,failed:0};r.usd+=u.usd;r.seconds+=u.seconds||0;r.requests++;r.failed+=u.failed?1:0;}
const result={at:new Date().toISOString(),account:'208096650030',region:'eu-west-2',release:JSON.parse(readFileSync('/var/lib/starcast/release.json','utf8')),integrity:Object.values(db.prepare('PRAGMA integrity_check').get())[0],freeBytes:disk.bavail*disk.bsize,monitor:await observe(),
followed:records('followed-preparation').find(x=>x.key==='snapshot'),demand:counts(records('followed-demand')),jobCounts:counts(jobs),checkpointCounts:counts(records('transcription-checkpoint')),semanticCounts:counts(records('semantic-index')),costs,reservations:budget?.reservations?.length||0,
licensed:records('rights').filter(r=>r.classification==='LICENSED').map(({feedUrl,episodeId,canTranscribeAudio,canProcessForAi,legalBasis,assessmentEvidence})=>({feedUrl,episodeId,canTranscribeAudio,canProcessForAi,legalBasis,assessmentEvidence})).slice(0,20),
jobs:jobs.filter(j=>j.transcript?.segments?.length).map(j=>({key:j.key,feedUrl:j.feedUrl,episodeId:j.episodeId,title:j.episode?.title,duration:j.episode?.duration,state:j.state,completedAt:j.completedAt,processingMs:j.processingMs,source:j.transcript.sourceType,audioUrl:j.episode?.audioUrl,hash:j.transcript.audioContentHash,segments:j.transcript.segments.length,chapters:j.chapters?.length,topics:j.topics?.length,features:j.featureStatus})).slice(0,30)};
const targets=new Set(['d61ca0a3-f8d4-42b2-b79a-15ba7675deba','8162a061-1fdc-4376-9525-9b8bb5006306','898601cb-9cb8-4a35-b9dd-ae52b91193ec','70592bd7-8013-4eff-a9c5-dcc570b9b216','https://hub.hackerpublicradio.org/ccdn.php?filename=/eps/hpr2578/hpr2578.mp3']);
result.quality=jobs.filter(j=>targets.has(j.episodeId)).map(j=>{
 const hash=j.transcript?.audioContentHash||j.work?.sourceContentHash,durationMs=j.work?.verifiedSourceDurationMs||j.work?.sourceDurationMs;
 const chunks=records('transcription-checkpoint').filter(c=>c.key.startsWith(j.key+':'+hash+':'));
 const plan=durationMs?planAudioSegments({durationMs}):[],segments=j.transcript?.segments||[],ids=new Set(segments.map(s=>s.id));
 const search=records('search-index').find(s=>s.key===j.key),semantic=records('semantic-index').find(s=>s.key===j.key);
 const invalid=segments.filter((s,i)=>!Number.isFinite(s.startMs)||!Number.isFinite(s.endMs)||s.startMs<0||s.endMs<=s.startMs||s.endMs>durationMs+1000||(i&&s.startMs<segments[i-1].startMs)).length;
 const normalized=s=>s.text.toLowerCase().replace(/[^a-z0-9]/g,'');
 const duplicates=segments.filter((s,i)=>i&&s.startMs<segments[i-1].endMs&&normalized(s)===normalized(segments[i-1])).length;
 const repeatedUtterances=segments.filter((s,i)=>i&&s.startMs===segments[i-1].endMs&&normalized(s)===normalized(segments[i-1])).length;
 const compactSource=({sourceSegmentIds=[],...row})=>({...row,sourceSegmentCount:sourceSegmentIds.length,sourceSegmentIdsSample:[...new Set([...sourceSegmentIds.slice(0,3),...sourceSegmentIds.slice(-3)])],sourceIdsSha256:createHash('sha256').update(JSON.stringify(sourceSegmentIds)).digest('hex')});
 return{episodeId:j.episodeId,title:j.episode?.title,jobId:j.jobId,state:j.state,code:j.code,attempts:j.attempts,recoveries:j.recoveries,softwareRecovery:j.softwareRecovery,sourceHash:hash,durationMs,work:j.work,resumeAfter:j.resumeAfter,capacityWait:j.capacityWait,processingMs:j.processingMs,
 expectedChunks:plan.length,checkpointCount:chunks.length,completedChunks:chunks.filter(c=>c.state==='READY').length,
 chunks:chunks.map(c=>({index:Number(c.key.split(':').at(-1)),state:c.state,responseSha256:createHash('sha256').update(JSON.stringify(c.response||null)).digest('hex'),segments:c.response?.segments?.length||0})),
 missingChunkIndexes:plan.filter(p=>!chunks.some(c=>Number(c.key.split(':').at(-1))===p.index&&c.state==='READY')).map(p=>p.index),
 transcriptSegments:segments.length,timingErrors:invalid,adjacentOverlapDuplicates:duplicates,adjacentRepeatedUtterances:repeatedUtterances,
 samples:[...new Set([0,Math.floor(segments.length/2),segments.length-1])].filter(i=>segments[i]).map(i=>({id:segments[i].id,startMs:segments[i].startMs,endMs:segments[i].endMs,textSha256:createHash('sha256').update(segments[i].text).digest('hex')})),
 brief:j.brief?compactSource(j.brief):null,chapters:j.chapters?.map(compactSource),topics:j.topics?.map(compactSource),featureExecution:j.featureExecution,semantic:semantic?.state,
 searchChecksumValid:j.transcript?validSearchIndex(search,j.transcript,j):false,semanticChecksumValid:search?validSemanticIndex(semantic,search):false,
 brokenChapterSources:(j.chapters||[]).flatMap(c=>c.sourceSegmentIds||[]).filter(id=>!ids.has(id)).length,
 independentHumanAudioAnnotation:false,wordErrorRate:null,
 usage:(budget?.usage||[]).filter(u=>u.jobId===j.jobId).reduce((out,u)=>{const kind=u.kind||'text',row=out[kind]||={requests:0,usd:0,seconds:0,failed:0,uncertain:0};row.requests++;row.usd+=u.usd;row.seconds+=u.seconds||0;row.failed+=u.failed?1:0;row.uncertain+=u.uncertain?1:0;return out;},{}),
 latestLedgerEntries:(budget?.usage||[]).filter(u=>u.jobId===j.jobId).slice(-3).map(({id,kind,usd,seconds,failed,uncertain,at})=>({id,kind,usd,seconds,failed,uncertain,at}))};
});
db.close();const encoded=gzipSync(JSON.stringify(result)).toString('base64');
if(encoded.length<20000)console.log(encoded);
else{const file='/tmp/starcast-evidence-'+randomUUID()+'.txt';writeFileSync(file,encoded,{mode:0o600});console.log(JSON.stringify({file,length:encoded.length,sha256:createHash('sha256').update(encoded).digest('hex')}));}`;
if(process.argv[2]==='poll'){
 const r=aws(['ssm','get-command-invocation','--command-id',process.argv[3],'--instance-id',instance]);
 if(r.Status!=='Success'){console.log({status:r.Status,error:r.StandardErrorContent});process.exitCode=['Failed','TimedOut','Cancelled'].includes(r.Status)?1:0;}
 else{let encoded=r.StandardOutputContent.trim();
 if(encoded.startsWith('{')){
  const manifest=JSON.parse(encoded);if(!/^\/tmp\/starcast-evidence-[a-f0-9-]{36}\.txt$/.test(manifest.file)||manifest.length>2e6)throw Error('Invalid evidence manifest');
  const remote=async command=>{const sent=aws(['ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--parameters',JSON.stringify({commands:[command],executionTimeout:['30']})]);for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,500));let part;try{part=aws(['ssm','get-command-invocation','--command-id',sent.Command.CommandId,'--instance-id',instance]);}catch{continue;}if(part.Status==='Success')return part.StandardOutputContent.trim();if(['Failed','Cancelled','TimedOut'].includes(part.Status))throw Error('Evidence transfer failed');}throw Error('Evidence transfer timed out');};
  const q=s=>"'"+s.replaceAll("'","'\\''")+"'";encoded='';
  for(let offset=0;offset<manifest.length;offset+=20000)encoded+=await remote('/usr/local/bin/node -e '+q(`process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(manifest.file)},'utf8').slice(${offset},${offset+20000}))`));
  const {createHash}=await import('node:crypto');if(createHash('sha256').update(encoded).digest('hex')!==manifest.sha256)throw Error('Evidence checksum mismatch');
  await remote('/usr/local/bin/node -e '+q(`require('node:fs').unlinkSync(${JSON.stringify(manifest.file)})`));
 }
 const v=JSON.parse(gunzipSync(Buffer.from(encoded,'base64')).toString()),url=output.processing_queue_url.value;if(!url.startsWith('https://sqs.eu-west-2.amazonaws.com/208096650030/'))throw Error('Wrong queue');v.queues={};for(const [name,u] of [['main',url],['dlq',url+'-dlq']])v.queues[name]=aws(['sqs','get-queue-attributes','--queue-url',u,'--attribute-names','ApproximateNumberOfMessages','ApproximateNumberOfMessagesNotVisible','ApproximateNumberOfMessagesDelayed']).Attributes;const path=process.argv[4]||'evals/intelligence-engine-baseline.json';writeFileSync(path,JSON.stringify(v,null,2)+'\n');console.log({path,release:v.release,integrity:v.integrity,freeBytes:v.freeBytes,counts:v.jobCounts,checkpoints:v.checkpointCounts,costs:v.costs,queues:v.queues,quality:v.quality?.map(({title,state,code,completedChunks,expectedChunks,transcriptSegments})=>({title,state,code,completedChunks,expectedChunks,transcriptSegments}))});}
}else{
 const q=s=>"'"+s.replaceAll("'","'\\''")+"'";
 const r=aws(['ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--parameters',JSON.stringify({commands:['set -eu','cd /opt/starcast/app','/usr/local/bin/node --input-type=module -e '+q(source)],executionTimeout:['60']})]);console.log({commandId:r.Command.CommandId});
}
