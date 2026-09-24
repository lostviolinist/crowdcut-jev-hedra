import { env } from "cloudflare:workers";

// Sites supplies verified identity headers after ChatGPT sign-in. Keep the
// owner's identity in deployment configuration, not in public source code.
const OWNER_USER_ID = process.env.CROWDCUT_OWNER_USER_ID?.trim();
const OWNER_EMAIL = process.env.CROWDCUT_OWNER_EMAIL?.trim().toLowerCase();

export type StoryRow = {
  id: number;
  running: number;
  phase: string;
  round: number;
  scene_count: number;
  generation: number;
  job_id: string | null;
  pending_action: string | null;
  next_action: string | null;
  frame_key: string | null;
  next_poll_at: number;
  producer_seen_at: number;
  error: string | null;
};

export function isOwner(request: Request) {
  const user = currentUser(request);
  return Boolean(user && OWNER_USER_ID && OWNER_EMAIL && user.id === OWNER_USER_ID && user.email.toLowerCase() === OWNER_EMAIL);
}

// The off-site producer can advance the shared story, but cannot call the
// owner-only start/stop/reset endpoint. Keep this credential server-side.
export function isProducer(request: Request) {
  const secret = process.env.CROWDCUT_PRODUCER_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export function currentUser(request: Request) {
  const id = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  return id && email ? { id, email } : null;
}

export function getLiveDb() {
  if (!env.DB) throw new Error("The shared story database is unavailable.");
  return env.DB;
}

export function getLiveBucket() {
  if (!env.BUCKET) throw new Error("The story video storage is unavailable.");
  return env.BUCKET;
}

export async function getStory(db = getLiveDb()) {
  let story = await db.prepare("SELECT * FROM live_story WHERE id = 1").first<StoryRow>();
  if (!story) {
    await db.prepare("INSERT OR IGNORE INTO live_story (id) VALUES (1)").run();
    story = await db.prepare("SELECT * FROM live_story WHERE id = 1").first<StoryRow>();
  }
  if (!story) throw new Error("The shared story could not be loaded.");
  return story;
}

export function serverError(error: unknown) {
  console.error("CrowdCut live request failed", error);
  return Response.json({ error: "The live story is temporarily unavailable." }, { status: 503 });
}
