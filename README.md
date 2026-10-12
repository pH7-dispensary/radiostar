# Star Cast

Fixture-backed, reviewable podcast MVP. Run `npm start` and open `http://localhost:4173`.

This project deliberately has no production API calls by default. See [the MVP plan](docs/STAR-CAST-MVP-BUILD-PLAN.md).

## Local episode intelligence

The backend discovers publisher-provided Podcasting 2.0 transcript references before any audio transcription. Paid processing is off by default, even when `OPENAI_API_KEY` is set. To authorise a trusted local development device, export `STARCAST_DEV_INTELLIGENCE_TOKEN` and require that value in the `X-Star-Cast-Dev-Token` request header. Set `STARCAST_PAID_INTELLIGENCE=enabled` only after reviewing the server-side budget controls (default $5/day, $25/month, three transcription hours/day, two hours/episode).

`/api/admin/intelligence` exposes the local development ledger only to that trusted token. It reports actual cache entries and provider usage; metrics without collected data remain `null` rather than invented.

For an explicitly authorised local intelligence session, run `npm run start:local-intelligence`. It enables paid processing only for that server process while retaining the budget ledger and trusted-device requirement. `npm start` continues to leave paid intelligence off by default.
