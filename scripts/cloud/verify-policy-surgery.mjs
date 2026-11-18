// Protected, bounded production evidence. No grants, policy changes or paid work.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { verifyAwsIdentity } from '../aws-account-guard.mjs';

verifyAwsIdentity();
const connection = JSON.parse(readFileSync('.starcast/cloud-connection.json', 'utf8'));
const admin = JSON.parse(readFileSync('.starcast/cloud-admin.json', 'utf8'));
assert.equal(connection.url, 'https://d3ri12f40b85i3.cloudfront.net');
const request = async (path, body) => {
  const response = await fetch(connection.url + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-star-cast-dev-token': connection.token, 'x-star-cast-admin-token': admin.token },
    ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.status, 200, path);
  return response.json();
};
const before = await request('/api/admin/intelligence');
const targets = JSON.parse(readFileSync('evals/radiostar-universal-eligibility.json', 'utf8')).episodes;
assert.equal(targets.length, 6);
const episodes = [];
for (const target of targets) {
  const { feedUrl, episodeId } = target;
  if (process.argv.includes('--assess')) await request('/api/admin/rights/assess', {feedUrl, episodeId});
  const query = new URLSearchParams({feedUrl, episodeId});
  const detail = await request('/api/admin/episodes/detail?' + query);
  const review = await request('/api/admin/rights/review?' + query);
  const e=detail.episode, r=review;
  episodes.push({feedUrl,episodeId,podcast:detail.podcast.title,title:e.title,canonicalEpisodeId:e.canonicalEpisodeId,duration:e.duration,publishedAt:e.publishedAt,
    operationalPolicy:e.operationalPolicy,processingEligibility:e.processingEligibility,state:e.state,code:e.code,transcript:e.transcript,adSkip:e.adSkip,
    activities:detail.activityAssessment,executionDecision:e.executionDecision || null,decisionRequests:detail.decisionRequests || [],
    history:detail.processingHistory.map(({jobId,state,code})=>({jobId,state,code})),
    effectiveRecord:{id:r.record.id,scope:r.record.episodeId?'episode':'channel',source:r.record.assessmentSource,version:r.record.version,evidence:r.evidence,rightsReserved:r.record.rightsReserved,reservedFeatures:r.record.reservedFeatures},nextAction:e.action});
}
const followed = await request('/api/admin/intelligence/followed');
const after = await request('/api/admin/intelligence');
assert.deepEqual(after.controls, before.controls, 'No changes to spending controls');
const report = {
  at: new Date().toISOString(), account: '208096650030', region: 'eu-west-2',
  assessmentRequested: process.argv.includes('--assess'), episodes,
  controls: after.controls, totals: after.totals,
  newUsageEntries: after.usage.length - before.usage.length,
  followed:{snapshot:followed.snapshot,counts:followed.counts,uniqueEpisodes:followed.uniqueEpisodes,totalRows:followed.totalRows,
    rows:(followed.rows || []).map(({feedUrl,episodeId,title,state,code,eligible})=>({feedUrl,episodeId,title,state,code,eligible}))},
  newJobs: after.jobs.filter(job => !before.jobs.some(prior => prior.jobId === job.jobId)).map(({jobId,state})=>({jobId,state})),
};
const out = process.argv.includes('--after') ? 'evals/policy-surgery-after.json' : 'evals/policy-surgery-before.json';
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({out, episodes: episodes.map(({title,state,code}) => ({title,state,code})), followed:{counts:report.followed.counts,uniqueEpisodes:report.followed.uniqueEpisodes},controls:report.controls, totals:report.totals, newUsageEntries:report.newUsageEntries}));
