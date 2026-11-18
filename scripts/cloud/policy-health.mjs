import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {verifyAwsIdentity} from '../aws-account-guard.mjs';
verifyAwsIdentity();
const aws=args=>JSON.parse(execFileSync('aws',[...args,'--profile','radiostar','--region','eu-west-2','--output','json','--no-cli-pager'],{encoding:'utf8',timeout:30000}));
const output=JSON.parse(execFileSync('.starcast/tools/terraform',['-chdir=infra/aws','output','-json'],{encoding:'utf8'}));
const instance=output.instance_id.value;
if(!aws(['ec2','describe-instances','--instance-ids',instance]).Reservations[0].Instances[0].Tags.some(t=>t.Key==='Project'&&t.Value==='StarCast'))throw Error('Ownership verification failed');
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const source=`
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,statfsSync} from 'node:fs';
import {observe} from './operations-monitor.mjs';
const db=new DatabaseSync('/var/lib/starcast/backend.sqlite',{readOnly:true});
const disk=statfsSync('/var/lib/starcast');
const records=kind=>db.prepare('SELECT payload FROM records WHERE kind=?').all(kind).map(row=>JSON.parse(row.payload));
const installations=records('installation'),devices=records('pilot-device');
const value={at:new Date().toISOString(),integrity:Object.values(db.prepare('PRAGMA integrity_check').get())[0],freeBytes:disk.bavail*disk.bsize,
 release:JSON.parse(readFileSync('/var/lib/starcast/release.json','utf8')),monitor:await observe(),
 followedDemand:records('followed-demand').filter(row=>row.inWindow).reduce((counts,row)=>{const key=row.state||'NOT_REQUESTED';counts[key]=(counts[key]||0)+1;return counts;},{}),
 installations:installations.length,unrevokedInstallations:installations.filter(row=>!row.revokedAt).length,
 activePilotDevices:devices.filter(row=>!row.revokedAt&&Date.parse(row.expiresAt)>Date.now()).length,
 expiredUnrevokedPilotDevices:devices.filter(row=>!row.revokedAt&&Date.parse(row.expiresAt)<=Date.now()).length,
 decisionRequests:records('rights-decision-request').map(({id,feedUrl,status,activities,episodeIds})=>({id,feedUrl,status,activities,episodeCount:episodeIds.length})),
 ownedCacheHistory:[...records('intelligence-history'),...records('intelligence')].filter(row=>row.episodeId==='starcast-approved-test-episode-v1').map(row=>({jobId:row.jobId,state:row.state,completedAt:row.completedAt,transcriptVersion:row.transcript?.transcriptVersion || row.provenance?.transcriptVersion,audioVariant:row.transcript?.audioVariant || row.provenance?.audioVariant,parserVersion:row.transcript?.parserVersion || row.provenance?.parserVersion,sourceSignature:row.sourceSignature,sourceCheckedAt:row.sourceCheckedAt})).sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt))).slice(0,5)};
db.close();console.log(JSON.stringify(value));`;
if(process.argv[2]==='poll'){
  const result=aws(['ssm','get-command-invocation','--command-id',process.argv[3],'--instance-id',instance]);
  if(result.Status!=='Success'){console.log({status:result.Status});if(['Failed','TimedOut','Cancelled'].includes(result.Status))throw Error('Health verification failed');}
  else{
    const health=JSON.parse(result.StandardOutputContent);
    const queueUrl=output.processing_queue_url.value;
    if(!queueUrl.startsWith('https://sqs.eu-west-2.amazonaws.com/208096650030/'))throw Error('Unexpected processing queue');
    const main=aws(['sqs','get-queue-attributes','--queue-url',queueUrl,'--attribute-names','ApproximateNumberOfMessages','ApproximateNumberOfMessagesNotVisible','ApproximateNumberOfMessagesDelayed','RedrivePolicy']).Attributes;
    const arn=JSON.parse(main.RedrivePolicy).deadLetterTargetArn;
    if(!arn.startsWith('arn:aws:sqs:eu-west-2:208096650030:'))throw Error('Unexpected dead-letter queue');
    const dlq=aws(['sqs','get-queue-attributes','--queue-url','https://sqs.eu-west-2.amazonaws.com/208096650030/'+arn.split(':').at(-1),'--attribute-names','ApproximateNumberOfMessages','ApproximateNumberOfMessagesNotVisible']).Attributes;
    health.queues={at:new Date().toISOString(),main,dlq};
    writeFileSync('evals/policy-surgery-health.json',JSON.stringify(health,null,2)+'\n');console.log(health);
  }
}else{
  const result=aws(['ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--parameters',JSON.stringify({commands:['set -eu','cd /opt/starcast/app','/usr/local/bin/node --input-type=module -e '+quote(source)],executionTimeout:['60']})]);
  console.log({commandId:result.Command.CommandId});
}
