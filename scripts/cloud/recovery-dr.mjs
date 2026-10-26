// Dedicated, disposable, role-less EC2 restore benchmark. No production queue,
// notifications, credentials or paid providers are present in the guest.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {verifyAwsIdentity} from '../aws-account-guard.mjs';
verifyAwsIdentity();
const aws=args=>JSON.parse(execFileSync('aws',[...args,'--profile','radiostar','--region','eu-west-2','--output','json','--no-cli-pager'],{encoding:'utf8',maxBuffer:8*1024*1024}));
const file=process.argv[3]||'.starcast/batch4-dr.json';if(!/^\.starcast\/batch4-dr(?:-attempt[1-9])?\.json$/.test(file))throw Error('Unexpected drill state path');
const bucket='starcast-phase1-208096650030-eu-west-2',action=process.argv[2],quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
if(action==='start'){
 if(existsSync(file)){const previous=JSON.parse(readFileSync(file));if(previous.instance&&!previous.cleanedAt)throw Error('Existing drill must be terminated and finalized before a new start');}
 const instance=aws(['ec2','describe-instances','--instance-ids','i-08537aa0e84163cb9']).Reservations[0].Instances[0];if(!instance.Tags.some(t=>t.Key==='Project'&&t.Value==='StarCast'))throw Error('Wrong instance');
 const key=JSON.parse(readFileSync('/tmp/starcast-batch4-retrieval.json')).key;
 const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(p=>(/^[^/]+\.(mjs|js|html|css)$/.test(p)&&!p.startsWith('test-'))||['package.json','package-lock.json'].includes(p));
 tracked.push('scripts/verify-recovery-batch4-restore.mjs','fixtures/ad-skip-owned-v1.json','fixtures/ad-skip-owned-v1.mp3');
 execFileSync('tar',['--no-xattrs','-czf','.starcast/batch4-dr.tar.gz','--null','-T','-'],{input:tracked.join('\0')+'\0',env:{...process.env,COPYFILE_DISABLE:'1'}});
 const archiveKey=`recovery-dr/batch4-${Date.now()}.tar.gz`;execFileSync('aws',['s3','cp','.starcast/batch4-dr.tar.gz',`s3://${bucket}/${archiveKey}`,'--profile','radiostar','--region','eu-west-2','--only-show-errors'],{stdio:'pipe'});
 const signed=k=>execFileSync('aws',['s3','presign',`s3://${bucket}/${k}`,'--expires-in','1800','--profile','radiostar','--region','eu-west-2'],{encoding:'utf8'}).trim();
 const sourceUrl=signed(key),archiveUrl=signed(archiveKey);
 const group=aws(['ec2','create-security-group','--group-name',`starcast-dr-${Date.now()}`,'--description','Disposable Radio Star recovery drill: no ingress','--vpc-id',instance.VpcId,'--tag-specifications',JSON.stringify([{ResourceType:'security-group',Tags:[{Key:'Project',Value:'StarCast'},{Key:'Purpose',Value:'RecoveryBatch4'}]}])]).GroupId;
 const state={createdAt:new Date().toISOString(),group,archiveKey,sourceKey:key,instance:null};writeFileSync(file,JSON.stringify(state),{mode:0o600});
 aws(['ec2','revoke-security-group-egress','--group-id',group,'--ip-permissions',JSON.stringify([{IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}]}])]);
 aws(['ec2','authorize-security-group-egress','--group-id',group,'--ip-permissions',JSON.stringify([{IpProtocol:'tcp',FromPort:443,ToPort:443,IpRanges:[{CidrIp:'0.0.0.0/0',Description:'Temporary package and signed backup download'}]}])]);
 const userData=`#!/bin/bash
set -eu
umask 077
trap 'code=$?; if test $code -ne 0; then for log in /opt/starcast-dr/run.log /opt/starcast-dr/install.log; do if test -f $log; then tail -n 18 $log >/dev/console; fi; done; fi; echo STARCAST_DR_EXIT_$code >/dev/console' EXIT
dnf install -y tar xz gzip >/dev/null 2>&1
mkdir -p /opt/starcast-dr
cd /opt/starcast-dr
curl -fsSL https://nodejs.org/dist/v24.22.0/node-v24.22.0-linux-x64.tar.xz -o node.tar.xz
tar -xf node.tar.xz
export PATH=/opt/starcast-dr/node-v24.22.0-linux-x64/bin:/usr/bin:/bin
export AWS_EC2_METADATA_DISABLED=true
curl -fsSL ${quote(archiveUrl)} -o source.tar.gz
tar -xzf source.tar.gz
npm ci --omit=dev --ignore-scripts --no-audit --no-fund >install.log 2>&1
start=$(date +%s%3N)
curl -fsSL ${quote(sourceUrl)} -o backup.sqlite
end=$(date +%s%3N)
echo STARCAST_DR_RETRIEVAL_MS_$((end-start)) >/dev/console
timeout 480 node scripts/verify-recovery-batch4-restore.mjs backup.sqlite /opt/starcast-dr /opt/starcast-dr/result.json >run.log 2>&1
node -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync("result.json"));fs.writeFileSync("/dev/console","STARCAST_DR_RESULT="+JSON.stringify(data)+"\\n");'
`;
 const request={ImageId:instance.ImageId,InstanceType:'t3.small',MinCount:1,MaxCount:1,CreditSpecification:{CpuCredits:'standard'},InstanceInitiatedShutdownBehavior:'terminate',MetadataOptions:{HttpEndpoint:'enabled',HttpTokens:'required',HttpPutResponseHopLimit:1},NetworkInterfaces:[{DeviceIndex:0,SubnetId:instance.SubnetId,Groups:[group],AssociatePublicIpAddress:true,DeleteOnTermination:true}],BlockDeviceMappings:[{DeviceName:instance.RootDeviceName,Ebs:{VolumeSize:8,VolumeType:'gp3',Encrypted:true,DeleteOnTermination:true}}],UserData:Buffer.from(userData).toString('base64'),TagSpecifications:[{ResourceType:'instance',Tags:[{Key:'Project',Value:'StarCast'},{Key:'Name',Value:'starcast-batch4-disposable-dr'},{Key:'Purpose',Value:'RecoveryBatch4'},{Key:'CostCenter',Value:'RadioStar'}]},{ResourceType:'volume',Tags:[{Key:'Project',Value:'StarCast'},{Key:'Purpose',Value:'RecoveryBatch4'}]}]};
 // Never log user-data: it contains narrowly scoped short-lived signed URLs.
 const launched=aws(['ec2','run-instances','--cli-input-json',JSON.stringify(request)]).Instances[0];state.instance=launched.InstanceId;state.volume=launched.BlockDeviceMappings?.[0]?.Ebs?.VolumeId;writeFileSync(file,JSON.stringify(state),{mode:0o600});console.log({instance:state.instance,group,instanceType:'t3.small',ingressRules:0,iamProfile:null,metadata:'IMDSv2 required; no instance role',cpuCredits:'standard'});
}else{
 const state=JSON.parse(readFileSync(file));
 if(action==='poll'){
  const instance=aws(['ec2','describe-instances','--instance-ids',state.instance]).Reservations[0].Instances[0];if(!instance.Tags.some(t=>t.Key==='Purpose'&&t.Value==='RecoveryBatch4'))throw Error('Wrong drill instance');
  const raw=aws(['ec2','get-console-output','--instance-id',state.instance,'--latest']).Output||'',text=(/[\r\n]|STARCAST|Linux|cloud-init/.test(raw)?raw:Buffer.from(raw,'base64').toString()).replace(/\[\d{4}-\d{2}-\d{2}T[\d:.]+\]/g,'');
  const result=text.match(/STARCAST_DR_RESULT=(\{[^\r\n]+\})/);if(result){writeFileSync('.starcast/batch4-dr-result.json',JSON.stringify(JSON.parse(result[1]),null,2),{mode:0o600});const retrievalMs=Number(text.match(/STARCAST_DR_RETRIEVAL_MS_(\d+)/)?.[1]);state.retrievalMs=retrievalMs;state.completedAt=new Date().toISOString();state.volume=instance.BlockDeviceMappings?.[0]?.Ebs?.VolumeId;writeFileSync(file,JSON.stringify(state),{mode:0o600});console.log({state:instance.State.Name,resultSaved:true,retrievalMs});}else console.log({state:instance.State.Name,resultSaved:false,exit:text.match(/STARCAST_DR_EXIT_(\d+)/)?.[1]||null,consoleTail:text.slice(-700).replace(/https:\/\/\S+/g,'[URL]')});
 }else if(action==='cleanup'){
  if(state.instance){const i=aws(['ec2','describe-instances','--instance-ids',state.instance]).Reservations[0].Instances[0];if(!i.Tags.some(t=>t.Key==='Purpose'&&t.Value==='RecoveryBatch4'))throw Error('Wrong resource');state.volume=i.BlockDeviceMappings?.[0]?.Ebs?.VolumeId||state.volume;writeFileSync(file,JSON.stringify(state),{mode:0o600});aws(['ec2','terminate-instances','--instance-ids',state.instance]);}
  console.log({terminationRequested:state.instance,group:state.group,archiveKey:state.archiveKey,next:'After termination, delete the disposable security group and archive; verify the encrypted temporary root volume was deleted.'});
 }else if(action==='finalize'){
  const i=aws(['ec2','describe-instances','--instance-ids',state.instance]).Reservations[0].Instances[0];
  if(i.State.Name!=='terminated'||!i.Tags.some(t=>t.Key==='Purpose'&&t.Value==='RecoveryBatch4'))throw Error('Drill termination not verified');
  const groups=aws(['ec2','describe-security-groups','--filters',`Name=group-id,Values=${state.group}`]).SecurityGroups;
  if(groups.length){if(!groups[0].Tags.some(t=>t.Key==='Purpose'&&t.Value==='RecoveryBatch4'))throw Error('Wrong security group');aws(['ec2','delete-security-group','--group-id',state.group]);}
  if(!/^recovery-dr\/batch4-\d+\.tar\.gz$/.test(state.archiveKey))throw Error('Unexpected archive key');
  const versions=aws(['s3api','list-object-versions','--bucket',bucket,'--prefix',state.archiveKey]);
  for(const entry of [...(versions.Versions||[]),...(versions.DeleteMarkers||[])].filter(v=>v.Key===state.archiveKey))aws(['s3api','delete-object','--bucket',bucket,'--key',entry.Key,'--version-id',entry.VersionId]);
  if(state.volume&&aws(['ec2','describe-volumes','--filters',`Name=volume-id,Values=${state.volume}`]).Volumes.length)throw Error('Temporary volume still exists; inspect before removing');
  state.cleanedAt=new Date().toISOString();writeFileSync(file,JSON.stringify(state),{mode:0o600});console.log({terminated:state.instance,removedGroup:state.group,removedArchive:state.archiveKey,temporaryVolumeAbsent:true});
 }else throw Error('Use start, poll, cleanup or finalize');
}
