import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

// Local adapter for the existing transcript/job/intelligence relationships.
// Production PostgreSQL migrations remain the deployment contract.
export class LocalStore {
  transactionDepth = 0;
  constructor(path) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE INDEX IF NOT EXISTS records_episode_feed ON records(kind,json_extract(payload,'$.feedUrl'))
      WHERE kind IN ('intelligence-history','intelligence');
      CREATE TABLE IF NOT EXISTS semantic_revision (id TEXT PRIMARY KEY, revision TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS semantic_insert AFTER INSERT ON records WHEN NEW.kind='semantic-index'
      BEGIN INSERT INTO semantic_revision VALUES(NEW.id,lower(hex(randomblob(16)))) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision; END;
      CREATE TRIGGER IF NOT EXISTS semantic_delete AFTER DELETE ON records WHEN OLD.kind='semantic-index'
      BEGIN INSERT INTO semantic_revision VALUES(OLD.id,lower(hex(randomblob(16)))) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision; END;
      CREATE TRIGGER IF NOT EXISTS semantic_update AFTER UPDATE ON records
      WHEN OLD.kind='semantic-index' OR NEW.kind='semantic-index'
      BEGIN
        INSERT INTO semantic_revision SELECT OLD.id,lower(hex(randomblob(16))) WHERE OLD.kind='semantic-index'
          ON CONFLICT(id) DO UPDATE SET revision=excluded.revision;
        INSERT INTO semantic_revision SELECT NEW.id,lower(hex(randomblob(16))) WHERE NEW.kind='semantic-index' AND (OLD.kind!='semantic-index' OR OLD.id!=NEW.id)
          ON CONFLICT(id) DO UPDATE SET revision=excluded.revision;
      END;`);
  }
  episodeJobs(feedUrl, episodeId) {
    return this.db.prepare(`SELECT payload FROM records WHERE kind IN ('intelligence-history','intelligence')
      AND json_extract(payload,'$.feedUrl')=?
      AND (json_extract(payload,'$.episodeId')=? OR json_extract(payload,'$.episode.id')=?)
      ORDER BY CASE kind WHEN 'intelligence-history' THEN 0 ELSE 1 END,id`).all(feedUrl,episodeId,episodeId).map(row=>JSON.parse(row.payload));
  }
  get(kind, id) {
    const payload = this.getRaw(kind, id);
    return payload === null ? null : JSON.parse(payload);
  }
  getRaw(kind, id) {
    const row = this.db
      .prepare("SELECT payload FROM records WHERE kind=? AND id=?")
      .get(kind, id);
    return row?.payload ?? null;
  }
  semanticRevision(id) {
    return this.db.prepare('SELECT revision FROM semantic_revision WHERE id=?').get(id)?.revision || 0;
  }
  set(kind, id, value) {
    this.db
      .prepare(
        "INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload",
      )
      .run(kind, id, JSON.stringify(value));
  }
  all(kind) {
    return this.db
      .prepare("SELECT id,payload FROM records WHERE kind=?")
      .all(kind)
      .map((x) => [x.id, JSON.parse(x.payload)]);
  }
  delete(kind, id) {
    this.db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
  }
  transaction(fn) {
    const depth = this.transactionDepth, savepoint = `starcast_${depth}`;
    this.db.exec(depth ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
    this.transactionDepth++;
    try {
      const result = fn();
      if (result && typeof result.then === "function") throw Error("Store transactions must be synchronous.");
      this.db.exec(depth ? `RELEASE SAVEPOINT ${savepoint}` : "COMMIT");
      return result;
    } catch (error) {
      this.db.exec(depth ? `ROLLBACK TO SAVEPOINT ${savepoint}; RELEASE SAVEPOINT ${savepoint}` : "ROLLBACK");
      throw error;
    } finally {
      this.transactionDepth--;
    }
  }
  close() {
    this.db.close();
  }
}
