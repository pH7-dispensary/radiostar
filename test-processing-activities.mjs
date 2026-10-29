import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStore } from './persistence.mjs';
import { createStarCastServer } from './server.mjs';
import { assessProcessingActivities } from './rights-assessment.mjs';

const dir = mkdtempSync(join(tmpdir(), 'radiostar-activities-'));
const path = join(dir, 'test.sqlite');
const feedUrl = 'https://publisher.example/activities.xml';
const episodeId = 'new-episode';
const xml = '<rss><channel><title>Activity fixture</title><item><guid>new-episode</guid><title>Episode</title><itunes:duration>4:00:00</itunes:duration><enclosure url="https://publisher.example/audio.mp3"/></item></channel></rss>';
const app = createStarCastServer({store: new LocalStore(path), env: {AWS_REGION:'eu-west-2', STARCAST_ADMIN_TOKEN:'test-admin', STARCAST_DEV_INTELLIGENCE_TOKEN:'test-device'}, fetchFeed: async () => xml});
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const headers = {'content-type':'application/json','x-star-cast-dev-token':'test-device','x-star-cast-admin-token':'test-admin'};
const query = new URLSearchParams({feedUrl,episodeId});
const assess = async () => {
  const res = await fetch(base+'/api/admin/rights/assess',{method:'POST',headers,body:JSON.stringify({feedUrl,episodeId})});
  assert.equal(res.status,200);return res.json();
};
const review = async () => (await (await fetch(base+'/api/admin/rights/review?'+query,{headers})).json()).activityAssessment;
const observations = () => app.store.all('rights-audit').filter(([,r])=>r.action==='processing-activities-assessed');
try {
  assert.equal((await fetch(base+'/api/admin/rights/review?'+query)).status,403);
  assert.equal((await fetch(base+'/api/admin/rights/assess',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({feedUrl,episodeId})})).status,403);
  await assess();
  let result = await review();
  assert.equal(result.executionJurisdiction,'GB');
  assert.equal(result.operatorJurisdiction,'NOT_INFERRED_FROM_SERVER_REGION');
  assert.equal(result.decisions['bounded-audio-analysis'].code,'LEGAL_BASIS_NOT_ESTABLISHED');
  assert.equal(result.decisions['internal-transcription'].allowed,false);
  assert(result.evidence.length && result.statutoryConsiderations.length===3);
  assert.equal(result.permissionsChanged,false);
  assert.equal(result.decisionScope,'rights-only');
  assert.equal(result.decisions['bounded-audio-analysis'].maximumAcquiredBytes,8*1024*1024);
  await Promise.all([assess(),assess()]);
  assert.equal(observations().length,1,'unchanged concurrent assessments do not duplicate observations');
  assert.equal(app.store.all('rights-activity-assessment').length,1);
  assert.equal(app.store.all('intelligence').length,0,'assessment does not start paid work');

  const channel = app.rights.set({feedUrl,classification:'LICENSED',assessmentStatus:'APPROVED',explicitAuthorisation:true,legalBasis:'Owned test fixture permission',canProcessForAi:true,canRetain:true,canTranscribeAudio:true,canDetectAdvertisements:true,canDisplayDerivedIntelligence:true,assessmentEvidence:[{type:'OWNED',source:'test-fixture',scope:'channel',value:'Owned synthetic audio and future episodes'}]});
  await assess();result = await review();
  assert.equal(result.scope,'channel');
  assert.equal(result.recordId,channel.id);
  assert(result.publisherEvidence.some(row=>row.type==='LAWFUL_ACCESS_OBSERVED'),'fresh publisher observations survive a preserved channel record');
  assert(result.evidence.some(row=>row.type==='OWNED'),'effective channel permission evidence remains separate');
  for (const key of ['bounded-audio-analysis','bounded-audio-transcription','internal-transcription','internal-ai-analysis','displayed-intelligence','advertisement-detection','automatic-ad-skip']) {
    assert.equal(result.decisions[key].allowed,true,key);
    assert.equal(result.decisions[key].basisEstablished,true,key);
  }
  for (const key of ['public-transcript-distribution','playback-captions','translation','dubbing','voice-replication']) assert.equal(result.decisions[key].allowed,false,key);
  assert.equal(observations().length,2,'new channel evidence records a new observation without episode approval');
  assert.equal(app.rights.resolve(feedUrl,episodeId).id,channel.id);
  assert.equal(assessProcessingActivities({rights:app.rights,feedUrl,episodeId,deploymentRegion:'us-east-1'}).executionJurisdiction,'UNESTABLISHED');

  // Reads must reflect policy changes immediately, even before a fresh observation.
  app.rights.setPolicy({mode:'OFF',features:{intelligenceDisplay:false}});
  result = await review();
  assert.equal(result.decisions['displayed-intelligence'].code,'POLICY_FEATURE_DISABLED');
  assert.equal(result.decisions['internal-transcription'].allowed,true);
  const detailResponse = await fetch(base+'/api/admin/episodes/detail?'+query,{headers});
  assert.equal(detailResponse.status,200);
  assert.equal((await detailResponse.json()).activityAssessment.decisions['displayed-intelligence'].code,'POLICY_FEATURE_DISABLED');
  await assess();assert.equal(observations().length,3);
  app.rights.set({...channel,episodeId:undefined,reservedFeatures:['ad-detection'],assessmentEvidence:[...channel.assessmentEvidence,{type:'RESERVATION',source:'publisher-fixture',value:'No advertisement analysis'}]});
  result=await review();
  assert.equal(result.decisions['bounded-audio-analysis'].code,'SCOPED_PUBLISHER_RESTRICTION');
  assert.equal(result.decisions['bounded-audio-transcription'].allowed,false);
  assert(result.evidence.some(x=>x.type==='RESERVATION'));
  app.rights.suspend(feedUrl,'','Test takedown');
  await assess();result=await review();
  assert(Object.values(result.decisions).every(x=>!x.allowed));
  assert.equal(result.decisions['automatic-ad-skip'].code,'TAKEDOWN_OR_SUSPENSION');
  const saved=app.store.all('rights-activity-assessment');
  await new Promise(resolve=>app.server.close(resolve));app.store.close();
  const reopened=new LocalStore(path);
  assert.deepEqual(reopened.all('rights-activity-assessment'),saved,'observations persist across process restart');
  assert.equal(reopened.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  reopened.close();
} finally {
  if (app.server.listening) {await new Promise(resolve=>app.server.close(resolve));app.store.close();}
  rmSync(dir,{recursive:true,force:true});
}
console.log('Activity assessment: authenticated API, channel reuse, no grants, feature separation, concurrent deduplication, immediate policy, mandatory restrictions and restart persistence passed');
