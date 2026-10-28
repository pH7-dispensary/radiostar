// Read-only replay of real, already-paid audio checkpoints. No provider/network
// capability exists here; deliberately interrupt assembly and resume in a new process.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {transcribeOnDemand} from '../transcription.mjs';
import {RightsRegistry} from '../rights-registry.mjs';
const [snapshot,feedUrl,episodeId,stage]=process.argv.slice(2);
if(!snapshot||!feedUrl||!episodeId)throw Error('Supply an integrity-verified snapshot, exact feed URL and episode ID.');
if(!stage){
 const run=stage=>spawnSync(process.execPath,[fileURLToPath(import.meta.url),snapshot,feedUrl,episodeId,stage],{encoding:'utf8',timeout:60000});
 const interrupted=run('interrupt');assert.equal(interrupted.signal,'SIGTERM',interrupted.stderr);
 const resumed=run('resume');assert.equal(resumed.status,0,resumed.stderr);
 console.log(JSON.stringify({interruptedAtChunk:1,freshProcessResumed:true,providerCalls:0,result:JSON.parse(resumed.stdout)}));
}else{
 const db=new DatabaseSync(snapshot,{readOnly:true});
 try{
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  const store={get:(kind,id)=>{const row=db.prepare('SELECT payload FROM records WHERE kind=? AND id=?').get(kind,id);return row?JSON.parse(row.payload):null;}};
  const rights=new RightsRegistry(store);
  for(const feature of ['intelligence-processing','audio-transcription'])assert(rights.evaluate({feature,feedUrl,episodeId}).allowed);
  const key=createHash('sha256').update(JSON.stringify([feedUrl,episodeId])).digest('hex'), job=store.get('intelligence',key);
  assert(job?.transcript?.audioContentHash&&job.transcript.segments.length);
  const checkpoints=db.prepare("SELECT id,payload FROM records WHERE kind='transcription-checkpoint'").all().filter(x=>x.id.startsWith(key+':'));
  assert(checkpoints.length>=2&&checkpoints.every(x=>JSON.parse(x.payload).state==='READY'));
  const prefix=key+':'+job.transcript.audioContentHash;
  const durationMs=Number(checkpoints[0].id.split(':').at(-2));
  const transcript=await transcribeOnDemand({episodeId,audioUrl:job.episode.audioUrl,durationMs,checkpointStore:store,checkpointPrefix:prefix,requestId:'read-only-recovery',authorised:true,
   ledger:{controls:{maxEpisodeSeconds:7200},reserve:()=>{throw Error('Paid calls forbidden');}},
   chunkFactory:async()=>{throw Error('Missing paid checkpoint; replay refused');},client:{},
   onProgress:({completedChunks})=>{if(stage==='interrupt'&&completedChunks===1)process.kill(process.pid,'SIGTERM');}});
  assert.equal(transcript.segments.length,job.transcript.segments.length);
  for(const [i,s]of transcript.segments.entries())for(const field of ['startMs','endMs','text'])assert.equal(s[field],job.transcript.segments[i][field]);
  console.log(JSON.stringify({segments:transcript.segments.length,checkpoints:checkpoints.length,durationMs,audioHash:job.transcript.audioContentHash,exactTranscriptMatch:true}));
 }finally{db.close();}
}
