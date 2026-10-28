import assert from 'node:assert/strict';
import { LocalStore } from './persistence.mjs';
import { RightsRegistry } from './rights-registry.mjs';
import { IntelligencePolicyRegistry } from './intelligence-policy.mjs';
const store = new LocalStore(':memory:');
const rights = new RightsRegistry(store), operational = new IntelligencePolicyRegistry(store);
const feedUrl = 'https://owned.example/gate-regression.xml';
const query = (episodeId, feature = 'intelligence-processing') => rights.evaluate({feedUrl, episodeId, feature});
try {
  const old = rights.set({feedUrl, episodeId:'missing', classification:'RESTRICTED', blockerCode:'LEGAL_BASIS_NOT_ESTABLISHED', assessmentSource:'super-admin-technical-review', assessmentEvidence:[{type:'EVIDENCE_REVIEW_NO_BASIS', source:'previous reviewer', value:'No evidence available at that time'}]});
  assert.equal(query('missing').allowed, false);
  rights.set({feedUrl, classification:'LICENSED', assessmentStatus:'APPROVED', explicitAuthorisation:true, legalBasis:'Owned fixture channel permission', assessmentEvidence:[{type:'CREATOR_AUTHORISATION', source:'fixture creator', value:'All fixture episodes and internal processing'}], canProcessForAi:true, canRetain:true, canAcquireTranscript:true, canTranscribeAudio:true, canDisplayDerivedIntelligence:true});
  assert.equal(query('missing').allowed, true, 'A historical no-evidence finding must not mask documented channel permission');
  assert.equal(store.get('rights', old.id).blockerCode, 'LEGAL_BASIS_NOT_ESTABLISHED', 'Historical finding is preserved');
  assert.equal(query('missing','captions').allowed, false);
  assert.equal(query('missing','dubbing-audio').allowed, false);
  for (const [id, extra] of Object.entries({
    held: {reservedFeatures:['intelligence-processing']},
    disputed: {classification:'DISPUTED'},
    suspended: {suspendedAt:'2026-01-01T00:00:00Z'},
    human: {assessmentSource:'human-review'},
  })) {
    rights.set({...old, episodeId:id, ...extra});
    assert.equal(query(id).allowed, false, `${id} is not an administrative missing-record gate`);
  }
  rights.set({...old, episodeId:'distribution', assessmentSource:'publisher-rss-v4', reservedFeatures:['transcript-distribution','captions']});
  assert.equal(query('distribution').allowed, true);
  assert.equal(query('distribution','captions').code, 'SCOPED_PUBLISHER_RESTRICTION');
  assert.equal(query('distribution','transcript-distribution').allowed, false);
  assert.equal(operational.global().tier, 'ZERO');
  rights.assessment(feedUrl,'missing');
  assert.equal(operational.records().length, 0, 'Risk assessment cannot create operational policies');
} finally {store.close();}
console.log('Channel inheritance recovers factual missing-evidence findings; scoped reservations, independent outputs and human holds remain enforced.');
