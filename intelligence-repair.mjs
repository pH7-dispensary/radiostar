import {generateLongFormIntelligence,generateEpisodeIntelligence,PROCESSING_VERSION} from './openai-intelligence.mjs';
import {transcriptFingerprint} from './intelligence-delivery.mjs';
import {validateClaims,claimsForResult,claimBinding,GROUNDING_VERSION} from './claim-grounding.mjs';
export const REPAIR_VERSION='missing-features-no-inline-citations-v1';
const complete=j=>Boolean(['READY','PARTIAL_READY'].includes(j?.state)&&j.completedAt&&j.transcript?.segments?.length);
const missing=j=>[
  ...(!j.brief || ['extractive','verified_partial'].includes(j.brief.mode)?['brief']:[]),
  ...(j.chapters||[]).flatMap((c,i)=>c.mode==='extractive'?[`chapter.${i}`]:[]),
];
export function queueFeatureRepair(pipeline,key,reason='Automatic repair of incomplete grounded outputs') {
  const j=pipeline.store.get('intelligence',key);
  if(!complete(j))throw Error('A completed canonical transcript is required for feature repair.');
  if(!pipeline.executionDecision(j.feedUrl,j.episodeId).canDispatch)throw Error('Current processing permission does not allow feature repair.');
  const signature=transcriptFingerprint(j.transcript),old=pipeline.store.get('intelligence-repair',key);
  if(old?.signature===signature&&old.version===REPAIR_VERSION)return old;
  const value={version:REPAIR_VERSION,signature,jobId:j.jobId,state:missing(j).length?'QUEUED':'READY',features:{},requestedAt:new Date().toISOString(),reason};
  pipeline.store.set('intelligence-repair',key,value);return value;
}
export async function repairOneFeature(pipeline,key) {
  let state=pipeline.store.get('intelligence-repair',key),job=pipeline.store.get('intelligence',key);
  if(!state || !['QUEUED','PROCESSING','WAITING_FOR_CAPACITY'].includes(state.state))return state;
  const canPersist=()=>{
    const current=pipeline.store.get('intelligence',key);
    return complete(current)&&current.jobId===state.jobId&&transcriptFingerprint(current.transcript)===state.signature&&pipeline.executionDecision(current.feedUrl,current.episodeId).canDispatch;
  };
  const save=patch=>{state={...state,...patch,updatedAt:new Date().toISOString()};pipeline.store.set('intelligence-repair',key,state);const current=pipeline.store.get('intelligence',key);if(current?.jobId===state.jobId)pipeline.store.set('intelligence',key,{...current,featureRepair:{state:state.state,activeFeature:state.activeFeature||null,features:state.features,updatedAt:state.updatedAt}});return state;};
  if(pipeline.inflight.has(key))return state;
  if(!canPersist())return save({state:'BLOCKED',code:'SOURCE_OR_PERMISSION_CHANGED'});
  const feature=missing(job).find(f=>!state.features[f] || ['PROCESSING','WAITING_FOR_CAPACITY'].includes(state.features[f].state));
  if(!feature)return save({state:missing(job).length?'PARTIAL_READY':'READY',completedAt:new Date().toISOString()});
  const previous=state.features[feature] || {},attempt=previous.attempt || 1;
  save({state:'PROCESSING',activeFeature:feature,features:{...state.features,[feature]:{state:'PROCESSING',attempt}}});
  try {
    const source=feature==='brief'?job.transcript:{...job.transcript,segments:job.transcript.segments.filter(s=>job.chapters[Number(feature.split('.')[1])].sourceSegmentIds.includes(s.id))};
    const options={transcript:source,propagateReviewErrors:true,outputProfile:pipeline.executionDecision(job.feedUrl,job.episodeId).processingBasis.outputProfile,ledger:pipeline.ledger,client:pipeline.client,requestedFeatures:feature==='brief'?['brief']:['chapters'],
      requestId:`${job.jobId}:text:${REPAIR_VERSION}:${feature}:${attempt}`,checkpointStore:pipeline.store,
      checkpointPrefix:`${key}:${REPAIR_VERSION}:${feature}:${attempt}`,checkpointKey:`${key}:${REPAIR_VERSION}:${feature}:${attempt}`,
      canPersist,beforePaid:()=>{if(!canPersist())throw Object.assign(Error('Processing permission or source changed'),{code:'RIGHTS_REVOKED'});},
      claimReviewer:pipeline.claimReviewer?(v,t)=>pipeline.claimReviewer(v,t,key):null,
      signal:AbortSignal.timeout(180000)};
    const generated=await (feature==='brief'?generateLongFormIntelligence(options):generateEpisodeIntelligence(options));
    if(!canPersist())throw Object.assign(Error('Processing permission or source changed'),{code:'RIGHTS_REVOKED'});
    const checks=validateClaims(generated,source);
    const candidate=feature==='brief'?generated.brief:generated.chapters?.[0];
    if(!candidate || ['extractive','verified_partial'].includes(candidate.mode) || !checks.complete)
      return save({state:'QUEUED',activeFeature:null,features:{...state.features,[feature]:{state:'REJECTED',code:'OUTPUT_VALIDATION_FAILED',attempt,failures:(generated.claimGrounding?.claims||checks.claims).filter(c=>!c.supported).map(({id,reason})=>({id,reason})),nextAction:'Review unsupported claims against the stored source; completed features remain available.'}}});
    job=pipeline.store.get('intelligence',key);
    const prefix=feature==='brief'?'brief.':feature+'.';
    const merged=feature==='brief'?{...job,brief:candidate}:{...job,chapters:job.chapters.map((c,i)=>i===Number(feature.split('.')[1])?candidate:c)};
    const generatedClaims=claimsForResult(generated),supported=new Set(checks.claims.filter(c=>c.supported).map(c=>c.id));
    const reviews=(job.claimReview?.claims||[]).filter(c=>!c.id.startsWith(prefix));
    for(const claim of claimsForResult(merged).filter(c=>c.id.startsWith(prefix))) {
      const original=generatedClaims.find(c=>supported.has(c.id)&&c.text===claim.text&&c.label===claim.label&&JSON.stringify(c.sourceSegmentIds)===JSON.stringify(claim.sourceSegmentIds));
      const review=original&&generated.claimReview?.claims.find(c=>c.id===original.id&&c.binding===claimBinding(original,source));
      if(review)reviews.push({...review,id:claim.id,binding:claimBinding(claim,job.transcript)});
    }
    merged.claimReview={version:GROUNDING_VERSION,claims:reviews};
    if(feature==='brief')merged.validationFailures=(job.validationFailures||[]).filter(f=>f.feature!=='brief');
    merged.featuresUpdatedAt=new Date().toISOString();merged.processingVersion=PROCESSING_VERSION;
    pipeline.store.transaction(()=>{
      if(!canPersist())throw Error('Source changed before feature publication');
      pipeline.store.set('intelligence',key,merged);
      const delivered=pipeline.deliver(merged,key);
      if(delivered.state==='READY')pipeline.store.set('intelligence',key,{...delivered,partialResult:false,qualityNote:null});
      save({state:'QUEUED',activeFeature:null,features:{...state.features,[feature]:{state:'READY',attempt,completedAt:new Date().toISOString()}}});
    });
  } catch(error) {
    const waiting=error.code==='BUDGET_LIMIT';
    save({state:waiting?'WAITING_FOR_CAPACITY':'QUEUED',activeFeature:null,features:{...state.features,[feature]:{state:waiting?'WAITING_FOR_CAPACITY':'FAILED',attempt,code:error.code||'FEATURE_REPAIR_FAILED',reason:error.message,resumeAfter:error.capacity?.resumeAfter||null,nextAction:waiting?'Saved generation checkpoints resume when capacity returns.':'Inspect the saved request outcome before another paid attempt.'}}});
  }
  return state;
}
