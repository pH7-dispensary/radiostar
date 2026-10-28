import assert from 'node:assert/strict';
import {LocalStore} from './persistence.mjs';
import {SkipService} from './skip-service.mjs';
import {episodeKey} from './episode-pipeline.mjs';
const store=new LocalStore(':memory:'),feedUrl='https://owned.example/rss',episodeId='projection',key=episodeKey(feedUrl,episodeId),hash='a'.repeat(64);
const service=new SkipService(store,{rights:{evaluate:()=>({allowed:true})}},{verifyAudio:()=>{throw Error('Read-only diagnostics must not process audio');}});
const interval={id:'verified',episodeKey:key,publisherFeed:feedUrl,type:'advert',startMs:0,endMs:15000,proposedStartMs:0,proposedEndMs:14900,boundaryVerified:true,verificationState:'VERIFIED',audioVariantFingerprint:hash,openingBreak:true,approvalSource:'HUMAN_REVIEW_PLUS_AUDIO',evidence:[]};
const review={audioContentHash:hash,labels:[{kind:'advert',independent:true,audioContentHash:hash,startMs:0,endMs:15000}]};
try{
 store.set('skip-source',key,{feedUrl,episodeId,episode:{title:'Owned source title'},provenance:{publisher:'Owned publisher'}});
 store.set('skip-analysis',key,{episodeKey:key,feedUrl,episodeId,activeIntervalIds:[interval.id]});
 store.set('skip-audio-verification',key,{episodeKey:key,state:'READY',variant:{audioVariantFingerprint:hash}});
 store.set('skip-interval',interval.id,interval);store.set('skip-human-review',key,review);
 const before=JSON.stringify(store.all('skip-interval')),view=service.operations(),d=view.diagnostics[0],i=view.intervals[0];
 assert.equal(d.title,'Owned source title');assert.equal(d.podcast,'Owned publisher');assert.equal(i.audioVariant,hash);assert.equal(i.proposedEndMs,14900);assert.equal(i.proposedStartMs,0);assert.equal(i.approvalSource,'HUMAN_REVIEW_PLUS_AUDIO');
 assert.equal(d.reviewedBreakLabels,1);assert.equal(d.completeVerifiedBreaks,1);assert.equal(d.completeBreakCoverage,1);assert.match(d.coverageReason,/not full-episode recall/);assert.equal(d.automaticallyVerifiedCompleteBreaks,0);assert.equal(JSON.stringify(store.all('skip-interval')),before);
 for(const patch of [{endMs:14000},{disputed:true},{verificationState:'DISPUTED'},{audioVariantFingerprint:'b'.repeat(64)}]){store.set('skip-interval',interval.id,{...interval,...patch});assert.equal(service.operations().diagnostics[0].completeBreakCoverage,0);}
 store.set('skip-interval',interval.id,{...interval,approvalSource:'AUTOMATED_AUDIO_VERIFICATION'});
 store.delete('skip-human-review',key);const machine=service.operations().diagnostics[0];assert.equal(machine.completeBreakCoverage,null);assert.equal(machine.completeVerifiedBreaks,null);assert.equal(machine.reviewedBreakLabels,0);assert.equal(machine.automaticallyVerifiedCompleteBreaks,1);assert.equal(store.all('skip-human-review').length,0);
 for(const badReview of [{...review,audioContentHash:'b'.repeat(64)},{...review,labels:[{...review.labels[0],independent:false}]},{...review,labels:[{...review.labels[0],audioContentHash:'b'.repeat(64)}]}]){store.set('skip-human-review',key,badReview);assert.equal(service.operations().diagnostics[0].completeBreakCoverage,null);}
 assert.equal(store.all('budget').length,0);
}finally{store.close();}
console.log('Final Ad Skip projection: stored metadata/bounds/hash, partial/disputed/mismatched exclusions and separate human-labelled versus automated coverage passed.');
