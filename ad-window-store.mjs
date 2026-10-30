// Reuse the existing SkipService and registry. Only the four per-analysis
// records are scoped; intervals, permissions, leases, feedback and budgets
// remain in their existing global collections.
const scoped=new Set(['skip-source','skip-analysis','skip-audio-verification','skip-episode']);
export function adWindowStore(store, epoch, index) {
  if(!/^[a-f0-9]{64}$/.test(epoch)||!Number.isSafeInteger(index)||index<1||index>512)throw Error('Invalid progressive analysis scope.');
  const suffix=`:window:${epoch}:${index}`;
  return {
    get:(kind,id)=>store.get(kind,scoped.has(kind)?id+suffix:id),
    set:(kind,id,value)=>store.set(kind,scoped.has(kind)?id+suffix:id,value),
    delete:(kind,id)=>store.delete(kind,scoped.has(kind)?id+suffix:id),
    all:kind=>scoped.has(kind)?store.all(kind).filter(([id])=>id.endsWith(suffix)).map(([id,v])=>[id.slice(0,-suffix.length),v]):store.all(kind),
    transaction:fn=>store.transaction(fn),suffix,
  };
}
