import { getLiveBucket, getLiveDb, getStory, isOwner, serverError } from "@/lib/live-state";
import { isHedraCreditError } from "@/lib/hedra";

export const runtime = "edge";

export async function POST(request: Request) {
  if (!isOwner(request)) return Response.json({ error: "Owner access required." }, { status: 403 });
  try {
    const input = await request.json() as { action?: unknown; resetIntent?: unknown };
    if (input.action !== "start" && input.action !== "stop" && input.action !== "reset") return Response.json({ error: "Invalid control." }, { status: 400 });
    const db = getLiveDb();
    const story = await getStory(db);
    if (input.action === "reset") {
      // A reset request from an older tab may still be retrying. Require the
      // new confirmation flow so deployment cannot unexpectedly clear a run.
      if (input.resetIntent !== "clear-current-story-v2") return Response.json({ error: "Refresh the page to reset the story." }, { status: 409 });
      if (story.running) return Response.json({ error: "Stop generation before resetting.", retryable: true }, { status: 409 });
      const scenes = await db.prepare("SELECT COUNT(*) AS count FROM live_scenes").first<{ count: number }>();
      if (story.phase !== "resetting") {
        // Abandon an in-flight job locally. Hedra may still finish and charge
        // for a request already submitted, but it must not restore old scenes.
        const claimed = await db.prepare("UPDATE live_story SET phase = 'resetting', generation = generation + 1, job_id = NULL, pending_action = NULL, next_action = NULL, frame_key = NULL, next_poll_at = 0, producer_seen_at = 0 WHERE id = 1 AND running = 0 AND phase != 'resetting'").run();
        if (!claimed.meta.changes) return Response.json({ error: "The story changed before it could be reset. Trying again is safe.", retryable: true }, { status: 409 });
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
      await db.prepare("UPDATE live_story SET phase = 'awaiting_frame', round = 1, scene_count = 0, job_id = NULL, pending_action = NULL, next_action = NULL, frame_key = NULL, next_poll_at = 0, producer_seen_at = 0, error = NULL WHERE id = 1 AND phase = 'resetting'").run();
      return Response.json({ reset: true, removedScenes: scenes?.count || 0, mediaCleanupIncomplete });
    }
    if (input.action === "start" && story.phase === "submitting" && !story.running && !story.job_id && story.error && isHedraCreditError(story.error)) {
      // Repair stories left in the submitting phase by older deployments after
      // Hedra rejected a request for insufficient credits. Recreate the
      // handoff from the last saved video rather than assuming its old frame
      // is still in storage.
      const recovered = await db.prepare("UPDATE live_story SET phase = 'awaiting_frame', running = 1, round = ?, frame_key = NULL, pending_action = NULL, producer_seen_at = ?, error = NULL WHERE id = 1 AND phase = 'submitting' AND running = 0 AND job_id IS NULL AND error = ?")
        .bind(Math.max(1, story.round - 1), Date.now(), story.error).run();
      if (!recovered.meta.changes) return Response.json({ error: "The story changed before it could resume. Try again." }, { status: 409 });
      return Response.json({ running: true });
    }
    if (input.action === "start" && (story.phase === "submitting" || story.phase === "resetting")) return Response.json({ error: "The story is still finishing its previous operation." }, { status: 409 });
    await db.prepare("UPDATE live_story SET running = ?, producer_seen_at = ?, error = NULL WHERE id = 1")
      .bind(input.action === "start" ? 1 : 0, input.action === "start" ? Date.now() : 0).run();
    return Response.json({ running: input.action === "start" });
  } catch (error) {
    return serverError(error);
  }
}
