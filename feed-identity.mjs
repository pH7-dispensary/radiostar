import { publicUrl } from './safe-network.mjs';
export class FeedIdentity {
  constructor(store) {this.store=store;}
  resolve(feed) { return this.store.get('feed-alias',feed)?.canonicalFeedUrl || feed; }
  hasRecords(feed) {
    return !!this.store.db.prepare(`SELECT 1 FROM records WHERE kind IN ('rights','rights-policy-override','intelligence-policy','intelligence','transcript','follow','followed-demand','job')
      AND (json_extract(payload,'$.feedUrl')=? OR json_extract(payload,'$.episode.feedUrl')=?) LIMIT 1`).get(feed,feed);
  }
  observe(source, result) {
    if (!result.redirects?.length || !result.redirects.every(h=>[301,308].includes(h.status)) || !publicUrl(result.url)) return this.resolve(source);
    return this.store.transaction(()=>{
      const from=this.resolve(source), to=this.resolve(result.url);
      if(from===to)return from;
      const fromExists=this.hasRecords(from), toExists=this.hasRecords(to);
      if(fromExists && toExists) {
        this.store.set('feed-identity-conflict',source,{source,destination:result.url,code:'IDENTITY_CONFLICT',at:new Date().toISOString()});
        return from;
      }
      const canonical=fromExists?from:to, alias=fromExists?to:from;
      const record={canonicalFeedUrl:canonical,evidence:{type:'validated-permanent-redirect',redirects:result.redirects},at:new Date().toISOString()};
      // Flatten existing aliases so identities never form chains or cycles.
      for(const [id,row] of this.store.all('feed-alias')) if(row.canonicalFeedUrl===alias) this.store.set('feed-alias',id,{...row,canonicalFeedUrl:canonical});
      this.store.set('feed-alias',alias,record);
      if(source!==canonical)this.store.set('feed-alias',source,record);
      return canonical;
    });
  }
  aliases(feed) {const canonical=this.resolve(feed);return this.store.all('feed-alias').filter(([,r])=>r.canonicalFeedUrl===canonical).map(([id])=>id);}
}
