import { getLiveDb, getStory, isOwner, serverError } from "@/lib/live-state";

export const runtime = "edge";

export async function POST(request: Request) {
  if (!isOwner(request)) return Response.json({ error: "Owner access required." }, { status: 403 });
  try {
    const input = await request.json() as { action?: unknown };
    if (input.action !== "start" && input.action !== "stop") return Response.json({ error: "Invalid control." }, { status: 400 });
    const db = getLiveDb();
    const story = await getStory(db);
    if (input.action === "start" && story.phase === "submitting") return Response.json({ error: "A scene submission needs review before restarting." }, { status: 409 });
    await db.prepare("UPDATE live_story SET running = ?, producer_seen_at = ?, error = NULL WHERE id = 1")
      .bind(input.action === "start" ? 1 : 0, input.action === "start" ? Date.now() : 0).run();
    return Response.json({ running: input.action === "start" });
  } catch (error) {
    return serverError(error);
  }
}
