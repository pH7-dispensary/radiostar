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
}finally{store.close();}
let plan=planAudioSegments({durationMs:3_000_000,maxSegmentMs:1_200_000,overlapMs:1_000});assert.equal(plan.length,3);assert.equal(plan[1].startMs,1_199_000);assert.deepEqual(mergeTranscriptSegments([{startMs:0,endMs:1000,text:'Hello'},{startMs:900,endMs:2000,text:'world'}]).map(x=>x.text),['Hello','world']);assert.throws(()=>planAudioSegments({durationMs:0}),/duration/);console.log('long-form transcription planning checks passed');
