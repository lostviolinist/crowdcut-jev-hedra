import { getHedraJob, isHedraCreditError, submitStoryGeneration } from "@/lib/hedra";
import { getLiveBucket, getLiveDb, getStory, isOwner, isProducer, serverError } from "@/lib/live-state";
import { formatAudienceActionLabel } from "@/lib/story-ideas";
import { MIN_COMMENTS_TO_CHOOSE, readyToChooseScene } from "@/lib/live-decision";

export const runtime = "edge";

type Winner = { action: string; votes: number; audienceVotes: number };
type Job = { job_id?: string; status?: string; outputs?: Array<{ url?: string; content_type?: string }>; error?: string | { message?: string } };

export async function POST(request: Request) {
  if (!isOwner(request) && !isProducer(request)) return Response.json({ error: "Producer access required." }, { status: 403 });
  try {
    const db = getLiveDb();
    const now = Date.now();
    // A delayed owner tab is a temporary disconnect, not an instruction to stop.
    // Only the owner's explicit Stop control clears running.
    await db.prepare("UPDATE live_story SET producer_seen_at = ? WHERE id = 1 AND running = 1").bind(now).run();
    const story = await getStory(db);
    if (story.phase === "rendering" && story.job_id && now >= story.next_poll_at) {
      const lease = await db.prepare("UPDATE live_story SET next_poll_at = ? WHERE id = 1 AND phase = 'rendering' AND job_id = ? AND next_poll_at <= ?")
        .bind(now + 2_000, story.job_id, now).run();
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
            // Job-specific keys prevent a late result from an abandoned run
            // overwriting a new run's scene with the same number.
            const key = `scenes/${number}-${story.job_id}.mp4`;
            const video = await response.arrayBuffer();
            if (!video.byteLength || video.byteLength > 80_000_000) throw new Error("The completed video is too large to archive safely.");
            await getLiveBucket().put(key, video, { httpMetadata: { contentType: output.content_type || "video/mp4" } });
            const results = await db.batch([
              db.prepare("INSERT OR IGNORE INTO live_scenes (number, action, video_key, job_id, created_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM live_story WHERE id = 1 AND phase = 'rendering' AND job_id = ?)")
                .bind(number, story.pending_action || "Audience direction", key, story.job_id, now, story.job_id),
              db.prepare("UPDATE live_story SET phase = 'awaiting_frame', scene_count = ?, job_id = NULL, pending_action = NULL, frame_key = NULL, next_poll_at = 0 WHERE id = 1 AND phase = 'rendering' AND job_id = ?")
                .bind(number, story.job_id),
            ]);
            if (!results[1].meta.changes) await getLiveBucket().delete(key);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "The scene could not be archived.";
          await db.prepare("UPDATE live_story SET running = 0, error = ?, next_poll_at = 0 WHERE id = 1 AND job_id = ?")
            .bind(message, story.job_id).run();
        }
      }
    }

    // Lock the audience's next direction while the current scene is still
    // rendering. New comments then enter the following voting round instead
    // of being stranded after this choice is made.
    if (story.running && (story.phase === "rendering" || story.phase === "awaiting_frame") && !story.next_action) {
      const count = await db.prepare("SELECT COUNT(*) AS count FROM live_comments WHERE round = ? AND state IN ('usable', 'off_topic')")
        .bind(story.round).first<{ count: number }>();
      if ((count?.count || 0) >= MIN_COMMENTS_TO_CHOOSE) {
        const candidates = await db.prepare("SELECT MIN(action) AS action, COUNT(*) AS votes, SUM(CASE WHEN user_id LIKE 'sim:%' THEN 0 ELSE 1 END) AS audienceVotes FROM live_comments WHERE round = ? AND state = 'usable' GROUP BY cluster_id ORDER BY audienceVotes DESC, votes DESC, cluster_id ASC LIMIT 2")
          .bind(story.round).all<Winner>();
        const [winner, runnerUp] = candidates.results;
        if (winner?.action && readyToChooseScene(count?.count || 0, winner, runnerUp)) {
          await db.prepare("UPDATE live_story SET next_action = ?, round = round + 1 WHERE id = 1 AND running = 1 AND phase IN ('rendering', 'awaiting_frame') AND next_action IS NULL AND round = ?")
            .bind(formatAudienceActionLabel(winner.action), story.round).run();
        }
      }
    }

    if (story.running && story.phase === "idle" && story.frame_key) {
      let chosenAction = story.next_action;
      const queued = Boolean(chosenAction);
      if (!chosenAction) {
        const count = await db.prepare("SELECT COUNT(*) AS count FROM live_comments WHERE round = ? AND state IN ('usable', 'off_topic')")
          .bind(story.round).first<{ count: number }>();
        if ((count?.count || 0) >= MIN_COMMENTS_TO_CHOOSE) {
          // Viewer votes outrank demo chat whenever viewers have voted.
          const candidates = await db.prepare("SELECT MIN(action) AS action, COUNT(*) AS votes, SUM(CASE WHEN user_id LIKE 'sim:%' THEN 0 ELSE 1 END) AS audienceVotes FROM live_comments WHERE round = ? AND state = 'usable' GROUP BY cluster_id ORDER BY audienceVotes DESC, votes DESC, cluster_id ASC LIMIT 2")
            .bind(story.round).all<Winner>();
          const [winner, runnerUp] = candidates.results;
          if (winner?.action && readyToChooseScene(count?.count || 0, winner, runnerUp)) chosenAction = formatAudienceActionLabel(winner.action);
        }
      }
      if (chosenAction) {
          const claimed = queued
            ? await db.prepare("UPDATE live_story SET phase = 'submitting', pending_action = ?, next_action = NULL, frame_key = NULL WHERE id = 1 AND running = 1 AND phase = 'idle' AND round = ? AND frame_key = ? AND next_action = ?")
              .bind(chosenAction, story.round, story.frame_key, chosenAction).run()
            : await db.prepare("UPDATE live_story SET phase = 'submitting', pending_action = ?, round = round + 1, frame_key = NULL WHERE id = 1 AND running = 1 AND phase = 'idle' AND round = ? AND frame_key = ? AND next_action IS NULL")
              .bind(chosenAction, story.round, story.frame_key).run();
          if (claimed.meta.changes) {
            try {
              const frame = await getLiveBucket().get(story.frame_key);
              if (!frame) throw new Error("The next scene frame is missing.");
              const file = new File([await frame.arrayBuffer()], "scene-start.png", { type: "image/png" });
              const history = await db.prepare("SELECT action FROM live_scenes ORDER BY number DESC LIMIT 12").all<{ action: string }>();
              const submitted = await submitStoryGeneration(chosenAction, file, "fastest", {
                sceneNumber: story.scene_count + 1,
                previousActions: history.results.reverse().map((scene) => scene.action),
              }) as Job;
              if (!submitted.job_id) throw new Error("Hedra returned no job ID.");
              await db.prepare("UPDATE live_story SET phase = 'rendering', job_id = ?, next_poll_at = 0 WHERE id = 1 AND phase = 'submitting' AND pending_action = ?")
                .bind(submitted.job_id, chosenAction).run();
            } catch (error) {
              const message = error instanceof Error ? error.message : "Could not start the next scene.";
              if (isHedraCreditError(message)) {
                // A 402 rejects the submission before Hedra creates a job. Keep
                // the frame and chosen direction so the owner can retry.
                if (queued) {
                  await db.prepare("UPDATE live_story SET running = 0, phase = 'idle', next_action = ?, frame_key = ?, pending_action = NULL, error = ? WHERE id = 1 AND phase = 'submitting' AND job_id IS NULL")
                    .bind(chosenAction, story.frame_key, message).run();
                } else {
                  await db.prepare("UPDATE live_story SET running = 0, phase = 'idle', round = ?, frame_key = ?, pending_action = NULL, error = ? WHERE id = 1 AND phase = 'submitting' AND job_id IS NULL")
                    .bind(story.round, story.frame_key, message).run();
                }
              } else {
                // An ambiguous transport failure could have created a paid job.
                // Do not automatically resubmit it.
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
