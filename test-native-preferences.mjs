import * as identities from "./episode-identity.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
const require = createRequire(
  new URL("./native/package.json", import.meta.url),
);
const ts = require("typescript");
let saved = null;
const exports = {};
const output = ts.transpileModule(
  readFileSync(
    new URL("./native/src/listenerState.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
runInNewContext(output, {
  exports,
  require: (name) => {
    if(name === "../../episode-identity.mjs") return identities;
    assert.equal(name, "./localStorage");
    return {
      readLocalDocument: async () => saved,
      writeLocalDocument: async (_key, value) => {
        saved = value;
      },
    };
  },
});
assert.equal(exports.emptyListenerState().intelligenceEnabled, true);
assert.equal(exports.emptyListenerState().historyEnabled, true);
assert.equal(exports.emptyListenerState().nightMode, false, "new listeners start in light mode");
assert.equal((await exports.loadListenerState()).intelligenceEnabled, true);
saved = JSON.stringify({
  intelligenceEnabled: false,
  following: [{ id: "kept" }],
});
let migrated = await exports.loadListenerState();
assert.equal(migrated.intelligenceEnabled, true);
assert.equal(migrated.following[0].id, "kept");
saved = JSON.stringify({ nightMode: true });
assert.equal((await exports.loadListenerState()).nightMode, true, "saved appearance choices persist");
await exports.saveListenerState({ ...migrated, intelligenceEnabled: false });
assert.equal(
  (await exports.loadListenerState()).intelligenceEnabled,
  false,
  "explicit v2 opt-out persists",
);
await exports.saveListenerState({ ...migrated, intelligenceEnabled: true });
assert.equal((await exports.loadListenerState()).intelligenceEnabled, true);
await exports.saveListenerState({ ...migrated, historyEnabled: false });
assert.equal((await exports.loadListenerState()).historyEnabled, false);
console.log(
  "default-on intelligence migration, opt-out and listener persistence checks passed",
);
