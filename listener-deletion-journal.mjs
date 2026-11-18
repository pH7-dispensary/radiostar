import {S3Client,GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import {ListenerService} from './listener-service.mjs';

const KEY='recovery/listener-deletions.json', MAX_BYTES=16*1024*1024;
function validate(value) {
  if(value?.version!==1 || !Array.isArray(value.entries) || value.entries.some(e=>
    !/^[a-f0-9]{64}$/.test(e?.credentialHash || '') || !Number.isFinite(e.deletedAt) || e.deletedAt<0))
    throw Error('Invalid listener deletion recovery record');
  return value;
}
// Minimal hashed revocations, independent of restorable database snapshots.
// No listening history, names, credential secrets or transcript content.
export class ListenerDeletionJournal {
  constructor({bucket,client=new S3Client({region:'eu-west-2',maxAttempts:2})}={}) {
    if(bucket!=='starcast-phase1-208096650030-eu-west-2')throw Error('Unexpected recovery bucket');
    this.bucket=bucket;this.client=client;
  }
  async read() {
    const response=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:KEY}),{abortSignal:AbortSignal.timeout(15000)});
    if(!response.ETag || response.ContentLength>MAX_BYTES){response.Body?.destroy?.();throw Error('Deletion recovery record exceeds limits');}
    const raw=await response.Body.transformToString();
    if(Buffer.byteLength(raw)>MAX_BYTES)throw Error('Deletion recovery record exceeds limits');
    return {value:validate(JSON.parse(raw)),etag:response.ETag};
  }
  async record(entries) {
    validate({version:1,entries});
    for(let attempt=0;attempt<5;attempt++) {
      const {value,etag}=await this.read(),known=new Set(value.entries.map(e=>e.credentialHash));
      const pending=entries.filter(e=>!known.has(e.credentialHash));
      if(!pending.length)return value;
      const next={version:1,entries:[...value.entries,...pending]},body=JSON.stringify(next);
      if(Buffer.byteLength(body)>MAX_BYTES)throw Error('Deletion recovery record exceeds limits');
      try {
        await this.client.send(new PutObjectCommand({Bucket:this.bucket,Key:KEY,Body:body,ContentType:'application/json',ServerSideEncryption:'AES256',IfMatch:etag}),{abortSignal:AbortSignal.timeout(15000)});
        return next;
      } catch(error) {if(![409,412].includes(error?.$metadata?.httpStatusCode))throw error;}
    }
    throw Error('Concurrent deletion recovery update must be retried');
  }
  async reconcile(store) {
    // Capture older revocations too, before any restored profile can register.
    const prior=store.all('revoked-installation').map(([credentialHash,row])=>({credentialHash,deletedAt:row.revokedAt}));
    const value=prior.length?await this.record(prior):(await this.read()).value;
    const listeners=new ListenerService(store);
    store.transaction(()=>{
      for(const entry of value.entries) {
        const listener=store.get('installation',entry.credentialHash);
        if(listener)listeners.deleteProfile(listener);
        store.set('revoked-installation',entry.credentialHash,{revokedAt:entry.deletedAt});
      }
    });
    return {reconciled:value.entries.length};
  }
}
