/** In-memory, short-lived proof cache. A completed proof never replaces active audio. */
export function createVerifiedSourceCache({ now = Date.now, maxEntries = 8, ttlMs = 60000 } = {}) {
  const entries = new Map();
  return {
    get(key) {
      const row = entries.get(key);
      if (!row || row.expiresAt <= now()) { entries.delete(key); return null; }
      return row.source;
    },
    set(key, source) {
      entries.delete(key);
      if (source) entries.set(key, { source, expiresAt: now() + ttlMs });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    },
  };
}
