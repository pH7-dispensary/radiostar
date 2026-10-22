import { readFileSync } from "node:fs";
const manifest = () => JSON.parse(readFileSync(new URL("./fixtures/ad-skip-owned-v1.json", import.meta.url), "utf8"));
export const adSkipFixture = {
  feedPath: "/fixtures/ad-skip-owned-feed.xml", episodeId: "radiostar-ad-skip-owned-v1",
  audioPath: "/fixtures/ad-skip-owned-v1.mp3", transcriptPath: "/fixtures/ad-skip-owned-v1.vtt",
  manifest,
  response(path, origin) {
    if (![this.feedPath, this.audioPath, this.transcriptPath].includes(path)) return null;
    if (path === this.audioPath) return { type: "audio/mpeg", body: readFileSync(new URL("./fixtures/ad-skip-owned-v1.mp3", import.meta.url)) };
    if (path === this.feedPath) return { type: "application/rss+xml", body: `<rss xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>Radio Star Controlled Ad Skip Evaluation</title><description>Original synthetic evaluation audio, not a commercial podcast.</description><item><guid>${this.episodeId}</guid><title>Owned fixture: sponsorship break and product discussion</title><itunes:duration>00:50</itunes:duration><podcast:license url="https://creativecommons.org/publicdomain/zero/1.0/"/><enclosure url="${origin}${this.audioPath}" type="audio/mpeg" length="${manifest().contentLength}"/><podcast:transcript url="${origin}${this.transcriptPath}" type="text/vtt"/></item></channel></rss>` };
    const stamp = ms => new Date(ms).toISOString().slice(11, 23);
    return { type: "text/vtt", body: "WEBVTT\n\n" + manifest().segments.map(row => `${stamp(row.startMs)} --> ${stamp(row.endMs)}\n${row.text}`).join("\n\n") };
  },
};
