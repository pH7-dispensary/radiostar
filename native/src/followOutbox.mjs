// Transport/storage injected so offline/restart/order semantics are executable in Node.
export class FollowOutbox {
  constructor({read,write,send,changed=()=>{}}) { Object.assign(this,{read,write,send,changed}); this.data={version:0,operations:{}}; this.loaded=null; this.serial=Promise.resolve(); this.running=null; }
  load() { return this.loaded ||= this.read().then(raw=>{if(raw)this.data=JSON.parse(raw);}); }
  async enqueue(feedUrl,following,show) {
    const task=this.serial.then(async()=>{
      await this.load();
      const operation={feedUrl,following,show,version:Math.max(Date.now(),this.data.version+1),pending:true};
      const next={version:operation.version,operations:{...this.data.operations,[feedUrl]:operation}};
      await this.write(JSON.stringify(next)); this.data=next; this.changed(this.data);
      return operation;
    }); this.serial=task.catch(()=>{}); return task;
  }
  flush() { if(this.running)return this.running;
    this.running=this.drain().finally(()=>{this.running=null;}); return this.running;
  }
  async drain() {
    await this.load(); await this.serial;
    for(const operation of Object.values(this.data.operations).filter(op=>op.pending)) {
      try {
        const result=await this.send(operation);
        const update=this.serial.then(async()=>{
          if(this.data.operations[operation.feedUrl]?.version!==operation.version)return;
          if(!Number.isSafeInteger(result.version) || result.version<operation.version || typeof result.following!=='boolean' || (result.version===operation.version && result.accepted===false)) throw Error('Follow synchronisation conflict.');
          const next={...this.data,version:Math.max(this.data.version,result.version),operations:{...this.data.operations,[operation.feedUrl]:{...operation,version:result.version,following:result.following,pending:false,error:undefined,processing:result.processing}}};
          await this.write(JSON.stringify(next));this.data=next;this.changed(this.data);
        }); this.serial=update.catch(()=>{}); await update;
      } catch {
        const update=this.serial.then(async()=>{
          if(this.data.operations[operation.feedUrl]?.version!==operation.version)return;
          const next={...this.data,operations:{...this.data.operations,[operation.feedUrl]:{...operation,error:'Waiting to sync. We’ll retry automatically.'}}};
          await this.write(JSON.stringify(next));this.data=next;this.changed(this.data);
        });this.serial=update.catch(()=>{});await update;
      }
    }
  }
}
