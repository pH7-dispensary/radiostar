// This tuple is the existing backend hash preimage, not a replacement server ID.
export const episodeIdentity = (feedUrl, episodeId) => JSON.stringify([feedUrl, episodeId]);
const unresolved = new WeakMap();
let unresolvedSequence = 0;
export function nativeEpisodeKey(episode) {
  let scope = nativeFeedIdentity(episode.feedUrl) || (episode.showId ? `legacy-show:${episode.showId}` : episode.legacyIdentity);
  if (!scope) {
    if (!unresolved.has(episode)) unresolved.set(episode, `unresolved-session:${++unresolvedSequence}`);
    scope = unresolved.get(episode);
  }
  return episodeIdentity(scope, episode.id || episode.episodeId);
}
export const sameEpisode = (a,b) => !!a && !!b && nativeEpisodeKey(a) === nativeEpisodeKey(b);
export function migrateListenerIdentity(state) {
  const known = [...(state.following || [])];
  const migrate = (episode, index, collection) => {
    if (episode.feedUrl) return episode;
    const feeds = [...new Set(known.filter(s => s.id === episode.showId).map(s=>s.feedUrl).filter(Boolean))];
    return feeds.length === 1 ? {...episode,feedUrl:feeds[0]} : episode.showId || episode.legacyIdentity ? episode : {...episode,legacyIdentity:`unresolved:${collection}:${index}`};
  };
  return {...state, identityVersion:2, saved:(state.saved||[]).map((e,i)=>migrate(e,i,"saved")),history:(state.history||[]).map((e,i)=>migrate(e,i,"history")),moments:(state.moments||[]).map((e,i)=>migrate(e,i,"moments")),
    feedEpisodes:Object.fromEntries(Object.entries(state.feedEpisodes||{}).map(([k,v])=>[k,v.map((e,i)=>migrate(e,i,k))]))};
}
export function migratePositions(legacy, episodes, source, positionMs) {
  const result={};
  for(const [id,position] of Object.entries(legacy)) {
    const keys=[...new Set(episodes.filter(e=>e.id===id && e.feedUrl).map(nativeEpisodeKey))];
    if(keys.length===1) result[keys[0]]=position;
  }
  if(source?.feedUrl && Number.isFinite(positionMs)) result[nativeEpisodeKey(source)]=positionMs;
  return result;
}
let nativeAliases = {};
export function setNativeFeedAliases(aliases) { nativeAliases = {...nativeAliases,...aliases}; }
export const nativeFeedIdentity = feed => nativeAliases[feed] || feed;
export const sameShow = (a,b) => a.feedUrl && b.feedUrl ? nativeFeedIdentity(a.feedUrl) === nativeFeedIdentity(b.feedUrl) : a.id === b.id;
export function positionForEpisode(positions, episode) {
  const key=nativeEpisodeKey(episode);
  if(Object.hasOwn(positions,key))return positions[key];
  const matches=Object.entries(positions).filter(([stored])=>{
    try {const [feedUrl,id]=JSON.parse(stored);return nativeEpisodeKey({feedUrl,id})===key;} catch{return false;}
  });
  return matches.length===1?matches[0][1]:undefined;
}
