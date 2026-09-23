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
- Owner-run demo chat is capped at 75 comments per scene across owner tabs, with varied handles, busy-stream staggered timing, and no duplicate generated comments in a scene. Up to 16 classifications can run in parallel. Jev classifies each comment as it arrives; once 24 comments are classified, viewer directions outrank demo chat when choosing the next scene. Late classifications carry into the current round rather than being lost.
- When a finished scene's continuation frame is ready, the owner submits the next job immediately. The rendering time can still exceed the eight-second playback duration, so this does not guarantee gapless live video.
- Playback holds the outgoing image until the next clip is ready, rather than flashing a black player while its video loads.
- The owner can stop generation; simply closing a viewer tab does not stop the shared producer.
- Hedra generation consumes API-wallet credits. The app currently has no automatic spending cap, so the owner should stop the story when needed.
- Video is not muted by the app. Browser autoplay rules may require a viewer to press Play to hear audio.

For deployment, configure all five variables as encrypted runtime secrets and provide a persistent D1 database and R2 media bucket. The existing `.openai/hosting.json` is a Sites project reference, not a public deployment configuration.
