import { episodeKey } from './episode-pipeline.mjs';
import { measuredProcessingEstimate } from './processing-estimate.mjs';

const values = (store, kind) => store.all(kind).map(([, row]) => row);
const money = rows => Number(rows.reduce((n, row) => n + Number(row.usd || 0), 0).toFixed(6));
const verified = row => row.verificationState === 'VERIFIED' && row.boundaryVerified === true && !!row.audioVariantFingerprint && !row.disputed;

// One canonical episode denominator across all stages. Stages are observations,
// not a conversion funnel: publisher transcripts need no audio transcription.
export function commandCentre(store, operations, ledger, now = Date.now()) {
  const jobs = values(store, 'intelligence'), demands = values(store, 'followed-demand');
  const transcripts = store.all('transcript'), intervals = values(store, 'skip-interval');
  const analyses = store.all('skip-analysis'), executions = values(store, 'skip-execution');
  const episodes = new Map();
  for (const row of [...demands, ...jobs]) {
    const feedUrl = row.feedUrl || row.episode?.feedUrl, episodeId = row.episodeId || row.episode?.id;
    if (!feedUrl || !episodeId) continue;
    const key = episodeKey(feedUrl, episodeId);
    episodes.set(key, { key, feedUrl, episodeId, title: row.episode?.title || row.title || episodeId, podcast: row.episode?.showName || row.podcast || feedUrl });
  }
  const transcriptKeys = new Set(transcripts.filter(([, t]) => t.segments?.length).map(([key]) => key.split(':')[0]));
  const audioKeys = new Set(transcripts.filter(([, t]) => t.segments?.length && /audio|transcrib/i.test(t.sourceType || '')).map(([key]) => key.split(':')[0]));
  const jobKeys = test => new Set(jobs.filter(test).map(j => episodeKey(j.feedUrl || j.episode?.feedUrl, j.episodeId || j.episode?.id)));
  const sets = {
    discovered: new Set(episodes.keys()), transcripts: transcriptKeys, transcribed: audioKeys,
    generated: jobKeys(j => !!j.brief || !!j.chapters?.length || !!j.topics?.length),
    ready: jobKeys(j => j.state === 'READY'), detected: new Set(intervals.map(i => i.episodeKey)),
    verified: new Set(intervals.filter(verified).map(i => i.episodeKey)),
    confirmed: new Set(executions.filter(e => e.kind === 'automatic_skip' && e.provenance === 'client_confirmed_seek').map(e => e.episodeKey)),
  };
  const names = { discovered: 'Episodes discovered', transcripts: 'Transcripts available', transcribed: 'Transcription completed', generated: 'Intelligence generated', ready: 'Episodes ready', detected: 'Adverts detected', verified: 'Adverts verified', confirmed: 'Automatic skips confirmed' };
  const funnel = Object.entries(sets).map(([id, set]) => ({ id, label: names[id], count: [...episodes.keys()].filter(key => set.has(key)).length, episodeKeys: [...episodes.keys()].filter(key => set.has(key)) }));
  const reservations = [...(ledger?.reservations.values() || [])], usage = ledger?.usage || [];
  const demandByKey = new Map(demands.map(d => [d.key, d]));
  const processing = operations.processing.jobs.map(row => {
    const key = episodeKey(row.feedUrl, row.episodeId), job = jobs.find(j => j.jobId === row.jobId) || {}, demand = demandByKey.get(key);
    const belongs = r => r.jobId === row.jobId || row.jobId && r.id?.startsWith(row.jobId + ':') || !r.jobId && r.id?.startsWith(key + ':');
    return { ...row, key, priority: job.priority || demand?.priority || 0, trigger: demand?.source || job.trigger || 'Not recorded', work: job.work || null,
      estimatedCompletion: measuredProcessingEstimate(job, jobs), actualCostUsd: money(usage.filter(belongs)), reservedCostUsd: money(reservations.filter(belongs)) };
  });
  const core = (operations.infrastructure.components || []).filter(c => ['Backend API','Processing worker','Processing queue','Durable database'].includes(c.name));
  const health = core.some(c => ['UNAVAILABLE','FAILED'].includes(c.status)) ? 'FAILED' : core.some(c => c.status === 'DEGRADED') ? 'DEGRADED' : core.length < 4 || core.some(c => c.status !== 'HEALTHY') ? 'UNKNOWN' : 'HEALTHY';
  const real = executions.filter(e => !e.evaluation);
  const summary = { platformHealth: health, ready: sets.ready.size, preparing: processing.filter(j => j.state === 'PROCESSING').length,
    waiting: processing.filter(j => ['QUEUED','BUDGET_PAUSED'].includes(j.state)).length, adSkipCoverage: sets.verified.size,
    actualTodayUsd: money(usage.filter(r => String(r.at).startsWith(new Date(now).toISOString().slice(0,10)))) };
  return { summary, funnel, episodes: [...episodes.values()], processing,
    denominator: 'Unique persisted episodes, including evaluation fixtures; stages can overlap. Publisher transcripts bypass transcription. Not every episode contains advertisements. READY describes internal generation, not display permission. Real listening telemetry is separated in Ad Skip.',
    adSkip: { analysedEpisodes: new Set(analyses.map(([key]) => key)).size, candidates: intervals.length, verifiedIntervals: intervals.filter(verified).length,
      verifiedEpisodes: sets.verified.size, attempted: real.filter(e => e.kind === 'seek_attempted').length, confirmed: real.filter(e => e.kind === 'automatic_skip' && e.provenance === 'client_confirmed_seek').length,
      undo: real.filter(e => e.kind === 'undo').length, variantMismatches: real.filter(e => /VARIANT|SOURCE_CHANGED/.test(e.code || '')).length,
      note: 'Real-episode client telemetry excludes evaluation fixtures. Confirmed seeks are not independent accuracy measurements; verified intervals still require listener, rights and variant checks.' },
    cost: { actualTodayUsd: summary.actualTodayUsd, actualMonthUsd: money(usage.filter(r => String(r.at).startsWith(new Date(now).toISOString().slice(0,7)))), actualUsd: money(usage), reservedUsd: money(reservations), averagePerProcessedEpisodeUsd: sets.generated.size ? money(usage) / sets.generated.size : null, averageNote: 'All recorded AI expenditure divided by episodes with generated intelligence; includes failed-attempt costs.', adVerificationUsd: null },
    capacity: { oldestQueuedAt: processing.filter(j => j.state === 'QUEUED').map(j => j.queuedAt).filter(Boolean).sort()[0] || null,
      completedLast24Hours: processing.filter(j => j.state === 'READY' && Date.parse(j.completedAt) >= now - 86400000).length,
      retries: processing.reduce((n,j) => n + Math.max(0,j.attempts-1),0) } };
}
