const xml = (origin) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>Star Cast Approved Test Corpus</title>
    <description>Star Cast-owned synthetic material for internal intelligence verification.</description>
    <item>
      <guid isPermaLink="false">starcast-approved-test-episode-v1</guid>
      <title>How evidence should shape an intelligent listener</title>
      <pubDate>Thu, 15 Oct 2026 09:00:00 GMT</pubDate>
      <itunes:duration xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">00:06:00</itunes:duration>
      <podcast:transcript url="${origin}/fixtures/approved-test-transcript.vtt" type="text/vtt" language="en" rel="captions" />
    </item>
  </channel>
</rss>`;

export const approvedTestTranscriptVtt = `WEBVTT

00:00.000 --> 01:00.000
Ada: This is Star Cast-owned synthetic test material. I think an intelligent podcast listener should distinguish a publisher transcript from a generated summary and preserve where every claim came from.

01:00.000 --> 02:00.000
Bruno: I agree. Rights review comes before processing. A public RSS link alone is not permission to retain text, create captions, or generate analysis. The system should default to restriction until a documented assessment authorises the precise use.

02:00.000 --> 03:00.000
Ada: Cost controls matter too. A listener request may use a publisher transcript, but audio transcription requires explicit consent, a duration below the limit, an available budget, and a lawful source. Following a show is never permission to spend on audio.

03:00.000 --> 04:00.000
Bruno: Search should cite the transcript segment that supports an answer, show a validated timestamp only when the source has timing, and state the limits of the processed corpus instead of pretending to search every podcast.

04:00.000 --> 05:00.000
Ada: Advertisement skip is conservative by design. Candidate intervals can be reviewed, but automatic skipping remains off until compatible audio and real-world precision demonstrate that genuine conversation will not be removed.

05:00.000 --> 06:00.000
Bruno: Finally, durable processing matters. A queue can preserve an explicit analysis request, while one writer keeps the spending ledger consistent. If a service restarts during paid work, uncertain provider outcomes stay charged and are not automatically retried.
`;

export const approvedTestCorpus = Object.freeze({
  feedPath: "/fixtures/approved-test-feed.xml",
  transcriptPath: "/fixtures/approved-test-transcript.vtt",
  episodeId: "starcast-approved-test-episode-v1",
  response(path, origin) {
    if (path === this.feedPath)
      return { type: "application/rss+xml; charset=utf-8", body: xml(origin) };
    if (path === this.transcriptPath)
      return { type: "text/vtt; charset=utf-8", body: approvedTestTranscriptVtt };
    return null;
  },
});
