// Read-only browser verification of real pinned audio; never manufactures human labels.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createCorpusReviewServer} from './review-ad-skip-corpus.mjs';
const {chromium}=await import(process.env.RADIOSTAR_PLAYWRIGHT_MODULE||'playwright');
const app=await createCorpusReviewServer();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(app.accessUrl);
 await page.locator('nav button[data-id="lup-610"]').click();await page.locator('#audio').evaluate(a=>{a.muted=true;});
 await page.waitForFunction(()=>document.querySelector('audio').readyState>=1);
 await page.locator('#windows button').first().click();await page.waitForFunction(()=>document.querySelector('audio').currentTime>100 && !document.querySelector('audio').paused && document.querySelector('audio').readyState>=3);
 await page.locator('#audio').evaluate(a=>a.pause());await page.locator('#mark-start').click();const marked=Number(await page.locator('#start').inputValue());assert(marked>100);
 await page.locator('#start-fine').click();assert(Math.abs(Number(await page.locator('#start').inputValue())-(marked-.25))<.002);
 await page.screenshot({path:'/tmp/starcast-batch7/corpus-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/starcast-batch7/corpus-mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const manifest=await page.evaluate(()=>fetch('/manifest').then(r=>r.json()));assert.equal(manifest.metrics.completeEpisodes,0);assert.equal(manifest.metrics.recall,null);assert.deepEqual(errors,[]);
 const result={at:new Date().toISOString(),episodes:manifest.episodes.length,hashVerifiedAtStartup:true,actualAudioSeekSeconds:marked,quarterSecondControl:true,humanLabelsCreated:0,desktop:'1280x900',mobile:'390x844',horizontalOverflow:false,pageErrors:errors,realWorldAccuracy:'UNMEASURED_PENDING_HUMAN_REVIEW'};await writeFile('evals/ad-skip-corpus-browser.json',JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{await browser?.close();await new Promise(r=>app.server.close(r));}
