import assert from 'node:assert/strict';
import {mergeTranscriptSegments,planAudioSegments} from './transcription.mjs';
import {assessTranscript} from './transcripts.mjs';
import {transcribeOnDemand} from './transcription.mjs';
import {LocalStore} from './persistence.mjs';
import {BudgetLedger} from './openai-intelligence.mjs';
const overlap=mergeTranscriptSegments([
 {id:'0-tail',startMs:1199200,endMs:1199840,text:'Original overlap.',chunkIndex:0,chunkStartMs:0,chunkEndMs:1200000},
 {id:'1-head',startMs:1199000,endMs:1205280,text:'Original overlap continues here.',chunkIndex:1,chunkStartMs:1199000,chunkEndMs:2083240},
]);
assert.equal(overlap.length,1);assert.equal(overlap[0].text,'Original overlap continues here.');
assert.equal(overlap[0].startMs,1199000);assert.equal(overlap[0].endMs,1205280);assert.equal(overlap[0].overlapSources.length,2);
assert.notEqual(assessTranscript({segments:overlap}).readiness,'UNUSABLE');
assert.equal(assessTranscript({segments:mergeTranscriptSegments([
 {startMs:0,endMs:100,text:'Outer',chunkIndex:0},{startMs:20,endMs:80,text:'Invalid nested',chunkIndex:0},
])}).readiness,'UNUSABLE','unrelated malformed same-chunk timing is not accepted');
const store=new LocalStore(':memory:'),ledger=new BudgetLedger({enabled:true},store);let calls=0;
const speech='Original test fixture discusses verified timestamps, canonical source evidence, accountable cost reservations and reliable podcast processing. ';
try {
 const options={episodeId:'boundary',audioUrl:'https://owned.example/boundary.mp3',durationMs:1210000,ledger,requestId:'boundary',authorised:true,checkpointStore:store,checkpointPrefix:'boundary:hash',chunkFactory:async()=>Buffer.from('mock'),client:{audio:{transcriptions:{create:async()=>({segments:++calls===1?[
  {start:0,end:1196.16,text:speech},{start:1196.16,end:1201.2,text:'Original overlap.'}
 ]:[{start:0,end:6.28,text:'Original overlap continues here.'},{start:6.28,end:11,text:speech}]})}}}};
 const transcript=await transcribeOnDemand(options);assert.notEqual(transcript.quality.readiness,'UNUSABLE');assert(transcript.segments.every(s=>s.endMs<=s.chunkEndMs));assert.equal(calls,2);
 await transcribeOnDemand(options);assert.equal(calls,2,'durable paid responses are reused after parser recovery');
 const invalid={...options,checkpointPrefix:null,requestId:'invalid-boundary',client:{audio:{transcriptions:{create:async()=>({segments:[{start:0,end:1210,text:speech}]})}}}};
 await assert.rejects(transcribeOnDemand(invalid),/timing failed/,'large out-of-chunk times remain blocked');
 // Exact observed terminal timing shape; reuse its saved response, never
 // rebuy a completed chunk to work around a parser tolerance defect.
 const savedKey='drift:hash:whisper-1:1200000:0';
 const response={segments:[{start:0,end:1193.72,text:speech},{start:1193.719970703125,end:1202.0799560546875,text:'The final source sentence ends here.'}]};
 store.set('transcription-checkpoint',savedKey,{state:'READY',response});
 const before=calls;
 const repaired=await transcribeOnDemand({...options,durationMs:1200000,checkpointPrefix:'drift:hash'});
 assert.equal(calls,before);assert.equal(repaired.segments.at(-1).endMs,1200000);
 assert.equal(repaired.segments.at(-1).providerEndMs,1202080);
 assert.deepEqual(store.get('transcription-checkpoint',savedKey).response,response);
 for(const segments of [
   [{start:1190,end:1203.01,text:speech}],
   [{start:1100,end:1202,text:speech}],
   [{start:1193,end:1202.08,text:speech},{start:1199,end:1200,text:'Later segment.'}],
 ]) {
   store.set('transcription-checkpoint','negative:hash:whisper-1:1200000:0',{state:'READY',response:{segments}});
   await assert.rejects(transcribeOnDemand({...options,durationMs:1200000,checkpointPrefix:'negative:hash'}),/timing failed/);
 }

 const confidenceKey='confidence:hash:whisper-1:60000:0';
 store.set('transcription-checkpoint',confidenceKey,{state:'READY',response:{segments:[
  {start:0,end:20,text:speech,no_speech_prob:.9629696607589722,avg_logprob:-.40612083673477173},
  {start:20,end:40,text:'Low confidence silence hallucination.',no_speech_prob:.99,avg_logprob:-2},
  {start:40,end:60,text:'Unscored no-speech observation.',no_speech_prob:.99}
 ]}});
 const confident=await transcribeOnDemand({...options,durationMs:60000,checkpointPrefix:'confidence:hash',cachedOnly:true});
 assert.equal(confident.segments.length,1);assert.equal(confident.segments[0].text,speech.trim());assert.equal(calls,before);
 await assert.rejects(transcribeOnDemand({...options,durationMs:60000,checkpointPrefix:'absent:hash',cachedOnly:true}),e=>e.code==='CHECKPOINT_MISSING');
 const boundary=[{id:'a',text:"Original speech, but if you're",startMs:1193000,endMs:1200000,chunkIndex:0,chunkStartMs:0,chunkEndMs:1200000},
 {id:'b',text:"But if you're already discussing evidence, keep the new words.",startMs:1199000,endMs:1207000,chunkIndex:1,chunkStartMs:1199000,chunkEndMs:2399000}];
 const reconciled=mergeTranscriptSegments(boundary);assert.equal(reconciled[1].id,'b');assert.equal(reconciled[1].startMs,1199000);assert.equal(reconciled[1].text,'already discussing evidence, keep the new words.');assert.equal(reconciled[1].originalText,boundary[1].text);assert.equal(reconciled[1].overlapPrefixTrimmedWords,3);
 const editorial=mergeTranscriptSegments(boundary.map(r=>({...r,chunkIndex:0})));assert.equal(editorial[1].text,boundary[1].text,'ordinary repeated editorial phrases stay intact');
}finally{store.close();}
let plan=planAudioSegments({durationMs:3_000_000,maxSegmentMs:1_200_000,overlapMs:1_000});assert.equal(plan.length,3);assert.equal(plan[1].startMs,1_199_000);assert.deepEqual(mergeTranscriptSegments([{startMs:0,endMs:1000,text:'Hello'},{startMs:900,endMs:2000,text:'world'}]).map(x=>x.text),['Hello','world']);assert.throws(()=>planAudioSegments({durationMs:0}),/duration/);console.log('long-form transcription planning checks passed');
