import assert from 'node:assert/strict';
import {assessTranscript,parseJsonTranscript,parseSrt,parseVtt,safeTranscriptUrl,transcriptRefsFromItem,TranscriptReadiness} from './transcripts.mjs';
import {BudgetLedger,defaultControls,openAIStatus} from './openai-intelligence.mjs';
import {validateChapters} from './openai-intelligence.mjs';

let refs=transcriptRefsFromItem('<item><podcast:transcript url="https://publisher.example/episode.vtt" type="text/vtt" language="en" rel="captions" /></item>');
assert.deepEqual(refs,[{url:'https://publisher.example/episode.vtt',type:'text/vtt',language:'en',rel:'captions'}]);
let vtt=parseVtt('WEBVTT\n\n00:00:01.000 --> 00:00:03.200\nMara: hello\n\n00:00:03.200 --> 00:00:06.000\nIvo: hi');
assert.equal(vtt.length,2);assert.equal(vtt[1].startMs,3200);assert.equal(parseSrt('1\n00:00:00,000 --> 00:00:01,000\nHello').length,1);assert.equal(parseJsonTranscript(JSON.stringify({segments:[{start:1,end:3,text:'Hello'}]}))[0].endMs,3000);
assert.equal(assessTranscript({segments:vtt,durationMs:6000}).readiness,TranscriptReadiness.FULLY_READY);assert.equal(assessTranscript({segments:[{id:'a',startMs:null,endMs:null,text:'Words'}]}).readiness,TranscriptReadiness.TEXT_ONLY);assert.equal(assessTranscript({segments:[{id:'a',startMs:500,endMs:100,text:'Broken'}]}).readiness,TranscriptReadiness.UNUSABLE);
assert.equal(safeTranscriptUrl('http://127.0.0.1/private'),null);assert.equal(safeTranscriptUrl('https://publisher.example/a.vtt')?.hostname,'publisher.example');
let ledger=new BudgetLedger({...defaultControls,enabled:true,dailyUsd:.03,monthlyUsd:.03});ledger.reserve({id:'one',usd:.02});assert.throws(()=>ledger.reserve({id:'two',usd:.02}),/budget/);ledger.reconcile('one',{usd:.01});assert.equal(ledger.usage.length,1);assert.equal(openAIStatus({}).configured,false);
assert.equal(validateChapters([{title:'Opening',description:'A grounded opening',startMs:1000,endMs:3200,sourceSegmentIds:['seg-1']}],{segments:vtt}).length,1);assert.equal(validateChapters([{title:'Invalid',startMs:1000,endMs:3200,sourceSegmentIds:['not-a-source']}],{segments:vtt}).length,0);
console.log('transcript and cost control checks passed');
