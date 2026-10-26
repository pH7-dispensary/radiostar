import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {createStarCastServer} from '../server.mjs';
import {LocalStore} from '../persistence.mjs';
const {chromium}=await import(process.env.RADIOSTAR_PLAYWRIGHT_MODULE||'playwright');
const app=createStarCastServer({store:new LocalStore(':memory:'),env:{STARCAST_ADMIN_TOKEN:'isolated-browser-recovery'}});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
const browser=await chromium.launch({headless:true}),context=await browser.newContext(),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const out='.starcast/batch3-admin';mkdirSync(out,{recursive:true});
const password='isolated-browser-fixture-password';
async function nav(label){await page.locator('.technical-nav').evaluate(e=>e.open=true);await page.getByRole('navigation').getByRole('button',{name:label,exact:true}).click();await page.locator('h2').filter({hasText:new RegExp('^'+label+'$')}).waitFor();}
try {
 await page.goto(base+'/admin');await page.getByLabel('Administrator login').waitFor();
 await page.getByRole('button',{name:'Emergency recovery',exact:true}).click();await page.getByLabel('Administrator credential').fill('isolated-browser-recovery');await page.getByRole('button',{name:'Sign in securely'}).click();await page.locator('.shell').waitFor();
 await nav('Administrators');
 for(const [name,value] of [['name','Browser owner'],['login','browser-owner'],['password',password],['reason','Isolated browser verification'],['confirmation','CONFIRM']])await page.locator(`#member-form [name="${name}"]`).fill(value);
 await page.getByRole('button',{name:'Create individual Super Admin'}).click();await page.getByRole('button',{name:'Manage access'}).waitFor();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByLabel('Administrator login').fill('browser-owner');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in securely'}).click();await page.locator('.shell').waitFor();
 await nav('Administrators');
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${out}/${width}-administrators.png`});}
 for(const [name,value] of [['name','Browser reader'],['login','browser-reader'],['password',password],['reason','Read only browser verification'],['confirmation','CONFIRM']])await page.locator(`#member-form [name="${name}"]`).fill(value);
 await page.locator('#member-form [name="role"]').selectOption('READ_ONLY');await page.getByRole('button',{name:'Create administrator',exact:true}).click();await page.locator('tbody tr').filter({hasText:'Browser reader'}).waitFor();
 await nav('Feature flags');await page.locator('[data-flag="episodeBrief"]').click();
 await page.locator('#flag-form [name="state"]').selectOption('PRIVATE_BETA');await page.locator('#flag-form [name="rolloutPercent"]').fill('10');await page.locator('#flag-form [name="audience"]').selectOption('PRIVATE_BETA');await page.locator('#flag-form [name="reason"]').fill('Isolated ten-percent cohort');await page.locator('#flag-form [name="confirmation"]').fill('CONFIRM');await page.locator('#flag-form button[type="submit"],#flag-form .primary').click();
 await page.getByText('Feature control updated and audited.').waitFor();
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Session duration (hours)').fill('1');await page.locator('#configuration [name="reason"]').fill('Isolated one hour verification');await page.locator('#configuration [name="confirmation"]').fill('CONFIRM');await page.getByRole('button',{name:'Save configuration'}).click();await page.getByText('Configuration saved and audited.').waitFor();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByLabel('Administrator login').fill('browser-reader');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in securely'}).click();await page.locator('.shell').waitFor();
 assert.equal(await page.getByRole('button',{name:'Administrators',exact:true}).count(),0);
 await page.getByRole('button',{name:'Settings',exact:true}).click();assert(await page.getByRole('button',{name:'Save configuration'}).isDisabled());
 await nav('Feature flags');assert.equal(await page.locator('[data-flag]').count(),0);
 assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({verified:['recovery login','owner provisioning','individual login','role visibility','10% cohort configuration','session settings','read-only controls','no browser credential storage'],widths:[390,1440],pageErrors:errors,screenshots:out}));
}catch(error){await page.screenshot({path:`${out}/failure.png`});console.error((await page.locator('.toast').allTextContents()),errors);throw error;}finally{await browser.close();await new Promise(r=>app.server.close(r));app.store.close();}
