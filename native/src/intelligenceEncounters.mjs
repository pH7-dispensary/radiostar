// Visible/local episode encounters only: never enumerate the global catalogue.
export function createEncounterPrewarmer(request, { now = Date.now, cooldownMs = 300000 } = {}) {
  const seen = new Map();
  let active = 0;
  return async (episodes, enabled = true, source = "opened") => {
    if (!enabled) return;
    for (const episode of episodes.slice(0, 3)) {
      if (!episode.feedUrl || !episode.id || active >= 2) continue;
      const key = JSON.stringify([episode.feedUrl, episode.id]);
      if (seen.has(key) && now() - seen.get(key) < cooldownMs) continue;
      if (seen.size >= 200) seen.delete(seen.keys().next().value);
      seen.set(key, now()); active++;
      try { await request(episode.feedUrl, episode.id, source); }
      catch { seen.delete(key); /* Listening and local saves must still work offline. */ }
      finally { active--; }
    }
  };
}
