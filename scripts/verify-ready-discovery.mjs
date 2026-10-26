// Expo web interaction evidence. Paid endpoints are never forwarded.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const {chromium}=await import(process.env.RADIOSTAR_PLAYWRIGHT_MODULE || 'playwright');
const root=resolve(process.env.RADIOSTAR_EXPORT_DIR || '/tmp/starcast-batch1-web');
const out=resolve('.starcast/batch1-visual');await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(path!==root&&!path.startsWith(root+sep))return res.writeHead(403).end();
 try{const file=path===root?resolve(root,'index.html'):path;res.setHeader('content-type',({'.html':'text/html','.js':'application/javascript','.ttf':'font/ttf','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const live=process.argv.includes('--live');let episodes=[{id:'fixture',feedUrl:'https://fixture.invalid/feed.xml',title:'Reliable evidence and thoughtful technology: a conversation with the people building it',showName:'Radio Star test podcast',publishedAt:'2026-10-20',audioUrl:'https://fixture.invalid/audio.wav',availableFeatures:{brief:true,chapters:true,topics:true,moments:true,search:true}}];
if(live){const connection=JSON.parse(await readFile('.starcast/cloud-connection.json'));const qa=JSON.parse(await readFile('.starcast/translation-verification.json'));
 const r=await fetch(connection.url+'/api/intelligence/ready',{headers:{'x-star-cast-pilot-token':qa.deviceToken,authorization:'Bearer '+qa.credential}});assert.equal(r.status,200);episodes=(await r.json()).episodes;assert(episodes.length);}
const browser=await chromium.launch({headless:true}),results=[];
try{for(const width of [320,390,430,1024]){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});let mode='ready',statusReads=0,requests=0;const errors=[];
 await context.addInitScript(dark=>{localStorage.setItem('star-cast-pilot-token','local-visual-only');localStorage.setItem('radio-star-launch-v1','seen');localStorage.setItem('star-cast-listener-state-v1',JSON.stringify({following:[],saved:[],history:[],moments:[],feedEpisodes:{},followIntelligence:{},nightMode:dark,onboardingComplete:true,historyEnabled:false,intelligenceEnabled:true,intelligencePreferenceVersion:2}));},width===430);
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
 if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
 if(url.pathname.startsWith('/api/')){let body={};
  if(url.pathname==='/api/intelligence/ready'){requests++;if(mode==='error')return route.fulfill({status:503,json:{error:'Unavailable'},headers});body={episodes:mode==='empty'?[]:episodes};}
  if(url.pathname==='/api/intelligence/request')throw Error('UI must not enqueue paid work');
  if(url.pathname==='/api/catalogue/search')body={results:[]};
  if(url.pathname==='/api/catalogue/feed')body={feed:{title:episodes[0].showName,episodes:[]}};
  if(url.pathname==='/api/listener/summary')body={preferences:{adSkipEnabled:false},monthlyMinutes:600,remainingMinutes:600};
  if(url.pathname==='/api/skips/status')body={state:'NO_VERIFIED_INTERVALS',intervals:[],activeIntervals:[],automaticSkipping:false};
  if(url.pathname==='/api/intelligence/status'){statusReads++;body={status:{state:'UNAVAILABLE',processing:false,code:'LEGAL_BASIS_NOT_ESTABLISHED',availabilityState:'REVIEW_REQUIRED'}};}
  return route.fulfill({json:body,headers});
 }
 if(url.origin===origin)return route.continue();
 if(live&&episodes.some(e=>e.artworkUrl===req.url()))return route.continue();
 // Audio is intentionally blocked: this harness verifies navigation, not device audio.
 return route.abort();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
 const discover=()=>page.getByRole('tab',{name:'Discover',exact:true}).click({timeout:20000});await discover();
 const section=page.getByTestId('ai-ready-discovery');await section.getByText('Listen & explore').first().waitFor();await section.scrollIntoViewIfNeeded();
 const box=await section.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.screenshot({path:`${out}/${width}-${live?'live':'fixture'}-ready.png`});
 await section.getByRole('button',{name:`Listen with AI insights: ${episodes[0].title}`,exact:true}).click();
 await page.getByTestId('episode-intelligence-status').waitFor();assert(statusReads>0);
 await page.getByRole('button',{name:'Explore AI-ready episodes',exact:true}).click();await section.waitFor();
 if(!live&&width===390){
  mode='error';await page.getByRole('tab',{name:'Listen',exact:true}).click();await discover();
  await section.getByText('We couldn’t check available insights. You can still search for a podcast.').waitFor();
  assert.equal(await section.getByText('Listen & explore').count(),0);await section.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/error.png`});
  mode='empty';await section.getByRole('button',{name:'Try AI-ready episodes again'}).click();await section.getByText('No AI-ready episodes are available right now. Explore podcasts below to keep listening.').waitFor();
  await page.screenshot({path:`${out}/empty.png`});mode='ready';await page.reload();await discover();await section.getByText('Listen & explore').first().waitFor();
 }
 assert.deepEqual(errors,[]);results.push({width,live,episodes:episodes.length,statusReads,requests,overflow:false,errors});await context.close();
}}finally{await browser.close();await new Promise(r=>server.close(r));}
await writeFile(`${out}/results-${live?'live':'fixture'}.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
