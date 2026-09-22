import { getHedraJob, submitStoryGeneration } from "@/lib/hedra";
import { getLiveBucket, getLiveDb, getStory, isOwner, serverError } from "@/lib/live-state";

export const runtime = "edge";

const COMMENTS_TO_CHOOSE = 12;
type Winner = { action: string; votes: number };
type Job = { job_id?: string; status?: string; outputs?: Array<{ url?: string; content_type?: string }>; error?: string | { message?: string } };

export async function POST(request: Request) {
  if (!isOwner(request)) return Response.json({ error: "Owner access required." }, { status: 403 });
  try {
    const db = getLiveDb();
    const now = Date.now();
    // A vanished producer must not silently restart paid jobs when its tab returns.
    await db.prepare("UPDATE live_story SET running = 0 WHERE id = 1 AND running = 1 AND producer_seen_at < ?")
      .bind(now - 15_000).run();
    await db.prepare("UPDATE live_story SET producer_seen_at = ? WHERE id = 1 AND running = 1").bind(now).run();
    const story = await getStory(db);
    if (story.phase === "rendering" && story.job_id && now >= story.next_poll_at) {
      const lease = await db.prepare("UPDATE live_story SET next_poll_at = ? WHERE id = 1 AND phase = 'rendering' AND job_id = ? AND next_poll_at <= ?")
        .bind(now + 12_000, story.job_id, now).run();
      if (lease.meta.changes) {
        try {
          const job = await getHedraJob(story.job_id) as Job;
          if (job.status === "FAILED") throw new Error(typeof job.error === "string" ? job.error : job.error?.message || "Hedra could not finish this scene.");
          if (job.status === "COMPLETED") {
            const output = job.outputs?.find((item) => item.url && item.content_type?.startsWith("video/")) || job.outputs?.find((item) => item.url);
            if (!output?.url) throw new Error("The completed scene has no video output.");
            const response = await fetch(output.url);
            if (!response.ok) throw new Error("The completed video could not be archived.");
            const number = story.scene_count + 1;
            const key = `scenes/${number}.mp4`;
            const video = await response.arrayBuffer();
            if (!video.byteLength || video.byteLength > 80_000_000) throw new Error("The completed video is too large to archive safely.");
            await getLiveBucket().put(key, video, { httpMetadata: { contentType: output.content_type || "video/mp4" } });
            await db.batch([
              db.prepare("INSERT OR IGNORE INTO live_scenes (number, action, video_key, job_id, created_at) VALUES (?, ?, ?, ?, ?)")
                .bind(number, story.pending_action || "Audience direction", key, story.job_id, now),
              db.prepare("UPDATE live_story SET phase = 'awaiting_frame', scene_count = ?, job_id = NULL, pending_action = NULL, frame_key = NULL, next_poll_at = 0 WHERE id = 1 AND job_id = ?")
                .bind(number, story.job_id),
            ]);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "The scene could not be archived.";
          await db.prepare("UPDATE live_story SET running = 0, error = ?, next_poll_at = 0 WHERE id = 1 AND job_id = ?")
            .bind(message, story.job_id).run();
        }
      }
    }

    if (story.running && story.phase === "idle" && story.frame_key) {
      const count = await db.prepare("SELECT COUNT(*) AS count FROM live_comments WHERE round = ? AND state IN ('usable', 'off_topic')")
        .bind(story.round).first<{ count: number }>();
      if ((count?.count || 0) >= COMMENTS_TO_CHOOSE) {
        const winner = await db.prepare("SELECT MIN(action) AS action, COUNT(*) AS votes FROM live_comments WHERE round = ? AND state = 'usable' GROUP BY cluster_id ORDER BY votes DESC, cluster_id ASC LIMIT 1")
          .bind(story.round).first<Winner>();
        if (winner?.action) {
          const claimed = await db.prepare("UPDATE live_story SET phase = 'submitting', pending_action = ?, round = round + 1, frame_key = NULL WHERE id = 1 AND running = 1 AND phase = 'idle' AND round = ? AND frame_key = ?")
            .bind(winner.action, story.round, story.frame_key).run();
          if (claimed.meta.changes) {
            try {
              const frame = await getLiveBucket().get(story.frame_key);
              if (!frame) throw new Error("The next scene frame is missing.");
              const file = new File([await frame.arrayBuffer()], "scene-start.png", { type: "image/png" });
              const history = await db.prepare("SELECT action FROM live_scenes ORDER BY number DESC LIMIT 6").all<{ action: string }>();
              const context = history.results.reverse().map((scene) => scene.action).join("; ");
              const submitted = await submitStoryGeneration(winner.action, file, "fastest", context) as Job;
              if (!submitted.job_id) throw new Error("Hedra returned no job ID.");
              await db.prepare("UPDATE live_story SET phase = 'rendering', job_id = ?, next_poll_at = 0 WHERE id = 1 AND phase = 'submitting' AND pending_action = ?")
                .bind(submitted.job_id, winner.action).run();
            } catch (error) {
              const message = error instanceof Error ? error.message : "Could not start the next scene.";
              await db.prepare("UPDATE live_story SET running = 0, error = ? WHERE id = 1 AND phase = 'submitting'").bind(message).run();
            }
          }
        }
      }
    }
    return Response.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
