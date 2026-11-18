import {createHash} from 'node:crypto';
import {acquireAudioPrefix,AD_WINDOW_MAX_BYTES} from './bounded-audio.mjs';

export const AD_JOB_MAX_BYTES=2*1024**3;
export const AD_JOB_MAX_REQUESTS=512;
const periodMs=24*3600000;

// This caps network acquisition, independently of the existing paid AI ledger.
// Reserve before I/O across processes; an interrupted transfer retains its
// conservative byte ceiling. Completed transcripts/checkpoints are untouched.
export function adAcquirer({store,episodeKey,audioUrl,acquire=acquireAudioPrefix,clock=Date.now}) {
  const key=createHash('sha256').update(episodeKey+'\n'+audioUrl).digest('hex');
  return async(url,path,options={})=>{
    const limit=Math.min(options.maxBytes??AD_WINDOW_MAX_BYTES,AD_WINDOW_MAX_BYTES);
    if(!Number.isSafeInteger(limit)||limit<1)throw Error('Invalid audio acquisition bound');
    const period=store.transaction(()=>{
      let row=store.get('skip-acquisition',key);
      if(!row||row.resetsAt<=clock())row={episodeKey,startedAt:clock(),resetsAt:clock()+periodMs,bytesReservedOrSpent:0,receivedBytes:0,requests:0,failedRequests:0};
      if(row.requests>=AD_JOB_MAX_REQUESTS||row.bytesReservedOrSpent+limit>AD_JOB_MAX_BYTES)
        throw Object.assign(Error('Audio acquisition budget reached; saved work resumes after its capacity reset.'),{code:'AD_ACQUISITION_LIMIT',retryAfter:new Date(row.resetsAt).toISOString()});
      store.set('skip-acquisition',key,{...row,requests:row.requests+1,bytesReservedOrSpent:row.bytesReservedOrSpent+limit});return row.startedAt;
    });
    try{
      const result=await acquire(url,path,{...options,maxBytes:limit});
      if(!Number.isSafeInteger(result.bytes)||result.bytes<0||result.bytes>limit)throw Error('Acquisition exceeded its byte bound');
      store.transaction(()=>{const row=store.get('skip-acquisition',key);if(row?.startedAt===period)store.set('skip-acquisition',key,{...row,bytesReservedOrSpent:row.bytesReservedOrSpent-limit+result.bytes,receivedBytes:row.receivedBytes+result.bytes});});
      return result;
    }catch(error){store.transaction(()=>{const row=store.get('skip-acquisition',key);if(row?.startedAt===period)store.set('skip-acquisition',key,{...row,failedRequests:row.failedRequests+1});});throw error;}
  };
}
