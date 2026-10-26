import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {reviewAnnotation,currentReviews,corpusMetrics,appendReviewEvent,verifyReviewChain} from './ad-skip-corpus.mjs';
import {createCorpusReviewServer} from './scripts/review-ad-skip-corpus.mjs';
const hash=createHash('sha256').update(await readFile('fixtures/ad-skip-owned-v1.mp3')).digest('hex');
const episode={id:'owned',title:'Owned test',audioPath:'owned.mp3',audioContentHash:hash,durationMs:50000,candidates:[{id:'a',type:'advert',startMs:15000,endMs:35000}],reviewWindows:[]};
const input={audioContentHash:hash,expectedVersion:0,listened:true,independent:true,kind:'advert',format:'host_read',startMs:15000,endMs:35000,notes:'Synthetic fixture test, not a real human label',candidateIds:['a']};
for(const patch of [{audioContentHash:'wrong'},{listened:false},{independent:false},{startMs:-1},{endMs:51000},{expectedVersion:1},{kind:'no_advert'},{candidateIds:['unknown']}])assert.throws(()=>reviewAnnotation(episode,{...input,...patch},{actor:'Test reviewer'}));
const label=reviewAnnotation(episode,input,{actor:'Test reviewer'});let events=[appendReviewEvent([],{episodeId:'owned',audioContentHash:hash,version:1,action:'annotation',annotation:label})];
assert.equal(corpusMetrics([episode],events).recall,null,'candidate-only reviews cannot claim recall');events.push(appendReviewEvent(events,{episodeId:'owned',audioContentHash:hash,version:2,action:'complete'}));
assert(verifyReviewChain(events));let measured=corpusMetrics([episode],events);assert.equal(measured.recall,1);assert.equal(measured.completeBreakCoverage,1);
assert.equal(corpusMetrics([{...episode,candidates:[{...episode.candidates[0],endMs:17000}]}],events).completeBreakCoverage,0,'a fragment cannot count as a complete break');
assert.equal(corpusMetrics([{...episode,candidates:[{...episode.candidates[0],startMs:35000,endMs:45000}]}],events).falsePositives,1);
assert.equal(corpusMetrics([{...episode,audioContentHash:'changed'}],events).completeEpisodes,0);
assert.equal(corpusMetrics([{...episode,candidates:[{...episode.candidates[0],startMs:0,endMs:50000}]}],events).nonAdvertPredictedMs,30000,'whole-episode predictions expose conversation overreach even if they overlap an advert');
assert.throws(()=>verifyReviewChain([{...events[0],version:4}]));
const directory=await mkdtemp(join(tmpdir(),'starcast-corpus-test-'));let app;
try{
 await copyFile('fixtures/ad-skip-owned-v1.mp3',join(directory,'owned.mp3'));await writeFile(join(directory,'manifest.json'),JSON.stringify({episodes:[episode]}));
 app=await createCorpusReviewServer({root:directory});const bootstrap=await fetch(app.accessUrl,{redirect:'manual'});assert.equal(bootstrap.status,303);const cookie=bootstrap.headers.get('set-cookie').split(';')[0];
 await assert.rejects(()=>createCorpusReviewServer({root:directory}),/already running/);
 const reader=await createCorpusReviewServer({root:directory,readOnly:true});try{const login=await fetch(reader.accessUrl,{redirect:'manual'}),cookie=login.headers.get('set-cookie').split(';')[0];const state=await(await fetch(reader.origin+'/manifest',{headers:{cookie}})).json();assert.equal((await fetch(reader.origin+'/review',{method:'POST',headers:{cookie,origin:reader.origin,'x-corpus-csrf':state.csrf},body:'{}'})).status,403);}finally{await new Promise(r=>reader.server.close(r));}
 assert.equal((await fetch(app.accessUrl,{redirect:'manual'})).status,401,'one-time bootstrap');assert.equal((await fetch(app.origin+'/manifest')).status,401);
 const headers={cookie};const state=await(await fetch(app.origin+'/manifest',{headers})).json();
 const post=(body,extra={})=>fetch(app.origin+'/review',{method:'POST',headers:{...headers,'content-type':'application/json',origin:app.origin,'x-corpus-csrf':state.csrf,...extra},body:JSON.stringify(body)});
 const body={...input,episodeId:'owned',reviewer:'Test reviewer',action:'annotation'};
 assert.equal((await post(body,{origin:'https://attacker.example'})).status,403);assert.equal((await post(body,{'x-corpus-csrf':'wrong'})).status,403);
 const responses=await Promise.all([post(body),post(body)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409],'serial version checks prevent concurrent lost reviews');
 assert.equal((await post({...body,expectedVersion:1,action:'complete',fullEpisodeReviewed:false})).status,400);
 assert.equal((await post({...body,expectedVersion:1,action:'complete',fullEpisodeReviewed:true})).status,200);
 assert.equal((await(await fetch(app.origin+'/metrics',{headers})).json()).recall,1);
 const range=await fetch(app.origin+'/audio/owned',{headers:{...headers,range:'bytes=0-31'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,32);
 assert.equal((await fetch(app.origin+'/context/owned?startMs=0&endMs=1000')).status,401);
 assert.equal((await fetch(app.origin+'/context/owned?startMs=-1&endMs=1000',{headers})).status,400);
 assert.equal((await fetch(app.origin+'/context/owned?startMs=0&endMs=300001',{headers})).status,400);
 const context=await(await fetch(app.origin+'/context/owned?startMs=0&endMs=1000',{headers})).json();assert.equal(context.audioContentHash,hash);assert.equal(context.peaks.length,400);assert(context.peaks.every(p=>p>=0&&p<=1));assert.deepEqual(context.transcript,[]);
 assert.deepEqual(await(await fetch(app.origin+'/context/owned?startMs=0&endMs=1000',{headers})).json(),context,'cached bounded context');
 assert.equal((await fetch(app.origin+'/audio/owned',{headers:{...headers,range:'bytes=999999999-'}})).status,416);
 assert.equal((await fetch(app.origin+'/audio/unknown',{headers})).status,404);
 assert.equal((await post({...body,expectedVersion:2,action:'annotation',notes:'<img src=x onerror=alert(1)>',startMs:2000,endMs:3000,kind:'uncertain',candidateIds:[]})).status,200);
 assert.equal((await post({...body,expectedVersion:3,action:'complete',fullEpisodeReviewed:true})).status,400,'uncertain labels block completion');
 const saved=JSON.parse(await readFile(join(directory,'reviews.json'),'utf8'));assert(verifyReviewChain(saved));assert.equal(currentReviews(saved,episode).complete,false);
 await new Promise(r=>app.server.close(r));app=null;
 await writeFile(join(directory,'owned.mp3'),'changed');await assert.rejects(()=>createCorpusReviewServer({root:directory}),/changed/);
}finally{if(app)await new Promise(r=>app.server.close(r));await rm(directory,{recursive:true,force:true});}
console.log('Corpus hash binding, human attestations, partial/complete metrics, fragments, audit integrity, session, CSRF, concurrency, audio ranges and tamper rejection passed.');
// Actual detector: conversational visits / negative directions remain non-advertising cues.
const {SkipService}=await import('./skip-service.mjs');
for(const [text,expected] of [['to pay me a visit we are going to be taking the Van from the studio',0],["No, don't go to linuxunplugged.com slash 657 for that at all.",0],["Do not go to example.com for a free trial or new account.",0],['Our sponsor is Example. Use promo code FIRST for a free trial.',1]]){
 const records=new Map(),store={get:(k,id)=>records.get(k)?.get(id),set:(k,id,v)=>{if(!records.has(k))records.set(k,new Map());records.get(k).set(id,v);},all:k=>[...(records.get(k)||new Map())]};
 const detector=new SkipService(store,{status:()=>({state:'READY',episode:{audioUrl:'https://owned.example/audio'},transcript:{audioVariant:'owned',transcriptVersion:'test',durationMs:10000,segments:[{id:'s',startMs:0,endMs:5000,text}]}})});
 assert.equal(detector.inspect('https://owned.example/rss','owned').intervals.filter(r=>r.type==='advert').length,expected);
}
console.log('Real detector rejects personal visits and negated directions, while retaining sponsor/offer candidates.');
