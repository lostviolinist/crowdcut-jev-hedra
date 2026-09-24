# CrowdCut

CrowdCut is a shared, audience-directed live story demo. Viewers suggest Sophie’s next move; Jev classifies and groups suggestions; Hedra H3 Max Turbo renders the next scene. Viewers can rewind earlier scenes and return to the live edge.

## Run locally

Use Node 22.13+ and pnpm. Copy `.env.example` to `.env.local`, then fill in the server-side keys:

```text
TYPESAFE_API_KEY=
HEDRA_API_KEY=
CROWDCUT_OWNER_USER_ID=
CROWDCUT_OWNER_EMAIL=
CROWDCUT_GUEST_SECRET=
CROWDCUT_PRODUCER_SECRET=
CROWDCUT_EXTERNAL_PRODUCER=0
CROWDCUT_PRODUCER_URL=
```

Both owner fields must match the same signed-in ChatGPT account to start, stop, and reset the shared story. A link does not grant owner controls. Public visitors can watch and comment under a generated, persistent guest handle. Keep the guest signing secret private; never commit `.env.local` or put API keys in client-side environment variables.

```sh
pnpm install
pnpm dev
```

The continuity checks in `tests/story-continuity.test.ts` cover prompt memory, scene-timeline cuts, and playback seeking.

## Live behavior

- One server-controlled story and video timeline are shared by all viewers.
- The next scene receives the search goal and up to twelve previous audience actions. The supplied frame remains the visual source of truth; this first-pass memory does not analyze the generated video itself.
- A scene's last usable frame is also its playback cut, so the next scene begins where the previous one visibly ends.
- Viewers can submit comments without signing in. The server gives each browser a signed guest handle and rate-limits, moderates, and classifies comments before showing them or counting them as directions. Guests share an additional per-connection limit to slow cookie-reset flooding.
- Demo chat begins with 75 distinct comments per scene, then continues from a larger varied deck through long renders. Jev classifies each comment as it arrives; it chooses after 12–24 classifications, with viewer directions taking priority. Late classifications carry into the current round rather than being lost.
- When a finished scene's continuation frame is ready, the owner submits the next job immediately. The rendering time can still exceed the eight-second playback duration, so this does not guarantee gapless live video.
- Playback holds the outgoing image until the next clip is ready, rather than flashing a black player while its video loads.
- The owner can stop generation. With the external producer enabled, closing every browser tab does not stop Jev or Hedra jobs.
- Hedra generation consumes API-wallet credits. The app currently has no automatic spending cap, so the owner should stop the story when needed.
- Video is not muted by the app. Browser autoplay rules may require a viewer to press Play to hear audio.

For the existing Site, configure the five original variables plus `CROWDCUT_PRODUCER_SECRET` as encrypted runtime secrets; D1 and R2 remain with Sites. `producer/` is an independent Cloudflare Worker with a Durable Object alarm and Browser Run for frame handoff. Deploy it with Wrangler, put the same producer secret in the Worker, and verify `/probe` can capture an existing scene before setting `CROWDCUT_EXTERNAL_PRODUCER=1` on the Site. The Site's owner controls still require the signed-in owner; the producer secret authorizes only tick, synthetic comments, and frame upload. To roll back without touching stored scenes, set `CROWDCUT_EXTERNAL_PRODUCER=0` and redeploy the Site; the owner tab resumes producing. `producer/` has a private `/wake` endpoint and a cron fallback so the worker continues without any open tab. The existing `.openai/hosting.json` is a Sites project reference, not a public deployment configuration.
