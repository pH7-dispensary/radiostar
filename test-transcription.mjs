import assert from 'node:assert/strict';
import {mergeTranscriptSegments,planAudioSegments} from './transcription.mjs';
let plan=planAudioSegments({durationMs:3_000_000,maxSegmentMs:1_200_000,overlapMs:1_000});assert.equal(plan.length,3);assert.equal(plan[1].startMs,1_199_000);assert.deepEqual(mergeTranscriptSegments([{startMs:0,endMs:1000,text:'Hello'},{startMs:900,endMs:2000,text:'world'}]).map(x=>x.text),['Hello','world']);assert.throws(()=>planAudioSegments({durationMs:0}),/duration/);console.log('long-form transcription planning checks passed');
