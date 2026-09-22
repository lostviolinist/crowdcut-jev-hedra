import { getLiveDb, getStory, currentUser, isOwner, serverError } from "@/lib/live-state";

export const runtime = "edge";

type Scene = { number: number; action: string; created_at: number };
type ChatComment = { id: number; name: string; body: string; action: string | null; created_at: number };
type Idea = { id: string; action: string; votes: number };

export async function GET(request: Request) {
  try {
    const db = getLiveDb();
    const story = await getStory(db);
    const [scenesResult, commentsResult, ideasResult] = await Promise.all([
      db.prepare("SELECT number, action, created_at FROM live_scenes ORDER BY number ASC").all<Scene>(),
      db.prepare("SELECT id, name, body, action, created_at FROM live_comments WHERE state = 'usable' ORDER BY id DESC LIMIT 80").all<ChatComment>(),
      db.prepare("SELECT cluster_id AS id, MIN(action) AS action, COUNT(*) AS votes FROM live_comments WHERE round = ? AND state = 'usable' GROUP BY cluster_id ORDER BY votes DESC, id ASC LIMIT 4").bind(story.round).all<Idea>(),
    ]);
    return Response.json({
      running: Boolean(story.running && Date.now() - story.producer_seen_at < 15_000),
      phase: story.phase,
      round: story.round,
      sceneCount: story.scene_count,
      pendingAction: story.pending_action,
      error: story.error,
      scenes: scenesResult.results,
      comments: commentsResult.results,
      ideas: ideasResult.results,
      isOwner: isOwner(request),
      canComment: Boolean(currentUser(request)),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError(error);
  }
}
