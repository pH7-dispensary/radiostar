// Reproducible estimates from captured ledger/quality evidence; no AWS/model calls.
import{readFileSync,writeFileSync}from'node:fs';
import{planAudioSegments}from'../../transcription.mjs';
const read=n=>JSON.parse(readFileSync(`evals/intelligence-engine-${n}.json`,'utf8'));
const baseline=read('baseline'),production=read('production'),live=read('live'),named=read('named'),aws=read('aws-costs');
const latest=new Set(read('follow').expectedLatest);
const sum=xs=>xs.reduce((a,b)=>a+b,0),round=x=>Number(x.toFixed(10));
const phaseModelSpendByKind=Object.fromEntries(Object.entries(production.costs).map(([k,v])=>[k,round(v.usd-(baseline.costs[k]?.usd||0))]));
const episodes=production.quality.filter(q=>latest.has(q.episodeId)).map(q=>{
 const key=production.jobs.find(j=>j.episodeId===q.episodeId).key,costs={};
 for(const u of live.usage.filter(u=>u.jobId===q.jobId||u.episodeKey===key)){const k=u.kind||'text';costs[k]=(costs[k]||0)+u.usd;}
 return{episodeId:q.episodeId,title:q.title,durationSeconds:q.durationMs/1000,state:q.state,costs:Object.fromEntries(Object.entries(costs).map(([k,v])=>[k,round(v)])),totalUsd:round(sum(Object.values(costs))),processingMs:q.processingMs};
});
const avg=k=>sum(episodes.map(e=>e.costs[k]||0))/episodes.length;
const freshHours=sum(episodes.map(e=>e.durationSeconds))/3600;
const overheadPerHour=sum(episodes.map(e=>e.totalUsd-(e.costs.transcription||0)))/freshHours;
const billedSeconds=ms=>sum(planAudioSegments({durationMs:ms}).map(p=>Math.ceil((p.endMs-p.startMs)/1000)));
const batch=production.quality.filter(q=>latest.has(q.episodeId)||q.episodeId.includes('hpr2578'));
const capacity=(rows)=>{const seconds=sum(rows.map(ms=>billedSeconds(ms))),audio=seconds*.0001,overhead=sum(rows)/3600000*overheadPerHour;return{episodeCount:rows.length,estimatedAudioSecondsIncludingOverlap:seconds,audioOnlyUsd:round(audio),estimatedAnalysisIndexReviewUsd:round(overhead),options:[24,72].map(hours=>({hours,requiredDailyAudioSeconds:Math.ceil(seconds/(hours/24)),modelUsdPerDay:round((audio+overhead)/(hours/24)),applied:false}))};};
const scenarios=[[100,5],[1000,20],[10000,60]].map(([users,unique])=>{const audioHours=unique*.2,cost=audioHours*.36+unique*.4*overheadPerHour;return{activeUsers:users,distinctRequestedEpisodeHoursPerDay:unique,cachedFraction:.6,publisherTranscriptFraction:.2,newTranscriptionFraction:.2,newAudioHoursPerDay:audioHours,modelPreparationUsdPerDay:round(cost),modelPreparationUsdPer30Days:round(cost*30),fitsAudioDailyCap:audioHours<=3,fitsMonthlyModelCap:cost*30<=25};});
const days=aws.days.filter(d=>d.date<'2026-11-18');
const lastCompleted=Math.max(...production.jobs.filter(j=>latest.has(j.episodeId)).map(j=>Date.parse(j.completedAt)));
const elapsedHours=(lastCompleted-Date.parse(read('follow').at))/3600000;
const result={at:production.at,phaseModelSpendByKind,phaseTotalModelUsd:round(sum(Object.values(phaseModelSpendByKind))),dailyNewAudioSeconds:live.totals.transcriptionSeconds,episodes,measuredAudioUsdPerHour:.36,measuredAverageTextUsdPerEpisode:round(avg('text')),measuredAverageIndexUsdPerEpisode:round(avg('embedding')),measuredAverageReviewUsdPerEpisode:round(avg('grounding-review')),measuredAverageTotalUsdPerPreparedEpisode:round(sum(episodes.map(e=>e.totalUsd))/episodes.length),note:'Includes bounded repair costs; inspect episode states, not a steady-state full-READY benchmark. Scenarios exclude query serving and use measured per-audio-hour analysis overhead for one-hour episodes. No configuration applied.',baselineActiveFollowedCatalogue:{episodes:0,additionalFundingRequired:0},verificationBatch:capacity(batch.map(q=>q.durationMs)),namedHypotheticalOnlyIfBasisEstablished:capacity(named.episodes.map(e=>Number(e.duration)*1000)),scenarios,existingAws30DayRunRateUsd:round(sum(days.map(d=>d.usd))/days.length*30),awsScaleCaveat:'Linear projection of accrued complete November days, not a forecast or capacity test. Delivery, storage, support and scaling costs are unmeasured; no new AWS resources.'};
result.measuredNonAudioUsdPerSourceHour=round(overheadPerHour);
result.observedThroughput={sourceHours:freshHours,wallHours:elapsedHours,sourceHoursPerWallHour:freshHours/elapsedHours,note:'Three followed episodes through their latest bounded repair; includes queue waits, deployments and partial outputs, not steady-state provider speed.'};
result.monthlyPreparationOnly={days:30,newAudioCeilingHours:90,similarPartialEpisodes:Math.floor(25/result.measuredAverageTotalUsdPerPreparedEpisode),oneHourFreshEpisodes:Math.floor(Math.min(90,25/(.36+overheadPerHour))),note:'Excludes query costs and other concurrent usage; not a guarantee of fully validated summaries.'};
writeFileSync('evals/intelligence-engine-economics.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({phaseUsd:result.phaseTotalModelUsd,dayUsd:live.totals.day,episodes:episodes.map(e=>({title:e.title,state:e.state,cost:e.totalUsd})),capacity:result.verificationBatch}));
