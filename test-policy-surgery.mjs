import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalStore} from './persistence.mjs';
import {RightsRegistry} from './rights-registry.mjs';
import {IntelligencePolicyRegistry} from './intelligence-policy.mjs';
import {assessPublisherRights,publisherRightsEvidence,assessProcessingActivities,recordProcessingDecisionRequest} from './rights-assessment.mjs';
import {EpisodePipeline,episodeKey,recoverableTechnicalJob} from './episode-pipeline.mjs';
import {BudgetLedger} from './openai-intelligence.mjs';
import {FollowedPreparation} from './followed-preparation.mjs';
import {IntelligenceTestMode} from './intelligence-test-mode.mjs';
import {assessTranscript} from './transcripts.mjs';

const dir=mkdtempSync(join(tmpdir(),'radiostar-policy-surgery-')),path=join(dir,'test.sqlite');
const store=new LocalStore(path),rights=new RightsRegistry(store),policy=new IntelligencePolicyRegistry(store),ledger=new BudgetLedger({enabled:true},store);
const feed='https://owned.example/policy.xml',queue=[],episodes=new Map();
let textCalls=0,audioCalls=0,publisherCalls=0,adInspections=0;
const speech='Original fixture speech about reliable podcast analysis and careful source references explains the distinction between evidence and presentation. This source is owned by the test author.';
const transcript={segments:[{id:'s1',startMs:0,endMs:60000,text:speech}],transcriptVersion:'owned-v1',sourceType:'publisher_rss',sourceUri:'https://owned.example/transcript.vtt'};
transcript.quality=assessTranscript(transcript);
const pipeline=new EpisodePipeline({store,rights,intelligencePolicy:policy,ledger,enabled:true,configured:true,audioEnabled:true,
  queue:{enqueue:async job=>queue.push(job)},resolveEpisode:async(_feed,id)=>{if(!episodes.has(id))throw Error('Publisher unavailable');return episodes.get(id);},
  fetchTranscript:async()=>{publisherCalls++;return transcript;},
  audioFactory:async url=>({durationMs:60000,contentHash:createHash('sha256').update(url).digest('hex'),chunkFactory:async()=>Buffer.from('owned test audio'),cleanup:async()=>{}}),
  onTranscriptReady:async()=>{adInspections++;},
  client:{audio:{transcriptions:{create:async()=>{audioCalls++;return {segments:[{start:0,end:60,text:speech}]};}}},responses:{create:async()=>{textCalls++;return {output_text:JSON.stringify({overview:speech,detail:speech,themes:['Evidence'],sourceSegmentIndexes:[1],chapters:[{title:'Evidence',description:speech,sourceSegmentIndexes:[1]}]}),usage:{input_tokens:100,output_tokens:100}};}}},
});
const episode=id=>{const value={id,title:id,showName:'Owned fixture',audioUrl:`https://owned.example/${id}.mp3`,duration:'60',publishedAt:'2026-01-01T00:00:00Z',refs:[]};episodes.set(id,value);return value;};
const grant=(extra={})=>rights.set({feedUrl:feed,classification:'LICENSED',assessmentStatus:'APPROVED',explicitAuthorisation:true,legalBasis:'Owned synthetic fixture, internal analysis and bounded derived results',assessmentEvidence:[{type:'OWNED',source:'test author',scope:'podcast',value:'Original synthetic regression content'}],canProcessForAi:true,canRetain:true,canTranscribeAudio:true,canAcquireTranscript:true,canDisplayDerivedIntelligence:true,...extra});
const assess=(id,xml='',target=feed)=>rights.assessAutomatic({feedUrl:target,episodeId:id,...assessPublisherRights({feedUrl:target,evidence:publisherRightsEvidence({feedUrl:target,channelXml:xml})})});
const request=id=>pipeline.request({feedUrl:feed,episodeId:id,trigger:'automatic',platformProcessing:true,allowAudio:true});
const execute=async()=>{for(const job of queue.splice(0)){await pipeline.executeQueued(job);await pipeline.executeQueued(job);}};
const cached=id=>store.set('audio-transcript',createHash('sha256').update(episode(id).audioUrl).digest('hex'),transcript);
const rows=[];
try {
  episode('missing');assess('missing');
  assert.equal((await request('missing')).code,'LEGAL_BASIS_NOT_ESTABLISHED');
  rows.push('No assessment: automatic evidence evaluation, no fictional permission');
  episode('copyright');const generic=assess('copyright','<copyright>All rights reserved.</copyright>');
  assert.equal(generic.record.rightsReserved,false);assert.equal((await request('copyright')).code,'LEGAL_BASIS_NOT_ESTABLISHED');
  rows.push('Generic copyright: no invented publisher prohibition');
  const explicitFeed='https://owned.example/restricted.xml';
  assess('explicit','<podcast:license url="https://creativecommons.org/licenses/by/4.0/"/><rights>Do not transcribe</rights>',explicitFeed);
  assert.equal(rights.evaluate({feature:'audio-transcription',feedUrl:explicitFeed,episodeId:'explicit'}).code,'SCOPED_PUBLISHER_RESTRICTION');
  assert(rights.evaluate({feature:'intelligence-processing',feedUrl:explicitFeed,episodeId:'explicit'}).allowed);
  rows.push('Explicit transcription restriction: analysis remains independently permitted');
  // Reproduce the former general-analysis prerequisite on channel ad grants.
  grant({canProcessForAi:false,canTranscribeAudio:false,canDetectAdvertisements:true});
  assert(rights.evaluate({feature:'ad-detection',feedUrl:feed,episodeId:'missing'}).allowed);
  assert.equal((await request('missing')).code,'FEATURE_NOT_AUTHORISED');
  assert.equal(pipeline.status(feed,'missing'),null);
  rows.push('Ad-only channel basis inherited without a full transcript or general analysis');
  grant();cached('missing');await request('missing');await execute();
  assert.equal(pipeline.status(feed,'missing').state,'READY');
  rows.push('Documented channel basis automatically resolves historical missing assessment');
  cached('episode-grant');grant({episodeId:'episode-grant'});await request('episode-grant');await execute();assert.equal(pipeline.status(feed,'episode-grant').state,'READY');
  rows.push('Episode authorisation reaches actual READY');
  cached('exception');grant({episodeId:'exception',classification:'TDM_ELIGIBLE',explicitAuthorisation:false,assessmentEvidence:[{type:'APPLICABLE_EXCEPTION',source:'owned-test reviewer',value:'Synthetic jurisdiction and activity-specific exception fixture'}]});
  rights.setOverride({feedUrl:feed,episodeId:'exception',mode:'LITE'});await request('exception');await execute();assert.equal(pipeline.status(feed,'exception').state,'READY');
  rows.push('Documented applicable exception reused without a newer approval form');
  cached('public-only');grant({episodeId:'public-only',reservedFeatures:['transcript-distribution','captions']});await request('public-only');await execute();assert.equal(pipeline.status(feed,'public-only').state,'READY');
  for(const feature of ['transcript-distribution','captions','translation-text','dubbing-audio','voice-cloning'])assert.equal(rights.evaluate({feedUrl:feed,episodeId:'public-only',feature}).allowed,false);
  rows.push('Public transcript restriction preserves internal processing and separate output gates');
  cached('paused');policy.set({feedUrl:feed,episodeId:'paused',tier:'HIGH',reason:'Human fixture pause'});
  assert.equal((await request('paused')).code,'INTELLIGENCE_POLICY_HIGH');
  const contract=pipeline.executionDecision(feed,'paused');assert(contract.processingBasis.allowed);assert.equal(contract.operationalPolicy.allowed,false);
  rows.push('Human operational pause remains independent of valid rights');
  const advisory=rights.assessment(feed,'copyright').advisories;
  assert(advisory.every(row=>row.blocking===false));assert.equal(policy.effective(feed).tier,'ZERO');
  rows.push('Risk advisory cannot change operational OPEN');
  // Only the source's required activity is checked. A denied publisher fetch
  // must not prohibit cached text or an independently licensed audio fallback.
  cached('cache-no-acquire');grant({episodeId:'cache-no-acquire',canAcquireTranscript:false});
  const beforeAudio=audioCalls;await request('cache-no-acquire');await execute();assert.equal(pipeline.status(feed,'cache-no-acquire').state,'READY');assert.equal(audioCalls,beforeAudio);
  rows.push('Matching transcript cache reused before unnecessary acquisition permission');
  episode('audio-no-acquire');grant({episodeId:'audio-no-acquire',canAcquireTranscript:false});
  await request('audio-no-acquire');await execute();assert.equal(pipeline.status(feed,'audio-no-acquire').state,'READY');assert.equal(audioCalls,beforeAudio+1);
  assert.equal(publisherCalls,0);assert(adInspections>0);
  rows.push('Missing transcript invokes authorised audio fallback without unrelated fetch grant');
  // A revoked or expired prior decision is evidence history, not a lifetime lock.
  cached('expired');store.set('intelligence',episodeKey(feed,'expired'),{feedUrl:feed,episodeId:'expired',jobId:'historical-expired',state:'BLOCKED',code:'APPROVAL_EXPIRED',attempts:2,retryable:false});
  await request('expired');await execute();assert.equal(pipeline.status(feed,'expired').state,'READY');assert.equal(store.get('intelligence-history','historical-expired').code,'APPROVAL_EXPIRED');
  rows.push('Expired historical refusal recovers when current scope is valid; history retained');
  assert(recoverableTechnicalJob({state:'FAILED',code:'TIMEOUT',retryable:true}));
  assert(!recoverableTechnicalJob({state:'FAILED',code:'PROVIDER_OUTCOME_UNKNOWN',retryable:true}));
  // Fresh publisher evidence resolves only the assessor's own reservation.
  const reservationFeed='https://owned.example/changed.xml';
  assess('changed','<rights>No AI</rights>',reservationFeed);
  assess('changed','<podcast:license url="https://creativecommons.org/licenses/by/4.0/"/>',reservationFeed);
  assert(rights.evaluate({feature:'intelligence-processing',feedUrl:reservationFeed,episodeId:'changed'}).allowed);
  rights.suspend(reservationFeed,'changed','Human takedown');assess('changed','<podcast:license url="https://creativecommons.org/licenses/by/4.0/"/>',reservationFeed);
  assert.equal(rights.evaluate({feature:'intelligence-processing',feedUrl:reservationFeed,episodeId:'changed'}).code,'TAKEDOWN_OR_SUSPENSION');

  const testingMode=new IntelligenceTestMode(store);
  store.set('installation','user',{id:'user'});store.set('follow','follow',{owner:'user',feedUrl:feed});
  episode('follow-one');episode('follow-two');episode('follow-three');
  const prep=new FollowedPreparation({store,pipeline,ledger,rights,testingMode,discover:async()=>['follow-one','follow-two','follow-three'].map(id=>episodes.get(id)),assess:async(_feed,id)=>({episode:episodes.get(id)}),enabled:()=>true,allowed:()=>true,inspect:()=>{adInspections++;}});
  await prep.refresh({force:true});
  for(const row of prep.rows())prep.put({...row,eligible:false,state:'REVIEW_REQUIRED',code:'LEGAL_BASIS_NOT_ESTABLISHED',retryAfter:new Date(Date.now()+3600000).toISOString()});
  assert.equal(prep.summary().counts.REVIEW_REQUIRED,undefined,'read projection uses current eligibility');
  const beforeText=textCalls;
  await Promise.all([prep.drain(),prep.drain()]);await execute();await prep.drain();await execute();
  assert.equal(prep.summary().counts.READY,3);assert.equal(textCalls,beforeText+3);await prep.drain();assert.equal(queue.length,0);
  rows.push('Duplicate follows: latest three hand off exactly once; changed evidence bypasses old backoff');
  // An outage persists retryable demand, never a rights or operational pause.
  const outageRow={...prep.rows()[0],episodeId:'outage',key:episodeKey(feed,'outage'),sourceNeedsRefresh:true};prep.put(outageRow);
  const originalAssess=prep.assess;prep.assess=async(_feed,id)=>{if(id==='outage')throw Error('Publisher timeout');return originalAssess(_feed,id);};
  await prep.drain();assert.equal(store.get('followed-demand',outageRow.key).state,'WAITING');assert.equal(policy.effective(feed).tier,'ZERO');
  rows.push('Publisher outage: durable technical wait, operational OPEN preserved');
  episode('provider-offline');pipeline.configured=false;
  const offline=await request('provider-offline');assert.equal(offline.code,'SERVER_UNAVAILABLE');assert.equal(offline.retryable,true);
  assert.equal(policy.effective(feed).tier,'ZERO');pipeline.configured=true;
  // Budget exhaustion holds work durably without paying; rollover recovers it.
  episode('budget');ledger.reserve({id:'fixture-budget',usd:ledger.controls.dailyUsd-ledger.totals().day});
  const budgetDecision=pipeline.executionDecision(feed,'budget',{episode:episodes.get('budget')});assert.equal(budgetDecision.technicalReadiness.budgetAvailable,false);assert(budgetDecision.processingBasis.allowed);
  const beforeBudgetAudio=audioCalls;await request('budget');await execute();assert.equal(pipeline.status(feed,'budget').code,'BUDGET_LIMIT');assert.equal(audioCalls,beforeBudgetAudio);
  ledger.reconcile('fixture-budget',{usd:0});const held=pipeline.status(feed,'budget');store.set('intelligence',episodeKey(feed,'budget'),{...held,resumeAfter:new Date(0).toISOString()});await request('budget');await execute();assert.equal(pipeline.status(feed,'budget').state,'READY');
  rows.push('Budget wait survives and resumes under unchanged atomic limits');

  const unresolved='https://owned.example/no-basis.xml';
  for(const id of ['one','two','three']){assess(id,'<copyright>All rights reserved</copyright>',unresolved);recordProcessingDecisionRequest({rights,feedUrl:unresolved,episodeId:id,assessment:assessProcessingActivities({rights,feedUrl:unresolved,episodeId:id,deploymentRegion:'eu-west-2'})});}
  assert.equal(store.all('rights-decision-request').length,1,'one precise channel decision request, not per-episode approval requests');
  const decisionRequest=store.all('rights-decision-request')[0][1];assert.equal(decisionRequest.episodeIds.length,3);
  const audits=store.all('rights-audit').length;
  recordProcessingDecisionRequest({rights,feedUrl:unresolved,episodeId:'three',assessment:assessProcessingActivities({rights,feedUrl:unresolved,episodeId:'three',deploymentRegion:'eu-west-2'})});assert.equal(store.all('rights-audit').length,audits,'unchanged legal question is not reissued');
  grant({feedUrl:unresolved});recordProcessingDecisionRequest({rights,feedUrl:unresolved,episodeId:'three',assessment:assessProcessingActivities({rights,feedUrl:unresolved,episodeId:'three',deploymentRegion:'eu-west-2'})});assert.equal(store.all('rights-decision-request')[0][1].status,'RESOLVED');
  assert.equal(store.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  store.close();const reopened=new LocalStore(path);assert.equal(reopened.get('rights-decision-request',decisionRequest.id).status,'RESOLVED');assert.equal(reopened.get('intelligence',episodeKey(feed,'budget')).state,'READY');reopened.close();
  console.log(JSON.stringify({passed:true,cases:rows,provider:'mocked paid boundary only; real registry, pipeline, queue delivery and SQLite',newRealModelCalls:0}));
} finally {try{store.close();}catch{}rmSync(dir,{recursive:true,force:true});}
