import { classifyAudienceComment } from "@/lib/jev";
import { guestIdentity } from "@/lib/guest-identity";
import { currentUser, getLiveDb, getStory, isOwner, serverError } from "@/lib/live-state";
import { formatAudienceActionLabel } from "@/lib/story-ideas";

export const runtime = "edge";

type Idea = { id: string; action: string };

export async function POST(request: Request) {
  try {
    const user = currentUser(request);
    const guest = user ? null : await guestIdentity(request, false);
    if (!user && !guest) return Response.json({ error: "Refresh the page to join the chat." }, { status: 401 });
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
    if (!story.running) return Response.json({ error: "The story is paused." }, { status: 409 });
    if (Date.now() - story.producer_seen_at > 60_000) return Response.json({ error: "The host is reconnecting. Try again soon." }, { status: 409 });
    const now = Date.now();
    const name = synthetic && typeof input.name === "string" ? input.name.slice(0, 24) : (guest?.name || user?.email.split("@")[0] || "guest").slice(0, 24);
    const userId = synthetic ? `sim:${crypto.randomUUID()}` : guest?.userId || user?.id || "";
    const inserted = synthetic
      ? await db.prepare("INSERT INTO live_comments (user_id, name, body, round, created_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM live_comments WHERE round = ?) < 150 AND (SELECT COUNT(*) FROM live_comments WHERE round = ? AND user_id LIKE 'sim:%') < 75 AND NOT EXISTS (SELECT 1 FROM live_comments WHERE round = ? AND lower(trim(body)) = lower(trim(?))) RETURNING id")
        .bind(userId, name, body, story.round, now, story.round, story.round, story.round, body).first<{ id: number }>()
      : guest?.ipPrefix
        ? await db.prepare("INSERT INTO live_comments (user_id, name, body, round, created_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM live_comments WHERE round = ?) < 150 AND (SELECT COUNT(*) FROM live_comments WHERE user_id = ? AND round = ?) < 3 AND (SELECT COUNT(*) FROM live_comments WHERE user_id LIKE ? AND round = ?) < 30 AND NOT EXISTS (SELECT 1 FROM live_comments WHERE user_id = ? AND created_at > ?) RETURNING id")
          .bind(userId, name, body, story.round, now, story.round, userId, story.round, `${guest.ipPrefix}%`, story.round, userId, now - 10_000).first<{ id: number }>()
        : await db.prepare("INSERT INTO live_comments (user_id, name, body, round, created_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM live_comments WHERE round = ?) < 150 AND (SELECT COUNT(*) FROM live_comments WHERE user_id = ? AND round = ?) < 3 AND NOT EXISTS (SELECT 1 FROM live_comments WHERE user_id = ? AND created_at > ?) RETURNING id")
          .bind(userId, name, body, story.round, now, story.round, userId, story.round, userId, now - 10_000).first<{ id: number }>();
    if (!inserted) return Response.json({ error: "Please wait before commenting again." }, { status: 429 });

    const ideas = await db.prepare("SELECT cluster_id AS id, MIN(action) AS action FROM live_comments WHERE round = ? AND state = 'usable' GROUP BY cluster_id ORDER BY COUNT(*) DESC LIMIT 8").bind(story.round).all<Idea>();
    try {
      const recent = await db.prepare("SELECT action FROM live_scenes ORDER BY number DESC LIMIT 2").all<{ action: string }>();
      const context = recent.results.map((scene) => scene.action).reverse().join("; ");
      const result = await classifyAudienceComment(body, ideas.results.map((idea) => ({ ...idea, action: formatAudienceActionLabel(idea.action) })), `Recent directions: ${context}`);
      if (result.mode !== "jev") throw new Error("Jev is unavailable.");
      if (!result.safeForLiveStory) {
        await db.prepare("UPDATE live_comments SET state = 'blocked', body = '[removed by moderation]', action = NULL, cluster_id = NULL WHERE id = ?")
          .bind(inserted.id).run();
        return Response.json({ error: "This comment can't be shown in the live story. Please try another suggestion." }, { status: 422 });
      }
      // A vote may close while Jev is working. Keep late classifications in
      // the current round instead of stranding them in a completed one.
      const classified = await db.prepare("UPDATE live_comments SET round = (SELECT round FROM live_story WHERE id = 1), state = ?, action = ?, cluster_id = ? WHERE id = ? RETURNING round")
        .bind(result.usable ? "usable" : "off_topic", result.action, result.clusterId, inserted.id).first<{ round: number }>();
      return Response.json({ id: inserted.id, action: result.action, usable: result.usable, round: classified?.round ?? story.round });
    } catch (error) {
      await db.prepare("UPDATE live_comments SET state = 'error' WHERE id = ?").bind(inserted.id).run();
      throw error;
    }
  } catch (error) {
    return serverError(error);
  }
}
