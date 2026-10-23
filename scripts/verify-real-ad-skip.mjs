// Explicit live playback QA of ALREADY authorised/processed content. Never
// approves rights or starts a paid job. Historical labels are not automatically
// promoted to current-variant accuracy ground truth. No physical-iPhone claim.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, unlinkSync, rmdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { verifyAwsIdentity } from './aws-account-guard.mjs';
import { downloadPublicAudio } from '../safe-network.mjs';
import { verifyAudioRanges } from '../native/src/verifiedAudioRanges.mjs';
import { episodeKey } from '../episode-pipeline.mjs';

assert(process.argv.includes('--play'), 'Requires explicit --play and a reviewed evaluation JSON path');
const spec = JSON.parse(readFileSync(process.argv[process.argv.indexOf('--play') + 1]));
assert(spec.labelSource?.startsWith('https://') && spec.labels?.length > 0);
for (const row of spec.labels) assert(row.startMs >= 0 && row.endMs > row.startMs);
verifyAwsIdentity();
const c = JSON.parse(readFileSync('.starcast/cloud-connection.json'));
const a = JSON.parse(readFileSync('.starcast/cloud-admin.json'));
assert.equal(c.url, 'https://d3ri12f40b85i3.cloudfront.net');
const adminHeaders = { 'content-type': 'application/json', 'x-star-cast-dev-token': c.token };
const login = await fetch(c.url + '/api/admin/session', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ adminToken: a.token }) });
assert.equal(login.status, 201);
const cookies = login.headers.getSetCookie().map(x => x.split(';')[0]);
adminHeaders.cookie = cookies.join('; ');
adminHeaders['x-star-cast-csrf'] = decodeURIComponent(cookies.find(x => x.startsWith('starcast_admin_csrf=')).split('=').slice(1).join('='));
async function api(path, input, headers = adminHeaders) {
  const r = await fetch(c.url + path, { method: input ? 'POST' : 'GET', headers, body: input ? JSON.stringify(input) : undefined, signal: AbortSignal.timeout(30000) });
  const data = await r.json(); assert(r.ok, `${path}: ${r.status}: ${data.error || 'Request failed'}`); return data;
}
const identity = { feedUrl: spec.feedUrl, episodeId: spec.episodeId };
let browser, server, temporary, deviceId, original, configuredVersion;
const playback = [], staged = [];
try {
  original = (await api('/api/admin/intelligence/testing')).configuration;
  assert(original.active && original.adSkipPilotEnabled, 'Do not activate or extend a pilot');
  const operations = await api('/api/admin/ad-skip');
  const verification = operations.verification.find(v => v.episodeKey === episodeKey(spec.feedUrl, spec.episodeId));
  assert.equal(verification?.state, 'READY');
  assert(operations.intervals.some(v => v.episodeKey === verification.episodeKey && v.type === 'advert' && v.boundaryVerified && v.verificationState === 'VERIFIED' && !v.disputed), 'No independently verified interval: do not enrol a QA listener');
  const manifest = verification.variant;
  assert(manifest?.audioVariantFingerprint && manifest.contentLength > 0);
  // This test uses the same bounded exact-file fallback as native when playing
  // a Blob. It does not claim AVPlayer conditional streaming has been verified.
  assert(manifest.contentLength <= 32 * 1024 * 1024, 'Use on-device range testing for larger playback');
  temporary = mkdtempSync(join(tmpdir(), 'radiostar-real-ad-'));
  await downloadPublicAudio(spec.audioUrl, join(temporary, 'audio.mp3'), 32 * 1024 * 1024);
  const audio = readFileSync(join(temporary, 'audio.mp3'));
  assert.equal(audio.length, manifest.contentLength);
  assert.equal(createHash('sha256').update(audio).digest('hex'), manifest.audioVariantFingerprint, 'Current publisher bytes must match the independently verified variant');
  let rangeProof;
  try {
    await verifyAudioRanges(manifest, { nonce: randomUUID(), digest: async bytes => createHash('sha256').update(Buffer.from(bytes)).digest('hex') });
    rangeProof = { verified: true, witnessBytes: manifest.windows.reduce((n, w) => n + w.end - w.start + 1, 0) };
  } catch (error) { rangeProof = { verified: false, code: error.message, fallback: 'bounded exact-file SHA-256' }; }
  const invite = await api('/api/admin/pilot/invites', { label: 'Phase 4 real-audio playback QA — temporary', maxUses: 1, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const enrollment = await api('/api/pilot/enroll', { code: invite.code }, { 'content-type': 'application/json' });
  deviceId = createHash('sha256').update(enrollment.token).digest('hex');
  const credential = randomBytes(32).toString('hex');
  const auth = { 'content-type': 'application/json', 'x-star-cast-pilot-token': enrollment.token, authorization: `Bearer ${credential}` };
  await api('/api/listener/register', { credential }, auth);
  const listenerId = (await api('/api/admin/pilot/invites')).devices.find(x => x.id === deviceId)?.listenerId;
  assert(listenerId);
  await api('/api/listener/preferences', { adSkipEnabled: true, advert: true }, auth);
  const input = { ...identity, audioUrl: spec.audioUrl, audioVariantFingerprint: manifest.audioVariantFingerprint };
  assert.equal((await api('/api/skips/status', input, auth)).automaticSkipping, false, 'Ordinary enrolment is not pilot membership');
  const configured = await api('/api/admin/intelligence/testing', { enabled: true, adSkipPilotEnabled: true, listenerIds: [...original.listenerIds, listenerId], expiresAt: original.expiresAt, expectedVersion: original.version, confirmation: 'ENABLE TESTING', reason: 'Temporary real-audio QA; preserve limits and expiry, restore tester list in finally.' });
  configuredVersion = configured.configuration.version;
  const status = await api('/api/skips/status', input, auth);
  assert(status.automaticSkipping && status.activeIntervals.length > 0);
  for (const interval of status.activeIntervals) assert(spec.labels.some(label => interval.startMs >= label.startMs && interval.endMs <= label.endMs), 'Never test a skip outside independently reported ad regions');
  assert.equal((await api('/api/skips/status', { ...input, audioVariantFingerprint: '0'.repeat(64) }, auth)).automaticSkipping, false);
  const { chromium } = await import(process.env.RADIOSTAR_PLAYWRIGHT_MODULE || 'playwright');
  server = createServer((req, res) => {
    if (req.url === '/adapter.mjs') { res.setHeader('content-type', 'text/javascript'); return res.end(readFileSync('native/src/adSkipExecution.mjs')); }
    if (req.url === '/audio.mp3') { res.setHeader('content-type', 'audio/mpeg'); return res.end(audio); }
    res.setHeader('content-type', 'text/html'); res.end('<title>Radio Star real-audio QA</title><audio controls></audio>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.exposeFunction('authorise', row => api('/api/skips/authorise', { ...input, ...row }, auth));
  await page.exposeFunction('receipt', row => { const pending = api('/api/skips/events', { ...input, eventId: randomUUID(), ...row }, auth); pending.catch(() => {}); staged.push(pending); return pending; });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  for (const interval of status.activeIntervals) {
    const result = await page.evaluate(async ({ interval, hash }) => {
      const { executeVerifiedSkip } = await import('/adapter.mjs');
      const bytes = await (await fetch('/audio.mp3')).arrayBuffer();
      const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
      if (actual !== hash) throw Error('Played bytes differ');
      const audio = document.querySelector('audio');
      const uri = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' })); audio.src = uri;
      await new Promise((resolve, reject) => { audio.onloadedmetadata = resolve; audio.onerror = reject; });
      const seek = target => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Seek timed out')), 3000); audio.addEventListener('seeked', () => { clearTimeout(timer); resolve(audio.currentTime * 1000); }, { once: true }); audio.currentTime = target / 1000; });
      await seek(interval.startMs - 300); audio.playbackRate = 1.5; await audio.play();
      await new Promise(resolve => { const tick = () => audio.currentTime * 1000 >= interval.startMs ? resolve() : setTimeout(tick, 10); tick(); });
      const before = audio.currentTime * 1000;
      await window.receipt({ intervalId: interval.id, kind: 'skip_requested', positionMs: before });
      let result;
      try {
        result = await executeVerifiedSkip({ interval, positionMs: before, durationMs: audio.duration * 1000, getPosition: () => audio.currentTime * 1000, current: () => !audio.paused, seek, authorise: window.authorise,
          onStage: (kind, { lease, positionMs }) => window.receipt({ intervalId: interval.id, kind, positionMs, authorisationId: lease.authorisationId }) });
      } catch (error) { await window.receipt({ intervalId: interval.id, kind: 'seek_failed', positionMs: audio.currentTime * 1000, code: 'SEEK_NOT_CONFIRMED' }); throw error; }
      const receipt = { intervalId: interval.id, authorisationId: result.lease.authorisationId };
      await window.receipt({ ...receipt, kind: 'automatic_skip', positionMs: result.positionMs });
      const continuing = !audio.paused;
      await window.receipt({ ...receipt, kind: 'undo_requested', positionMs: audio.currentTime * 1000 });
      let restored;
      try { restored = await result.undo(); await window.receipt({ ...receipt, kind: 'undo', positionMs: restored }); }
      catch (error) { await window.receipt({ ...receipt, kind: 'undo_failed', positionMs: audio.currentTime * 1000, code: 'UNDO_NOT_CONFIRMED' }); throw error; }
      const out = { interval, before, seekDestination: result.positionMs, restored, skippedMs: result.durationMs, speed: audio.playbackRate, continuing, continuingAfterUndo: !audio.paused };
      audio.pause(); URL.revokeObjectURL(uri); return out;
    }, { interval, hash: manifest.audioVariantFingerprint });
    assert(result.continuing && result.continuingAfterUndo && result.speed === 1.5);
    assert(Math.abs(result.restored - result.before) <= 350); playback.push(result);
  }
  await Promise.all(staged);
  const evidence = { at: new Date().toISOString(), evaluation: 'Real publisher audio; Chromium media engine using shared native adapter and live AWS leases. NOT physical-iPhone playback.', identity, labelSource: spec.labelSource, historicalLabels: spec.labels, fingerprint: manifest.audioVariantFingerprint, rangeProof, playback, mismatchDenied: true, ordinaryListenerDenied: true, physicalIphoneVerified: false };
  writeFileSync('.starcast/phase4-real-playback-evidence.json', JSON.stringify(evidence, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(evidence));
} finally {
  await Promise.allSettled(staged); await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  try {
    if (configuredVersion) await api('/api/admin/intelligence/testing', { enabled: original.enabled, adSkipPilotEnabled: original.adSkipPilotEnabled, listenerIds: original.listenerIds, expiresAt: original.expiresAt, expectedVersion: configuredVersion, confirmation: 'ENABLE TESTING', reason: 'Restore original tester membership after real-audio QA; no expiry or budget change.' });
  } finally {
    try { if (deviceId) await api('/api/admin/pilot/devices/revoke', { deviceId }); }
    finally { await fetch(c.url + '/api/admin/session', { method: 'DELETE', headers: adminHeaders }); }
    if (temporary) { try { const path=join(temporary,'audio.mp3');if(existsSync(path))unlinkSync(path); } finally { rmdirSync(temporary); } }
  }
}
