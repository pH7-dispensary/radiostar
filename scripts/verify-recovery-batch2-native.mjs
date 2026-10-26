import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const {chromium}=await import(process.env.RADIOSTAR_PLAYWRIGHT_MODULE || 'playwright');
const root=resolve(process.env.RADIOSTAR_WEB_EXPORT||'/tmp/starcast-batch2-web'),out=resolve(process.env.RADIOSTAR_VISUAL_OUTPUT||'.starcast/batch2-visual');await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(path!==root&&!path.startsWith(root+sep))return res.writeHead(403).end();try{const file=path===root?resolve(root,'index.html'):path;res.setHeader('content-type',({'.html':'text/html','.js':'application/javascript','.ttf':'font/ttf','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce'});
const show={id:'test-show',name:'Offline Recovery Podcast',publisher:'Owned test fixture',topic:'Technology',feedUrl:'https://fixture.example/new.xml'};
const followed=Array.from({length:35},(_,id)=>({...show,id:'followed-'+id,name:'Followed '+id,feedUrl:`https://fixture.example/${id}.xml`}));
let offline=true,attempts=0,confirmed=[],seen=new Set(),errors=[];
await context.addInitScript(followed=>{
 localStorage.setItem('star-cast-pilot-token','visual-only');localStorage.setItem('radio-star-launch-v1','seen');
 if(!localStorage.getItem('star-cast-listener-state-v1'))localStorage.setItem('star-cast-listener-state-v1',JSON.stringify({following:followed,saved:[{id:'same',feedUrl:'https://first.example/rss',showId:'first'},{id:'same',feedUrl:'https://second.example/rss',showId:'second'}],history:[],moments:[],feedEpisodes:{'followed-12':[{id:'cached',audioUrl:'https://fixture.example/cached.mp3',feedUrl:'https://fixture.example/12.xml',title:'Cached during publisher outage',showId:'followed-12'}]},followIntelligence:{},nightMode:false,onboardingComplete:true,historyEnabled:true,intelligenceEnabled:true,intelligencePreferenceVersion:2}));
},followed);
await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url()),headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
 if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
 if(url.pathname.startsWith('/api/')){
  let body={};
  if(url.pathname==='/api/catalogue/search')body={results:[show]};
  if(url.pathname==='/api/catalogue/feed'){
   const feed=url.searchParams.get('url');seen.add(feed);
   if(feed.endsWith('/12.xml'))return route.fulfill({status:502,json:{error:'Publisher temporarily unavailable',code:'PUBLISHER_UNAVAILABLE'},headers});
   body={feed:{title:'Fixture',canonicalFeedUrl:feed,feedAliases:[],episodes:[]}};
  }
  if(url.pathname==='/api/listener/follow'){
   attempts++;if(offline)return route.abort();
   const operation=req.postDataJSON();confirmed.push(operation);body={...operation,accepted:true,processing:{state:'UNAVAILABLE',code:'LEGAL_BASIS_NOT_ESTABLISHED'}};
  }
  if(url.pathname==='/api/intelligence/ready')body={episodes:[]};
  if(url.pathname==='/api/listener/summary')body={preferences:{adSkipEnabled:false},monthlyMinutes:600,remainingMinutes:600};
  if(url.pathname==='/api/intelligence/request')throw Error('No paid processing during native verification');
  return route.fulfill({json:body,headers});
 }
 if(url.origin===origin)return route.continue();return route.abort();
});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
const wait=async fn=>{for(let i=0;i<200;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Verification condition timed out');};
const findShow=async()=>{await page.getByRole('tab',{name:'Podcasts',exact:true}).click();await page.getByRole('textbox',{name:'Search podcasts',exact:true}).fill('Offline Recovery');await page.getByRole('button',{name:'Submit search'}).click();await page.getByRole('button',{name:'Open '+show.name,exact:true}).waitFor();};
const local=key=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),key);
try {
 await page.goto(origin);await page.getByRole('tab',{name:'Discover',exact:true}).click({timeout:20000});
 await wait(()=>seen.size>=35);
 const state=await local('star-cast-listener-state-v2');assert.equal(state.saved.length,2);assert.equal(state.feedEpisodes['followed-12'][0].id,'cached');
 await findShow();await page.getByRole('button',{name:'Follow '+show.name,exact:true}).click();
 await wait(()=>attempts>0);await wait(async()=>Object.values((await local('star-cast-follow-outbox-v1')).operations).some(op=>op.pending));
 await page.getByText('Following changes waiting for connection · Retry').waitFor();
 await page.screenshot({path:out+'/offline-follow.png'});
 await page.reload();await page.getByRole('tab',{name:'Discover',exact:true}).click({timeout:20000});
 assert((await local('star-cast-follow-outbox-v1')).operations[show.feedUrl].pending);
 offline=false;await page.getByRole('button',{name:'Retry following synchronisation'}).click();
 await wait(async()=>!(await local('star-cast-follow-outbox-v1')).operations[show.feedUrl].pending);
 assert.equal(confirmed.filter(op=>op.following).length,1);
 await page.screenshot({path:out+'/confirmed-follow.png'});
 offline=true;await findShow();await page.getByRole('button',{name:'Unfollow '+show.name,exact:true}).click();
 await wait(async()=>{const op=(await local('star-cast-follow-outbox-v1')).operations[show.feedUrl];return op.pending&&!op.following;});
 await page.reload();await page.getByRole('tab',{name:'Discover',exact:true}).click({timeout:20000});
 offline=false;await page.getByRole('button',{name:'Retry following synchronisation'}).click();
 await wait(async()=>!(await local('star-cast-follow-outbox-v1')).operations[show.feedUrl].pending);
 assert.equal(confirmed.filter(op=>!op.following).length,1);
 assert(!(await local('star-cast-listener-state-v2')).following.some(s=>s.feedUrl===show.feedUrl));
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 const result={at:new Date().toISOString(),followedFeedsRefreshed:35,publisherFailureCachePreserved:true,savedCollisionRecordsPreserved:2,offlineFollowRestart:true,offlineUnfollowRestart:true,confirmedWrites:confirmed.length,overflow:false,errors};
 await writeFile(out+'/results.json',JSON.stringify(result,null,2));console.log(result);
} catch(error) {await page.screenshot({path:out+'/failure.png'});console.log((await page.locator('body').innerText()).slice(-5000));throw error;}
finally {await context.close();await browser.close();await new Promise(r=>server.close(r));}
