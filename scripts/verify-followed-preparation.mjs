import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createReviewFixture } from "../test-phase3-fixture.mjs";
const { chromium } = await import(process.env.RADIOSTAR_PLAYWRIGHT_MODULE || "playwright");
const { app } = createReviewFixture();
app.store.set("installation", "test", {id:"test",intelligenceEnabled:true});
await app.followedPreparation.refresh({force:true});
await new Promise(r=>app.server.listen(0,"127.0.0.1",r));
const origin=`http://127.0.0.1:${app.server.address().port}`, output=".starcast/followed-preparation-visual";
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(origin+"/admin");await page.getByLabel("Administrator credential").fill("phase3-test-admin");await page.getByRole("button",{name:"Sign in securely"}).click();
  await page.getByRole("button",{name:"AI Processing",exact:true}).click();
  await page.locator("#followed-preparation").waitFor();
  assert.match(await page.locator("#followed-preparation").innerText(),/3 unique episodes/);
  await page.getByRole("button",{name:"Refresh estimate",exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('[data-followed-action="estimate"]')?.disabled);
  await page.screenshot({path:output+"/desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:output+"/mobile.png",fullPage:true});
  assert.deepEqual(errors,[]);
  console.log("Followed Podcasts: real admin login, estimate action, desktop/mobile rendering, overflow and console checks passed.");
} finally {await browser.close();await new Promise(r=>app.server.close(r));app.store.close();}
