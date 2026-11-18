import assert from 'node:assert/strict';
import {LocalStore} from './persistence.mjs';
import {prepareAdSkipOpening} from './ad-skip-source.mjs';
import {adAcquirer,AD_JOB_MAX_BYTES} from './ad-acquisition.mjs';
import {AD_WINDOW_MAX_BYTES} from './bounded-audio.mjs';
import {SkipService} from './skip-service.mjs';

const store=new LocalStore(':memory:');
const cursor={overlapSha256:'a'.repeat(64)},hash='b'.repeat(64);
const ledger={refresh(){},controls:{enabled:true,dailyUsd:5,monthlyUsd:25,dailyTranscriptionSeconds:10800},totals:()=>({day:0,month:0,transcriptionSeconds:0})};
const previousTranscript={nextWindowCursor:cursor,coverageEndMs:180000,segments:[
  {id:'0-0',startMs:60000,endMs:61000,text:'An editorial product discussion.'},
  {id:'0-1',startMs:120000,endMs:121000,text:'Another independent point.'},
]};
let paidCalls=0;
const input={feedUrl:'https://owned.example/rss',episodeId:'window-id-test',audioUrl:'https://owned.example/audio.mp3',store,ledger,cursor,previousTranscript,authorised:()=>true,
  audioFactory:async()=>({durationMs:300000,contentHash:hash,windowProof:{coverageStartMs:60000,coverageEndMs:240000},chunkFactory:()=>{},cleanup:async()=>{}}),
  transcribe:async()=>{paidCalls++;return {transcriptVersion:'provider-version',segments:[{id:'0-0',startMs:0,endMs:1000,text:'This episode is sponsored by an actual advertiser.'}]};}};
try{
  const first=await prepareAdSkipOpening(input);
  assert.equal(first.transcript.segments.length,3);
  assert.equal(new Set(first.transcript.segments.map(s=>s.id)).size,3,'ASR-local IDs must not collide with reused overlap IDs');
  assert.deepEqual(first.transcript.segments.map(s=>s.startMs),[60000,120000,178500]);
  const second=await prepareAdSkipOpening(input);
  assert.deepEqual(second.transcript.segments,first.transcript.segments);
  assert.equal(second.transcript.transcriptVersion,first.transcript.transcriptVersion);
  assert.equal(paidCalls,1,'repaired window cache must not cause another provider request');
  const canonical=await prepareAdSkipOpening({...input,episodeId:'canonical-reuse',cursor:null,previousTranscript:null,
    candidateTranscript:{audioContentHash:'c'.repeat(64),durationMs:10000,segments:[{id:'source',startMs:0,endMs:9000,text:'Original licensed speech.'}]},
    audioFactory:async()=>({durationMs:10000,contentHash:'c'.repeat(64),windowProof:{coverageStartMs:0,coverageEndMs:10000},cleanup:async()=>{}}),
    transcribe:()=>assert.fail('A matching canonical transcript must not be purchased again')});
  assert(canonical.cacheReused);
  let time=1000,network=0;
  const acquire=adAcquirer({store,episodeKey:'bounded',audioUrl:'https://owned.example/source',clock:()=>time,
    acquire:async(_u,_p,options)=>{network++;assert(options.maxBytes<=AD_WINDOW_MAX_BYTES);return {bytes:options.maxBytes};}});
  await Promise.all(Array.from({length:AD_JOB_MAX_BYTES/AD_WINDOW_MAX_BYTES},()=>acquire('https://owned.example/source','unused')));
  await assert.rejects(acquire('https://owned.example/source','unused'),e=>e.code==='AD_ACQUISITION_LIMIT'&&e.retryAfter===new Date(1000+86400000).toISOString());
  assert.equal(network,256,'atomic reservations must prevent an extra network request');
  time+=86400000;await acquire('https://owned.example/source','unused');assert.equal(network,257);
  const acquisitionKey=(await import('node:crypto')).createHash('sha256').update('reconcile\nhttps://owned.example/source').digest('hex');
  const partial=adAcquirer({store,episodeKey:'reconcile',audioUrl:'https://owned.example/source',acquire:async()=>({bytes:1024})});
  await partial('https://owned.example/source','unused');
  assert.equal(store.get('skip-acquisition',acquisitionKey).bytesReservedOrSpent,1024);
  const interrupted=adAcquirer({store,episodeKey:'reconcile',audioUrl:'https://owned.example/source',acquire:async()=>{throw Error('connection interrupted');}});
  await assert.rejects(interrupted('https://owned.example/source','unused'),/interrupted/);
  assert.equal(store.get('skip-acquisition',acquisitionKey).bytesReservedOrSpent,1024+AD_WINDOW_MAX_BYTES,'unknown transfer retains its reserved ceiling');
  assert.equal(store.get('skip-acquisition',acquisitionKey).failedRequests,1);
  // A new acquirer uses the persisted ledger rather than resetting capacity.
  await partial('https://owned.example/source','unused');
  assert.equal(store.get('skip-acquisition',acquisitionKey).bytesReservedOrSpent,2048+AD_WINDOW_MAX_BYTES);
  let preparations=0,wholeDownloads=0;
  const service=new SkipService(store,{status:()=>({state:'READY',episode:{id:'canonical',audioUrl:'https://owned.example/source'},transcript:{audioContentHash:'d'.repeat(64),segments:[]}})},
    {prepareSource:async()=>{preparations++;throw Error('controlled bounded network interruption');},canVerifyAudio:()=>true,verifyAudio:()=>{wholeDownloads++;}});
  service.inspect('https://owned.example/rss','canonical');
  service.scheduleVerification('https://owned.example/rss','canonical',service.source('https://owned.example/rss','canonical'),[{qualifiesForAudioVerification:true,verificationState:'CANDIDATE'}]);
  await service.sourceTail;
  assert.equal(preparations,1);assert.equal(wholeDownloads,0,'new verification must not download the full canonical audio');
  console.log('Progressive speech IDs, timestamp-preserving cache reuse and paid deduplication passed.');
}finally{store.close();}
