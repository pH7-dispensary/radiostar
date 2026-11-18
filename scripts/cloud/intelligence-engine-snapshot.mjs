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
import {readFileSync,statfsSync} from 'node:fs';
import {observe} from './operations-monitor.mjs';
const db=new DatabaseSync('/var/lib/starcast/backend.sqlite',{readOnly:true});
const records=kind=>db.prepare('SELECT id,payload FROM records WHERE kind=?').all(kind).map(row=>({key:row.id,...JSON.parse(row.payload)}));
const disk=statfsSync('/var/lib/starcast'),jobs=records('intelligence'),budget=records('budget').find(x=>x.key==='ledger');
const counts=rows=>rows.reduce((a,r)=>{const k=r.state||'NONE';a[k]=(a[k]||0)+1;return a;},{});
const costs={};for(const u of budget?.usage||[]){const k=u.kind||'text';const r=costs[k]||={usd:0,seconds:0,requests:0,failed:0};r.usd+=u.usd;r.seconds+=u.seconds||0;r.requests++;r.failed+=u.failed?1:0;}
const result={at:new Date().toISOString(),account:'208096650030',region:'eu-west-2',release:JSON.parse(readFileSync('/var/lib/starcast/release.json','utf8')),integrity:Object.values(db.prepare('PRAGMA integrity_check').get())[0],freeBytes:disk.bavail*disk.bsize,monitor:await observe(),
followed:records('followed-preparation').find(x=>x.key==='snapshot'),demand:counts(records('followed-demand')),jobCounts:counts(jobs),checkpointCounts:counts(records('transcription-checkpoint')),semanticCounts:counts(records('semantic-index')),costs,reservations:budget?.reservations?.length||0,
licensed:records('rights').filter(r=>r.classification==='LICENSED').map(({feedUrl,episodeId,canTranscribeAudio,canProcessForAi,legalBasis,assessmentEvidence})=>({feedUrl,episodeId,canTranscribeAudio,canProcessForAi,legalBasis,assessmentEvidence})).slice(0,20),
jobs:jobs.filter(j=>j.transcript?.segments?.length).map(j=>({key:j.key,feedUrl:j.feedUrl,episodeId:j.episodeId,title:j.episode?.title,duration:j.episode?.duration,state:j.state,completedAt:j.completedAt,processingMs:j.processingMs,source:j.transcript.sourceType,audioUrl:j.episode?.audioUrl,hash:j.transcript.audioContentHash,segments:j.transcript.segments.length,chapters:j.chapters?.length,topics:j.topics?.length,features:j.featureStatus})).slice(0,30)};
db.close();console.log(gzipSync(JSON.stringify(result)).toString('base64'));`;
if(process.argv[2]==='poll'){
 const r=aws(['ssm','get-command-invocation','--command-id',process.argv[3],'--instance-id',instance]);
 if(r.Status!=='Success'){console.log({status:r.Status,error:r.StandardErrorContent});process.exitCode=['Failed','TimedOut','Cancelled'].includes(r.Status)?1:0;}
 else{const v=JSON.parse(gunzipSync(Buffer.from(r.StandardOutputContent.trim(),'base64')).toString()),url=output.processing_queue_url.value;if(!url.startsWith('https://sqs.eu-west-2.amazonaws.com/208096650030/'))throw Error('Wrong queue');v.queues={};for(const [name,u] of [['main',url],['dlq',url+'-dlq']])v.queues[name]=aws(['sqs','get-queue-attributes','--queue-url',u,'--attribute-names','ApproximateNumberOfMessages','ApproximateNumberOfMessagesNotVisible','ApproximateNumberOfMessagesDelayed']).Attributes;const path=process.argv[4]||'evals/intelligence-engine-baseline.json';writeFileSync(path,JSON.stringify(v,null,2)+'\n');console.log({path,release:v.release,integrity:v.integrity,freeBytes:v.freeBytes,followed:v.followed,counts:v.jobCounts,checkpoints:v.checkpointCounts,licensed:v.licensed,jobs:v.jobs,costs:v.costs,queues:v.queues});}
}else{
 const q=s=>"'"+s.replaceAll("'","'\\''")+"'";
 const r=aws(['ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--parameters',JSON.stringify({commands:['set -eu','cd /opt/starcast/app','/usr/local/bin/node --input-type=module -e '+q(source)],executionTimeout:['60']})]);console.log({commandId:r.Command.CommandId});
}
