// A bounded, shared executor: currently playing work overtakes pending prewarm
// work, while an already-running acquisition is never cancelled or repaid.
export class AdWorkQueue {
  constructor({ maximumPending = 64 } = {}) { this.maximumPending=maximumPending;this.pending=new Map();this.running=null;this.sequence=0; }
  hasCapacity() { return this.pending.size < this.maximumPending; }
  promote(key, priority) { const item=this.pending.get(key);if(item)item.priority=Math.max(item.priority,priority); }
  add(key, run, priority = 0) {
    if(this.running?.key===key)return this.running.promise;
    if(this.pending.has(key)){this.promote(key,priority);return this.pending.get(key).promise;}
    if(!this.hasCapacity())throw Error('Ad analysis queue is full.');
    let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
    this.pending.set(key,{key,run,priority,sequence:this.sequence++,promise,resolve,reject});
    queueMicrotask(()=>this.drain());return promise;
  }
  async drain() {
    if(this.running)return;
    const next=[...this.pending.values()].sort((a,b)=>b.priority-a.priority||a.sequence-b.sequence)[0];
    if(!next)return;
    this.pending.delete(next.key);this.running=next;
    try {next.resolve(await next.run());}catch(error){next.reject(error);}finally{this.running=null;queueMicrotask(()=>this.drain());}
  }
}
