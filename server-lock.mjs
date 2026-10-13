import {
  mkdirSync,
  openSync,
  writeFileSync,
  closeSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { dirname } from "node:path";
export function acquireServerLock(path) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    const pid = Number(readFileSync(path, "utf8"));
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        throw Error("Another Star Cast backend owns this data directory.");
      } catch (e) {
        if (e.code !== "ESRCH") throw e;
      }
    }
    unlinkSync(path);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const fd = openSync(path, "wx", 0o600);
  writeFileSync(fd, String(process.pid));
  closeSync(fd);
  const release = () => {
    try {
      if (readFileSync(path, "utf8") === String(process.pid)) unlinkSync(path);
    } catch {}
  };
  process.once("exit", release);
  return release;
}
