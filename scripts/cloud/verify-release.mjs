import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyAwsIdentity } from "../aws-account-guard.mjs";
verifyAwsIdentity();
const connection = JSON.parse(readFileSync(".starcast/cloud-connection.json","utf8"));
const admin = JSON.parse(readFileSync(".starcast/cloud-admin.json","utf8"));
assert.equal(connection.url,"https://d3ri12f40b85i3.cloudfront.net");
const timings = [];
async function request(path, body, administrative = false) {
  const started = performance.now();
  const response = await fetch(connection.url + path, {method:body ? "POST":"GET",
    headers:{"content-type":"application/json","x-star-cast-dev-token":connection.token,
      ...(administrative ? {"x-star-cast-admin-token":admin.token}: {})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200,path);
  const result=await response.json();
  timings.push({path:path.split("?")[0],ms:Math.round(performance.now()-started)});
  return result;
}
const before=await request("/api/admin/intelligence",null,true);
assert.equal(before.features.adSkip,false);
for(const [key,value] of Object.entries({dailyUsd:5,monthlyUsd:25,dailyTranscriptionSeconds:10800,maxEpisodeSeconds:7200}))
  assert.equal(before.controls[key],value);
for (const path of ["/api/catalogue/search?q=podcast","/api/admin/intelligence","/api/listener/summary"])
  assert.equal((await fetch(connection.url+path)).status,403);
assert.equal((await fetch(connection.url+"/api/admin/intelligence",{headers:{"x-star-cast-dev-token":connection.token}})).status,403);
const feedUrl=connection.url+"/fixtures/approved-test-feed.xml", episodeId="starcast-approved-test-episode-v1";
const status=await request("/api/intelligence/status?"+new URLSearchParams({feedUrl,episodeId}));
assert.equal(status.status.state,"READY");
const moments=await request("/api/intelligence/moment",{feedUrl,episodeId,query:"rights review"});
assert.ok(moments.moments.length);
const search=await request("/api/search/conversations",{query:"rights review",feedUrls:[feedUrl]});
assert.ok(search.matches.length);
const restricted=await request("/api/intelligence/status?"+new URLSearchParams({feedUrl:"https://publisher.example/feed",episodeId:"unapproved"}));
assert.equal(restricted.status.code,"RIGHTS_RESTRICTED");
const catalogue=await request("/api/catalogue/search?q=Python%20Bytes");
assert.ok(catalogue.results.length);
const after=await request("/api/admin/intelligence",null,true);
assert.equal(after.usage.length,before.usage.length,"verification must not invoke paid processing");
console.log(JSON.stringify({passed:true,rightsAwareCache:true,approvedCorpusOnly:true,paidCalls:0,
  publicAccessRejected:true,adminSeparation:true,coverage:search.coverage,totals:after.totals,timings,
  physicalIPhoneVerified:false},null,2));
