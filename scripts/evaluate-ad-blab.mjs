// External, evaluation-only benchmark. Labels never enter the detector.
// BLAB supplies human-reviewed text spans with machine-aligned timestamps,
// not hash-bound reviewed audio boundaries: this cannot pass release gates.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {LocalStore} from '../persistence.mjs';
import {SkipService} from '../skip-service.mjs';
const [input,output]=process.argv.slice(2);assert(input&&output,'Supply the original BLAB advertisement JSON and an output path');
const raw=readFileSync(input),data=JSON.parse(raw),results=[];
assert.equal(data.length,200);
const intersect=(a,b)=>Math.max(0,Math.min(a.endMs,b.endMs)-Math.max(a.startMs,b.startMs));
for(const [index,row] of data.entries()){
  const words=row.groundtruth.word_timestamp,segments=[];
  // Deterministic speech grouping uses only words, punctuation and pauses.
  let group=[];
  const flush=()=>{if(!group.length)return;segments.push({id:String(segments.length),startMs:Math.round(group[0].start*1000),endMs:Math.round(group.at(-1).end*1000),text:group.map(w=>w.word).join(' ')});group=[];};
  for(const word of words){if(!Number.isFinite(word.start)||!Number.isFinite(word.end)||word.end<=word.start)continue;if(group.length&&(word.start-group.at(-1).end>1||word.end-group[0].start>12))flush();group.push(word);if(/[.!?]$/.test(word.word))flush();}flush();
  const store=new LocalStore(':memory:');
  try{
    const transcript={segments,durationMs:segments.at(-1)?.endMs||0,transcriptVersion:createHash('sha256').update(JSON.stringify(segments)).digest('hex')};
    const detector=new SkipService(store,{status:()=>({state:'TRANSCRIPT_READY',episode:{audioUrl:row.video_url},transcript})});
    const start=performance.now();detector.inspect('https://evaluation.invalid/blab',String(index));
    const candidates=store.all('skip-interval').map(([,v])=>v).filter(v=>v.type==='advert').map(({startMs,endMs,verificationState})=>({startMs,endMs,verificationState}));
    const labels=row.groundtruth.ads_segment.map(v=>({startMs:Math.round(v.start*1000),endMs:Math.round(v.end*1000)}));
    assert(labels.every(v=>Number.isFinite(v.startMs)&&v.endMs>v.startMs));
    results.push({index,videoUrl:row.video_url,transcriptDurationMs:transcript.durationMs,labels:labels.length,candidates:candidates.length,
      labelsWithAnyCandidate:labels.filter(l=>candidates.some(c=>intersect(l,c)>0)).length,
      labelsWithCompleteCandidate:labels.filter(l=>candidates.some(c=>c.startMs<=l.startMs+1500&&c.endMs>=l.endMs-1500)).length,
      candidatesOutsideAllLabels:candidates.filter(c=>!labels.some(l=>intersect(l,c)>0)).length,
      automaticSkipIntervals:0,analysisMs:performance.now()-start});
  }finally{store.close();}
}
const sum=key=>results.reduce((n,r)=>n+r[key],0);
const result={at:new Date().toISOString(),source:'https://huggingface.co/datasets/oreva/blab_long_audio',sourceSha256:createHash('sha256').update(raw).digest('hex'),
  attribution:'Ahia et al., BLAB: Brutally Long Audio Bench (2025), CC BY 4.0; evaluation only, no training.',
  scope:'Frozen external transcript-only diagnostic. No labels supplied to detector; no tuning from these results.',
  limitations:['No original audio hashes or redistributed audio in source dataset','Advertisement text reviewed by dataset authors; timestamps aligned by WhisperX','No independently annotated challenging-negative subset','No acoustic verification or played-audio identity; not a native playback result'],
  episodes:results.length,transcriptHours:sum('transcriptDurationMs')/3600000,labels:sum('labels'),candidates:sum('candidates'),
  labelsWithAnyCandidate:sum('labelsWithAnyCandidate'),labelsWithCompleteCandidate:sum('labelsWithCompleteCandidate'),candidatesOutsideAllLabels:sum('candidatesOutsideAllLabels'),
  automaticSkipIntervals:0,providerCostUsd:0,releaseGateEligible:false,results};
writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,results:undefined}));
