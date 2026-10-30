import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Readable} from 'node:stream';
import ffmpeg from 'ffmpeg-static';
import {FollowedPreparation} from './followed-preparation.mjs';
import {AdWorkQueue} from './ad-work-queue.mjs';
import {acquireAudioPrefix,prepareAdAudioWindow,AD_WINDOW_MAX_BYTES} from './bounded-audio.mjs';
import {prepareProgressiveAudioWindow,audioChain,AUDIO_BLOCK_BYTES} from './progressive-audio.mjs';
import {prepareAdSkipOpening} from './ad-skip-source.mjs';
import {verifyAdSkipAudio} from './ad-skip-verification.mjs';
import {LocalStore} from './persistence.mjs';
import {BudgetLedger} from './openai-intelligence.mjs';
import {SkipService} from './skip-service.mjs';
import {episodeKey} from './episode-pipeline.mjs';
import {adWindowStore} from './ad-window-store.mjs';
import {matchDeliveredPrefix} from './native/src/deliveredAudioProof.mjs';

const exec=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex');
const directory=await mkdtemp(join(tmpdir(),'starcast-progressive-test-'));
const url='https://owned.example/progressive.mp3',feed='https://owned.example/feed.xml';
try {
  const queue=new AdWorkQueue({maximumPending:3}),order=[];
  let release;const running=queue.add('active',async()=>{order.push('active');await new Promise(r=>release=r);});
  await new Promise(r=>setImmediate(r));
  assert.equal(queue.add('active',()=>assert.fail('running work duplicated')),running);
  const low=queue.add('follow-one',()=>order.push('follow-one'),10);
  const second=queue.add('follow-two',()=>order.push('follow-two'),10);
  const playing=queue.add('playing',()=>order.push('playing'),100);
  assert.equal(queue.hasCapacity(),false);queue.promote('follow-two',40);
  release();await Promise.all([running,low,second,playing]);
  assert.deepEqual(order,['active','playing','follow-two','follow-one']);

  const range=async(status,headers,chunks)=>{
    const response=Readable.from(chunks);response.statusCode=status;response.headers=headers;
    return acquireAudioPrefix(url,join(directory,'range-'+Math.random()),{startByte:65536,maxBytes:16,openStream:async(_u,_n,_t,options)=>{
      assert.equal(options.range,'bytes=65536-65551');return {response,url};
    }});
  };
  assert.equal((await range(206,{'content-range':'bytes 65536-65551/65552'},[Buffer.alloc(16)])).completeSource,true);
  for(const [status,header] of [[200,{}],[206,{'content-range':'bytes 0-15/65552'}],[206,{'content-range':'bytes 65536-65535/65552'}],[206,{'content-range':'bytes 65536-65552/99999'}]])await assert.rejects(range(status,header,[Buffer.alloc(16)]));
  await assert.rejects(range(206,{'content-range':'bytes 65536-65551/65552'},[Buffer.alloc(8)]),/interrupted/);

  // A variable-bitrate, owned audio fixture supplies known audio boundaries.
  // Every fetched window is bounded; global alignment is checked against PCM,
  // independently of the packet timeline used by the implementation.
  const path=join(directory,'long-vbr.mp3');
  await exec(ffmpeg,['-nostdin','-v','error','-stream_loop','9','-i','fixtures/ad-skip-owned-v1.mp3','-t','500','-c:a','libmp3lame','-q:a','4',path],{timeout:30000});
  const bytes=await readFile(path),requests=[];
  const acquire=async(_url,destination,{startByte=0,maxBytes=AD_WINDOW_MAX_BYTES}={})=>{
    const part=bytes.subarray(startByte,startByte+maxBytes);requests.push({startByte,bytes:part.length});await writeFile(destination,part);
    return {bytes:part.length,contentHash:sha(part),completeSource:startByte+part.length===bytes.length,delivery:{url,headers:{contentLength:bytes.length}}};
  };
  const opening=await prepareAdAudioWindow(url,{acquire});let cursor=opening.cursor,windows=0,verifiedMidroll=false,verifiedPostroll=false;
  const rootTranscript={segments:[{id:'editorial',startMs:0,endMs:1000,text:'Ordinary editorial introduction.'}],audioContentHash:opening.contentHash,audioVariant:opening.contentHash,windowProof:opening.windowProof,coverageStartMs:0,coverageEndMs:180000,nextWindowCursor:cursor,transcriptVersion:'owned'};
  await opening.cleanup();assert(cursor);
  const firstCursor=cursor;
  while(cursor) {
    const audio=await prepareProgressiveAudioWindow(url,{cursor,acquire});windows++;
    assert(audio.windowProof.byteLength<=AD_WINDOW_MAX_BYTES);assert(audio.windowProof.coverageEndMs-audio.windowProof.coverageStartMs<=180000);
    let chain='0'.repeat(64);for(let i=0;i<audio.windowProof.byteEnd;i+=AUDIO_BLOCK_BYTES)chain=audioChain(chain,bytes.subarray(i,Math.min(i+AUDIO_BLOCK_BYTES,audio.windowProof.byteEnd)));
    assert.equal(audio.windowProof.chainHash,chain,'all preceding source bytes are bound');
    const seconds=(audio.windowProof.coverageStartMs+20000)/1000;
    const pcm=async(file,start)=>(await exec(ffmpeg,['-nostdin','-v','error','-i',file,'-af',`atrim=start=${start}:end=${start+1},asetpts=PTS-STARTPTS`,'-ac','1','-ar','8000','-f','s16le','-'],{encoding:'buffer',maxBuffer:64000})).stdout;
    const [whole,fragment]=await Promise.all([pcm(path,seconds),pcm(audio.path,seconds-audio.timelineOffsetMs/1000)]);
    // Decoder/resampler warmup can differ at the edges, but the interior must
    // remain aligned within one sample. No time/byte proportional estimates.
    assert(whole.subarray(1000,-1000).equals(fragment.subarray(1000,-1000)),'global PCM timeline alignment');
    const proof=audio.windowProof;
    const variant={windowProof:proof,audioVariantFingerprint:audio.contentHash};
    assert.equal(await matchDeliveredPrefix(variant,{matchChain:async(end,hash)=>end===proof.byteEnd&&hash===chain,current:()=>true}),audio.contentHash);
    assert.equal(await matchDeliveredPrefix(variant,{matchChain:async()=>false,current:()=>true}),null);
    assert.equal(await matchDeliveredPrefix(variant,{current:()=>true}),null,'old native builds cannot approve chain evidence');
    for(const [label,start,end] of [['midroll',215000,235000],['postroll',465000,485000]]) {
      if(start>=proof.coverageStartMs && end+1500<=proof.coverageEndMs) {
        const result=await verifyAdSkipAudio({audioUrl:url,expectedContentHash:audio.contentHash,preparedAudio:audio,candidates:[{id:label,startMs:start,endMs:end}]});
        assert(result.candidates[0].boundaryVerified,label+' acoustic boundary');
        assert(Math.abs(result.candidates[0].startMs-start)<=650);assert(Math.abs(result.candidates[0].endMs-end)<=650);
        if(label==='midroll')verifiedMidroll=true;else verifiedPostroll=true;
      }
    }
    cursor=audio.cursor;await audio.cleanup();assert(windows<12,'bounded forward progress');
  }
  assert(verifiedMidroll&&verifiedPostroll);assert(windows>3);assert(requests.every(r=>r.bytes<=AD_WINDOW_MAX_BYTES));
  await assert.rejects(prepareProgressiveAudioWindow(url,{cursor:firstCursor,acquire:async(u,p,o)=>{const result=await acquire(u,p,o);const changed=await readFile(p);changed[0]^=1;await writeFile(p,changed);return result;}}),/overlapping source bytes changed/);

  const store=new LocalStore(':memory:'),ledger=new BudgetLedger({enabled:false},store);
  const wrongTime={...rootTranscript,audioContentHash:'a'.repeat(64),coverageStartMs:0,coverageEndMs:180000};
  store.set('skip-window-transcript','a'.repeat(64),{transcript:wrongTime,origins:[]});
  await assert.rejects(prepareAdSkipOpening({feedUrl:feed,episodeId:'cache-time',audioUrl:url,store,ledger,authorised:()=>true,audioFactory:async()=>({durationMs:240000,contentHash:'a'.repeat(64),windowProof:{coverageStartMs:60000,coverageEndMs:180000},cleanup:async()=>{}})}),/budget/,'same bytes at another position cannot reuse global timestamps');
  store.set('followed-preparation','snapshot',{});
  const inspected=[];
  const prep=new FollowedPreparation({store,pipeline:{status:()=>null},enabled:()=>true,inspect:(feed,id,episode,context)=>inspected.push({id,priority:context.priority}),assess:()=>assert.fail('canonical backoff must not repeat discovery')});
  prep.follows=()=>[{feedUrl:feed}];prep.listeners=()=>[{id:'tester'}];
  prep.rows=()=>[0,1,2].map(rank=>({feedUrl:feed,episodeId:'latest-'+rank,rank,inWindow:true,createdAt:new Date().toISOString(),retryAfter:new Date(Date.now()+3600000).toISOString()}));
  await prep.dispatch();assert.deepEqual(inspected,[{id:'latest-0',priority:70},{id:'latest-1',priority:60},{id:'latest-2',priority:50}]);
  const sourceKey=episodeKey(feed,'long'),epoch=rootTranscript.audioContentHash;
  store.set('skip-source',sourceKey,{state:'READY',transcript:rootTranscript,audioUrl:url,episode:{id:'long',audioUrl:url,duration:18001},validUntil:Date.now()+3600000});
  let preparations=0;
  const options={progressive:true,automaticEnabled:()=>true,canVerifyAudio:()=>true,prepareSource:async input=>{
    preparations++;assert.equal(input.previousTranscript.audioContentHash,epoch);
    return {transcript:{...rootTranscript,audioContentHash:'c'.repeat(64),audioVariant:'c'.repeat(64),coverageStartMs:60000,coverageEndMs:240000,nextWindowCursor:null,windowProof:{version:'delivered-chain-v1'}},preparedAudio:{cleanup:async()=>{}}};
  }};
  const pipeline={status:()=>null,rights:{evaluate:()=>({allowed:true})}};
  const service=new SkipService(store,pipeline,options),context={positionMs:130000,audioProofVersion:'delivered-chain-v1',audioUrl:url,listener:{id:'tester'},preferences:{adSkipEnabled:true,advert:true}};
  service.playback(feed,'long',context);service.playback(feed,'long',context);
  await new Promise(r=>setTimeout(r,20));assert.equal(preparations,1,'global progressive claim deduplication');
  assert(adWindowStore(store,epoch,1).get('skip-source',sourceKey)?.transcript);
  new SkipService(store,pipeline,options).playback(feed,'long',context);await new Promise(r=>setTimeout(r,10));assert.equal(preparations,1,'restart reuses progressive window');
  store.close();
  console.log(JSON.stringify({passed:true,windows,verifiedMidroll,verifiedPostroll,acquisitions:requests.length,maxAcquisitionBytes:Math.max(...requests.map(r=>r.bytes)),paidCalls:0}));
} finally {await rm(directory,{recursive:true,force:true});}
