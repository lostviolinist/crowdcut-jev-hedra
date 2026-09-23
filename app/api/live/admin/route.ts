import { getLiveBucket, getLiveDb, getStory, isOwner, serverError } from "@/lib/live-state";

export const runtime = "edge";

export async function POST(request: Request) {
  if (!isOwner(request)) return Response.json({ error: "Owner access required." }, { status: 403 });
  try {
    const input = await request.json() as { action?: unknown };
    if (input.action !== "start" && input.action !== "stop" && input.action !== "reset") return Response.json({ error: "Invalid control." }, { status: 400 });
    const db = getLiveDb();
    const story = await getStory(db);
    if (input.action === "reset") {
      if (story.running || (story.phase !== "idle" && story.phase !== "resetting" && !(story.phase === "awaiting_frame" && story.scene_count === 0))) {
        return Response.json({ error: "Stop generation and wait for the current scene to finish before resetting." }, { status: 409 });
      }
      const scenes = await db.prepare("SELECT COUNT(*) AS count FROM live_scenes").first<{ count: number }>();
      if (story.phase !== "resetting") {
        const claimed = await db.prepare("UPDATE live_story SET phase = 'resetting', producer_seen_at = 0 WHERE id = 1 AND running = 0 AND (phase = 'idle' OR (phase = 'awaiting_frame' AND scene_count = 0))").run();
        if (!claimed.meta.changes) return Response.json({ error: "The story changed before it could be reset. Try again." }, { status: 409 });
      }
      await db.batch([
        db.prepare("DELETE FROM live_comments"),
        db.prepare("DELETE FROM live_scenes"),
      ]);
      let mediaCleanupIncomplete = false;
      try {
        const bucket = getLiveBucket();
        for (const prefix of ["frames/", "scenes/"]) {
          let cursor: string | undefined;
          do {
            const page = await bucket.list({ prefix, cursor });
            const keys = page.objects.map((object) => object.key);
            if (keys.length) await bucket.delete(keys);
            cursor = page.truncated ? page.cursor : undefined;
          } while (cursor);
        }
      } catch (error) {
        console.error("CrowdCut reset media cleanup failed", error);
        mediaCleanupIncomplete = true;
      }
      await db.prepare("UPDATE live_story SET phase = 'awaiting_frame', round = 1, scene_count = 0, job_id = NULL, pending_action = NULL, frame_key = NULL, next_poll_at = 0, producer_seen_at = 0, error = NULL WHERE id = 1 AND phase = 'resetting'").run();
      return Response.json({ reset: true, removedScenes: scenes?.count || 0, mediaCleanupIncomplete });
    }
    if (input.action === "start" && (story.phase === "submitting" || story.phase === "resetting")) return Response.json({ error: "The story is still finishing its previous operation." }, { status: 409 });
    await db.prepare("UPDATE live_story SET running = ?, producer_seen_at = ?, error = NULL WHERE id = 1")
      .bind(input.action === "start" ? 1 : 0, input.action === "start" ? Date.now() : 0).run();
    return Response.json({ running: input.action === "start" });
  } catch (error) {
    return serverError(error);
  }
}
