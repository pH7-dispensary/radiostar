import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createStarCastServer } from '../server.mjs';
import { LocalStore } from '../persistence.mjs';
import { episodeKey } from '../episode-pipeline.mjs';
const { chromium } = await import(process.env.RADIOSTAR_PLAYWRIGHT_MODULE || 'playwright');
const live=process.argv.includes('--live'),out=live?'.starcast/phase5-live-admin':'.starcast/phase5-local-admin';
let app,base,admin,gateway;
if(live){const c=JSON.parse(readFileSync('.starcast/cloud-connection.json'));base=c.url;gateway=c.token;admin=JSON.parse(readFileSync('.starcast/cloud-admin.json')).token;}
else {
  admin='browser-fixture-only';const feedUrl='https://fixture.example/rss';
  const feed='<rss><channel><title>Radio Star operational fixture</title><item><guid>one</guid><title>Evidence &amp; clear operational decisions</title><pubDate>Thu, 22 Oct 2026 10:00:00 GMT</pubDate><itunes:duration>10:00</itunes:duration><enclosure url="https://fixture.example/one.mp3"/></item></channel></rss>';
  app=createStarCastServer({store:new LocalStore(':memory:'),env:{STARCAST_ADMIN_TOKEN:admin},fetchFeed:async()=>feed});
  app.store.set('intelligence',episodeKey(feedUrl,'one'),{jobId:'fixture-job',feedUrl,episodeId:'one',episode:{id:'one',title:'Evidence & clear operational decisions',showName:'Radio Star operational fixture'},state:'FAILED',code:'TRANSCRIPT_UNAVAILABLE',reason:'No usable transcript was returned by this fixture.',updatedAt:new Date().toISOString()});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;
}
const browser=await chromium.launch({headless:true}),context=await browser.newContext(),errors=[];let csrf;
try{
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue({headers:{...route.request().headers(),...(gateway?{'x-star-cast-dev-token':gateway}:{})}}):route.abort());
  const headers=gateway?{'x-star-cast-dev-token':gateway}:{};
  assert.equal((await context.request.post(base+'/api/admin/session',{headers,data:{adminToken:admin}})).status(),201);
  csrf=(await context.cookies()).find(c=>c.name==='starcast_admin_csrf')?.value;
  if(live){
    assert.equal((await context.request.get(base+'/api/health',{headers})).status(),200);
    const op=await(await context.request.get(base+'/api/admin/operations',{headers})).json();
    assert.equal(op.commandCentre.summary.ready,op.commandCentre.funnel.find(s=>s.id==='ready').count,'overview and drill-down reconcile');
    assert.equal(op.commandCentre.summary.ready,op.processing.counts.READY);
    assert.equal((await context.request.post(base+'/api/admin/advisories',{headers,data:{}})).status(),403,'missing CSRF cannot mutate live review state');
    const anonymous=await browser.newContext();try{assert.equal((await anonymous.request.get(base+'/api/admin/operations',{headers})).status(),403);}finally{await anonymous.close();}
    console.log(JSON.stringify({release:op.infrastructure.release,summary:op.commandCentre.summary,funnel:op.commandCentre.funnel.map(({episodeKeys,...v})=>v),adSkip:op.commandCentre.adSkip,cost:op.commandCentre.cost,followed:{uniqueEpisodes:op.followedPreparation.uniqueEpisodes,counts:op.followedPreparation.counts},infrastructure:op.infrastructure.components.map(({name,status,reason,observedAt,detail})=>({name,status,reason,observedAt,detail}))}));
  }
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/admin');await page.locator('.command-metrics').waitFor();
  mkdirSync(out,{recursive:true});
  for(const width of [390,768,1024,1440]) {
    await page.setViewportSize({width,height:1000});
    for(const [name,title] of [['Overview','Overview'],['AI Processing','AI Processing'],['Ad Skip','Ad Skip safety'],['Needs Attention','Needs Attention'],['Costs','Costs'],['Settings','Settings'],['Podcasts','Podcasts']]) {
      await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name,exact:true}).click();
      await page.locator('h2').filter({hasText:new RegExp('^'+title+'$')}).waitFor();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} overflow at ${width}`);
      const small=await page.locator('.content button').evaluateAll(bs=>bs.filter(b=>b.getClientRects().length && b.getBoundingClientRect().height<43).map(b=>b.textContent));assert.deepEqual(small,[],`${name} touch targets at ${width}`);
      await page.screenshot({path:`${out}/${width}-${name.replaceAll(' ','-')}.png`,fullPage:false});
    }
    await page.getByRole('button',{name:'Open podcast',exact:true}).first().click();await page.locator('.podcast-header').waitFor();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:`${out}/${width}-podcast-detail.png`});
    await page.getByRole('button',{name:'Open episode',exact:true}).first().click();await page.locator('.episode-hero').waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${out}/${width}-episode-detail.png`});
  }
  if(!live){
    await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'Needs Attention',exact:true}).click();await page.locator('#attention-filter').waitFor();
    page.once('dialog',d=>d.accept('Reviewed local fixture; no production state changed.'));
    await page.getByRole('button',{name:'Acknowledge',exact:true}).first().click();await page.getByText('ACKNOWLEDGED',{exact:true}).first().waitFor();
    await page.locator('#attention-filter').selectOption('HIGH');
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({live,widths:[390,768,1024,1440],pageErrors:errors,screenshots:out,mutations:live?'None':'Local fixture advisory review'}));
}finally{if(csrf)await context.request.delete(base+'/api/admin/session',{headers:{...(gateway?{'x-star-cast-dev-token':gateway}:{}),'x-star-cast-csrf':decodeURIComponent(csrf)}});await browser.close();if(app){await new Promise(r=>app.server.close(r));app.store.close();}}
