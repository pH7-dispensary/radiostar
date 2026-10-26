import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
const require = createRequire(new URL("./native/package.json", import.meta.url));
const ts = require("typescript"), exports = {}, values = new Map();
let nativeSleepClears = 0;
const output = ts.transpileModule(readFileSync("native/src/localStorage.ts","utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
runInNewContext(output,{exports,require:name=>name==="react-native"?{Platform:{OS:"web"}}:name==="./nativeSleep"?{clearNativeSleepRecord:()=>{nativeSleepClears++;}}:{},
  globalThis:{localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}}});
await exports.setIdentity("star-cast-installation-credential","test-credential");
await exports.setIdentity("star-cast-pilot-token","test-token");
for(const name of ["star-cast-listener-summary","star-cast-native-playback-v1-positions","star-cast-listener-state-v1"])
  await exports.writeLocalDocument(name,"test-data");
await exports.eraseLocalListenerData();
assert.equal(nativeSleepClears,1,"privacy deletion clears the native sleep recovery record");
await exports.writeLocalDocument("star-cast-listener-state-v1","late-request-data");
assert.equal(values.size,0,"late writes cannot resurrect deleted local data");
exports.resumeLocalWrites();
await exports.writeLocalDocument("new-session","allowed");
assert.equal(values.get("new-session"),"allowed");
const walk = path => readdirSync(path,{withFileTypes:true}).flatMap(item=>item.isDirectory()?walk(`${path}/${item.name}`):[`${path}/${item.name}`]);
const exportDirectory = process.env.RADIOSTAR_EXPORT_DIR || "native/dist";
assert.ok(existsSync(`${exportDirectory}/metadata.json`),"export iOS before the release scan");
const envText=existsSync("native/.env")?readFileSync("native/.env","utf8"):"";
const secret=envText.match(/^EXPO_PUBLIC_DEV_INTELLIGENCE_TOKEN\s*=\s*["']?([^\r\n"']+)/m)?.[1]?.trim();
if(secret && secret.length>=12) for(const file of walk(exportDirectory))
  assert.equal(readFileSync(file).includes(Buffer.from(secret)),false,`Shared development credential found in ${file}`);
console.log("PASS: local deletion, late-write suppression and exported iOS development-token scan (no secret values printed).");
