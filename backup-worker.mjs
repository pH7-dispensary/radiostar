import {backup,DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,writeFile,rename,unlink,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
export async function atomicJson(path,value){const temp=path+'.tmp';await writeFile(temp,JSON.stringify(value)+'\n',{mode:0o600});await rename(temp,path);}
async function checksum(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('base64');}
export class BackupWorker {
 constructor({database,directory,bucket,client=new S3Client({region:'eu-west-2',maxAttempts:1}),attemptMs=60000,maxAttempts=3,backoff=delay,now=Date.now}={}){Object.assign(this,{database,directory,bucket,client,attemptMs,maxAttempts,backoff,now});this.active=null;}
 run(){if(this.active)return this.active;this.active=this.perform().finally(()=>{this.active=null;});return this.active;}
 async perform(){
  const startedAt=new Date(this.now()).toISOString(),work=join(this.directory,'backup-work'),name=`backend-${startedAt.replaceAll(':','-')}.sqlite`,path=join(work,name),statePath=join(this.directory,'backup-state.json');
  await mkdir(work,{recursive:true,mode:0o700});
  // Only this worker's private staging names are eligible. Production data,
  // diagnostic snapshots and previous verified backups are never swept.
  for(const entry of await readdir(work))if(/^backend-[\dTZ.-]+\.sqlite(?:-(?:wal|shm))?$/.test(entry)){const candidate=join(work,entry);if(this.now()-(await stat(candidate)).mtimeMs>3600000)await unlink(candidate);}
  await atomicJson(statePath,{state:'SNAPSHOTTING',startedAt});let source;
  try {
   source=new DatabaseSync(this.database,{readOnly:true});source.exec('PRAGMA busy_timeout=5000');await backup(source,path);source.close();source=null;
   const copy=new DatabaseSync(path);let integrity;try{copy.exec('PRAGMA journal_mode=DELETE');integrity=Object.values(copy.prepare('PRAGMA integrity_check').get())[0];}finally{copy.close();}
   if(integrity!=='ok')throw Error('BACKUP_INTEGRITY_FAILED');
   const digest=await checksum(path),size=(await stat(path)).size;let last;
   for(let attempt=1;attempt<=this.maxAttempts;attempt++){
    await atomicJson(statePath,{state:'UPLOADING',startedAt,attempt});
    try {
     const signal=AbortSignal.timeout(this.attemptMs);
     const put=async key=>{const body=createReadStream(path);try{return await this.client.send(new PutObjectCommand({Bucket:this.bucket,Key:key,Body:body,ContentLength:size,ChecksumSHA256:digest,ServerSideEncryption:'AES256',Metadata:{sha256:digest,'snapshot-at':startedAt}}),{abortSignal:signal});}finally{body.destroy();}};
     const historical=await put(`backups/${name}`);if(historical.ChecksumSHA256!==digest)throw Error('BACKUP_CHECKSUM_MISMATCH');
     // Versioned, non-expiring current object: a prolonged outage must not
     // allow lifecycle expiry to remove the last known good recovery point.
     const pinned=await put('recovery/latest.sqlite');if(pinned.ChecksumSHA256!==digest)throw Error('BACKUP_CHECKSUM_MISMATCH');
     const result={state:'VERIFIED',integrity,startedAt,verifiedAt:new Date(this.now()).toISOString(),uploaded:true,object:name,recoveryKey:'recovery/latest.sqlite',versionId:pinned.VersionId,sha256:digest,bytes:size,attempt};
     await atomicJson(join(this.directory,'backup-verification.json'),result);await atomicJson(statePath,result);console.log(JSON.stringify({event:'backup-complete',bytes:size,attempt}));return result;
    }catch(error){last=error;if(attempt<this.maxAttempts)await this.backoff(1000*2**(attempt-1));}
   }
   throw last;
  }catch(error){await atomicJson(statePath,{state:'FAILED',startedAt,failedAt:new Date(this.now()).toISOString(),code:String(error?.name||'BACKUP_FAILED').slice(0,80)});console.error(JSON.stringify({event:'backup-failed',code:error?.name||'BACKUP_FAILED'}));throw error;}
  finally{source?.close();for(const suffix of ['', '-wal','-shm'])await unlink(path+suffix).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const worker=new BackupWorker({database:'/var/lib/starcast/backend.sqlite',directory:'/var/lib/starcast',bucket:'starcast-phase1-208096650030-eu-west-2'});
 await worker.run();
}
