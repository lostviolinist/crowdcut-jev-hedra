# CrowdCut

CrowdCut is a shared, audience-directed live story demo. Viewers suggest Sophie’s next move; Jev classifies and groups suggestions; Hedra H3 Max Turbo renders the next scene. Viewers can rewind earlier scenes and return to the live edge.

## Run locally

Use Node 22.13+ and pnpm. Copy `.env.example` to `.env.local`, then fill in the server-side keys:

```text
TYPESAFE_API_KEY=
HEDRA_API_KEY=
CROWDCUT_OWNER_USER_ID=
CROWDCUT_OWNER_EMAIL=
```

The owner fields identify the account allowed to start and stop the shared story. Never commit `.env.local` or put API keys in client-side environment variables.

```sh
pnpm install
pnpm dev
```

The continuity checks in `tests/story-continuity.test.ts` cover prompt memory, scene-timeline cuts, and playback seeking.

## Live behavior

- One server-controlled story and video timeline are shared by all viewers.
- The next scene receives the search goal and up to twelve previous audience actions. The supplied frame remains the visual source of truth; this first-pass memory does not analyze the generated video itself.
- A scene's last usable frame is also its playback cut, so the next scene begins where the previous one visibly ends.
- Signed-in viewers can submit comments. The server rate-limits, moderates, and classifies them before showing them or counting them as directions.
- The simulated audience is labeled as such and capped per scene. Human suggestions join the same voting pool.
- The owner can stop generation; simply closing a viewer tab does not stop the shared producer.
- Hedra generation consumes API-wallet credits. The app currently has no automatic spending cap, so the owner should stop the story when needed.
- Video is not muted by the app. Browser autoplay rules may require a viewer to press Play to hear audio.

For deployment, configure all four variables as encrypted runtime secrets and provide a persistent D1 database and R2 media bucket. The private Sites project's `.openai/hosting.json` is intentionally omitted from this public repository. Keep the hosted site private until its audience and operating controls are ready.
