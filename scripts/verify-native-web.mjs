// Browser UX regression evidence only: never use these images as App Store screenshots.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const browser = await chromium.launch({ headless: true });
await mkdir(".starcast/qa", { recursive: true });
const errors = [];
try {
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
    page.on("pageerror", error => errors.push(error.message));
    await page.route("https://d3ri12f40b85i3.cloudfront.net/**", route => {
      const path = new URL(route.request().url()).pathname;
      const payload = path === "/api/listener/subscriptions" ? {enabled:false, reason:"Subscriptions are not available in this beta."}
        : path.includes("catalogue") ? {results:[],feed:{episodes:[]}}
        : {monthlyMinutes:600,earnedMinutes:0,consumedMinutes:0,remainingMinutes:600,pendingMinutes:0,
          resetAt:"2026-11-01",qualifiedReferrals:0,pendingReferrals:0,code:"fixture-code",webInviteAvailable:false,
          referralProgressMinutes:0,qualificationMinutes:30,friendBonusMinutes:0,verificationAvailable:false,preferences:{}};
      return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(payload)});
    });
    await page.goto("http://127.0.0.1:4188");
    await page.getByLabel("Private-beta access code").waitFor();
    await page.getByRole("link",{name:"Terms of Service"}).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
    await page.screenshot({path:`.starcast/qa/enrollment-web-${width}.png`,fullPage:true});
    await page.evaluate(() => {
      localStorage.setItem("star-cast-pilot-token","local-browser-test-not-a-real-token");
      localStorage.setItem("star-cast-installation-credential","local-test-credential-aaaaaaaaaaaaaaaaaaaa");
      localStorage.setItem("star-cast-listener-state-v1",JSON.stringify({onboardingComplete:true,intelligencePreferenceVersion:2,intelligenceEnabled:false}));
    });
    await page.reload();
    await page.getByLabel("Open profile").click();
    await page.getByText("Subscriptions are not available in this beta.",{exact:true}).waitFor();
    await page.getByRole("switch",{name:"Remember local listening history"}).scrollIntoViewIfNeeded();
    await page.screenshot({path:`.starcast/qa/privacy-controls-web-${width}.png`,fullPage:true});
    await page.getByText("Delete listener profile",{exact:true}).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
    assert.equal(await page.getByRole("link",{name:"Privacy Policy"}).count(),1);
    await page.screenshot({path:`.starcast/qa/profile-web-${width}.png`,fullPage:true});
    await page.getByRole("switch",{name:"Night mode"}).click();
    await page.screenshot({path:`.starcast/qa/profile-light-web-${width}.png`,fullPage:true});
    for (const name of ["Listen", "Following", "Discover", "Library"]) {
      await page.getByRole("tab",{name}).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
      await page.screenshot({path:`.starcast/qa/${name.toLowerCase()}-web-${width}.png`,fullPage:true});
    }
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log("PASS: native React web enrollment/profile, legal links, narrow overflow and theme checks. Mocked API; not physical iOS evidence.");
} finally { await browser.close(); }
