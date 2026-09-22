import { classifyAudienceComment } from "@/lib/jev";
import { STORY_PREMISE } from "@/lib/story";
import { currentUser, getLiveDb, getStory, isOwner, serverError } from "@/lib/live-state";

export const runtime = "edge";

type Idea = { id: string; action: string };

export async function POST(request: Request) {
  try {
    const user = currentUser(request);
    if (!user) return Response.json({ error: "Sign in to suggest a direction." }, { status: 401 });
    if (!process.env.TYPESAFE_API_KEY?.trim()) return Response.json({ error: "Jev is unavailable." }, { status: 503 });
    const input = await request.json() as { body?: unknown; synthetic?: unknown; name?: unknown };
    const body = typeof input.body === "string" ? input.body.replace(/\s+/g, " ").trim() : "";
    if (!body || body.length > 500) return Response.json({ error: "Enter a comment under 500 characters." }, { status: 400 });
    // Cheap, deterministic pre-screen before storage or a Jev request.
    if (/(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b(?:system prompt|api key|ignore (?:all )?(?:previous|prior|above) instructions)\b/i.test(body)) {
      return Response.json({ error: "This comment can't be shown in the live story. Please try another suggestion." }, { status: 422 });
    }
    const synthetic = input.synthetic === true && isOwner(request);
    if (input.synthetic === true && !synthetic) return Response.json({ error: "Not allowed." }, { status: 403 });
    const db = getLiveDb();
    const story = await getStory(db);
    if (!story.running || Date.now() - story.producer_seen_at > 15_000) return Response.json({ error: "The story is paused." }, { status: 409 });
    const now = Date.now();
    const name = synthetic && typeof input.name === "string" ? input.name.slice(0, 24) : user.email.split("@")[0].slice(0, 24);
    const userId = synthetic ? `sim:${crypto.randomUUID()}` : user.id;
    const inserted = synthetic
      ? await db.prepare("INSERT INTO live_comments (user_id, name, body, round, created_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM live_comments WHERE round = ?) < 100 RETURNING id")
        .bind(userId, name, body, story.round, now, story.round).first<{ id: number }>()
      : await db.prepare("INSERT INTO live_comments (user_id, name, body, round, created_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM live_comments WHERE round = ?) < 100 AND (SELECT COUNT(*) FROM live_comments WHERE user_id = ? AND round = ?) < 3 AND NOT EXISTS (SELECT 1 FROM live_comments WHERE user_id = ? AND created_at > ?) RETURNING id")
        .bind(userId, name, body, story.round, now, story.round, userId, story.round, userId, now - 10_000).first<{ id: number }>();
    if (!inserted) return Response.json({ error: "Please wait before commenting again." }, { status: 429 });

    const ideas = await db.prepare("SELECT cluster_id AS id, MIN(action) AS action FROM live_comments WHERE round = ? AND state = 'usable' GROUP BY cluster_id ORDER BY COUNT(*) DESC LIMIT 8").bind(story.round).all<Idea>();
    try {
      const recent = await db.prepare("SELECT action FROM live_scenes ORDER BY number DESC LIMIT 2").all<{ action: string }>();
      const context = recent.results.map((scene) => scene.action).reverse().join("; ");
      const result = await classifyAudienceComment(body, ideas.results, `${STORY_PREMISE} Recent directions: ${context}`);
      if (result.mode !== "jev") throw new Error("Jev is unavailable.");
      if (!result.safeForLiveStory) {
        await db.prepare("UPDATE live_comments SET state = 'blocked', body = '[removed by moderation]', action = NULL, cluster_id = NULL WHERE id = ?")
          .bind(inserted.id).run();
        return Response.json({ error: "This comment can't be shown in the live story. Please try another suggestion." }, { status: 422 });
      }
      await db.prepare("UPDATE live_comments SET state = ?, action = ?, cluster_id = ? WHERE id = ?")
        .bind(result.usable ? "usable" : "off_topic", result.action, result.clusterId, inserted.id).run();
      return Response.json({ id: inserted.id, action: result.action, usable: result.usable });
    } catch (error) {
      await db.prepare("UPDATE live_comments SET state = 'error' WHERE id = ?").bind(inserted.id).run();
      throw error;
    }
  } catch (error) {
    return serverError(error);
  }
}
