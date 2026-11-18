import assert from 'node:assert/strict';
import {ListenerDeletionJournal} from './listener-deletion-journal.mjs';
import {ListenerService} from './listener-service.mjs';
import {LocalStore} from './persistence.mjs';
import {createStarCastServer} from './server.mjs';
const bucket='starcast-phase1-208096650030-eu-west-2';
let raw=JSON.stringify({version:1,entries:[]}),version=0,outage=false,conflicts=0;
const client={send:async command=>{
  if(outage)throw Error('Storage unavailable');
  if(command.constructor.name==='GetObjectCommand') {
    const body=raw,etag=String(version);
    return {ETag:etag,ContentLength:Buffer.byteLength(body),Body:{transformToString:async()=>body}};
  }
  if(command.input.IfMatch!==String(version)) {conflicts++;throw {$metadata:{httpStatusCode:412}};}
  assert.equal(command.input.ServerSideEncryption,'AES256');raw=command.input.Body;version++;
  return {};
}};
const journal=new ListenerDeletionJournal({bucket,client}),store=new LocalStore(':memory:'),listeners=new ListenerService(store);
try {
  const a=listeners.register('a'.repeat(64)),b=listeners.register('b'.repeat(64));
  listeners.follow(a,{feedUrl:'https://example.org/rss',following:true});
  const historical=store.db.prepare('SELECT * FROM records').all();
  await Promise.all([a,b].map(listener=>journal.record([{credentialHash:listener.credentialHash,deletedAt:1}])));
  assert(conflicts>0,'concurrent writes exercise conditional retry');
  assert.equal(JSON.parse(raw).entries.length,2);
  assert(!raw.includes(a.id),'journal holds no listener identifiers or clear credentials');
  await journal.record([{credentialHash:a.credentialHash,deletedAt:2}]);assert.equal(JSON.parse(raw).entries.length,2);
  // A restored snapshot predates both deletions; independent records must win.
  await journal.reconcile(store);assert.equal(store.all('installation').length,0);assert.equal(store.all('follow').length,0);
  for(const row of historical)store.set(row.kind,row.id,JSON.parse(row.payload));
  assert.equal(listeners.authenticate('a'.repeat(64)),null,'revocation wins even before full cleanup');
  await journal.reconcile(store);assert.equal(store.all('installation').length,0);
  assert.throws(()=>listeners.register('a'.repeat(64)),/deleted or revoked/);
  assert.deepEqual(await journal.reconcile(store),{reconciled:2},'restart replay is idempotent');
  const app=createStarCastServer({store,deletionJournal:journal,env:{STARCAST_DEV_INTELLIGENCE_TOKEN:'isolated-test-gateway'}});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  try {
    const c=listeners.register('c'.repeat(64));outage=true;
    const call=()=>fetch(`http://127.0.0.1:${app.server.address().port}/api/listener/delete`,{method:'POST',headers:{authorization:`Bearer ${'c'.repeat(64)}`,'content-type':'application/json','x-star-cast-dev-token':'isolated-test-gateway'},body:JSON.stringify({confirm:true})});
    assert.equal((await call()).status,503);assert(listeners.authenticate('c'.repeat(64)));
    await assert.rejects(journal.reconcile(store),/unavailable/,'startup must not bypass unavailable recovery records');
    outage=false;assert.equal((await call()).status,200);assert.equal(listeners.authenticate('c'.repeat(64)),null);
    assert(JSON.parse(raw).entries.some(e=>e.credentialHash===c.credentialHash));
    const valid=raw;raw='{"version":1,"entries":[{}]}';await assert.rejects(journal.reconcile(store),/Invalid/);raw=valid;
    assert.equal(store.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  } finally {await new Promise(r=>app.server.close(r));}
  console.log('Independent deletion recovery: old-snapshot replay, concurrent writes, idempotency, unavailable storage, corruption and authenticated deletion passed.');
} finally {store.close();}
