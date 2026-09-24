import { getLiveDb, getStory, currentUser, isOwner, serverError } from "@/lib/live-state";
import { guestIdentity } from "@/lib/guest-identity";
import { formatAudienceActionLabel } from "@/lib/story-ideas";

export const runtime = "edge";

type Scene = { number: number; action: string; cut_ms: number; created_at: number };
type ChatComment = { id: number; name: string; body: string; action: string | null; round: number; created_at: number; audience: number };
type Idea = { id: string; action: string; votes: number; audienceVotes: number };

export async function GET(request: Request) {
  try {
    const user = currentUser(request);
    const guest = user ? null : await guestIdentity(request, true);
    const db = getLiveDb();
    const story = await getStory(db);
    const [scenesResult, commentsResult, ideasResult, classifiedResult] = await Promise.all([
      db.prepare("SELECT number, action, cut_ms, created_at FROM live_scenes ORDER BY number ASC").all<Scene>(),
      db.prepare("SELECT id, name, body, action, round, created_at, CASE WHEN user_id LIKE 'sim:%' THEN 0 ELSE 1 END AS audience FROM live_comments WHERE state IN ('usable', 'off_topic') AND (id IN (SELECT id FROM live_comments WHERE state IN ('usable', 'off_topic') ORDER BY id DESC LIMIT 80) OR id IN (SELECT id FROM live_comments WHERE state IN ('usable', 'off_topic') AND user_id NOT LIKE 'sim:%' ORDER BY id DESC LIMIT 20)) ORDER BY id ASC").all<ChatComment>(),
      db.prepare("SELECT cluster_id AS id, MIN(action) AS action, COUNT(*) AS votes, SUM(CASE WHEN user_id LIKE 'sim:%' THEN 0 ELSE 1 END) AS audienceVotes FROM live_comments WHERE round = ? AND state = 'usable' GROUP BY cluster_id ORDER BY audienceVotes DESC, votes DESC, id ASC LIMIT 6").bind(story.round).all<Idea>(),
      db.prepare("SELECT COUNT(*) AS count, SUM(CASE WHEN state = 'off_topic' THEN 1 ELSE 0 END) AS chatOnlyCount FROM live_comments WHERE round = ? AND state IN ('usable', 'off_topic')").bind(story.round).first<{ count: number; chatOnlyCount: number | null }>(),
    ]);
    return Response.json({
      running: Boolean(story.running),
      producerActive: Boolean(story.running && Date.now() - story.producer_seen_at < 60_000),
      phase: story.phase,
      round: story.round,
      sceneCount: story.scene_count,
      generation: story.generation,
      pendingAction: story.pending_action ? formatAudienceActionLabel(story.pending_action) : null,
      nextAction: story.next_action ? formatAudienceActionLabel(story.next_action) : null,
      error: story.error,
      scenes: scenesResult.results.map((scene) => ({ ...scene, action: formatAudienceActionLabel(scene.action) })),
      comments: commentsResult.results.map((comment) => ({ ...comment, action: comment.action ? formatAudienceActionLabel(comment.action) : null })),
      ideas: ideasResult.results.map((idea) => ({ ...idea, action: formatAudienceActionLabel(idea.action) })),
      classifiedCount: classifiedResult?.count || 0,
      chatOnlyCount: classifiedResult?.chatOnlyCount || 0,
      isOwner: isOwner(request),
      canComment: Boolean(user || guest),
      commentName: guest?.name || user?.email.split("@")[0] || null,
    }, { headers: { "Cache-Control": "private, no-store", ...(guest?.setCookie ? { "Set-Cookie": guest.setCookie } : {}) } });
  } catch (error) {
    return serverError(error);
  }
}
