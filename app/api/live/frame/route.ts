import { getLiveBucket, getLiveDb, getStory, isOwner, serverError } from "@/lib/live-state";

export const runtime = "edge";

export async function POST(request: Request) {
  if (!isOwner(request)) return Response.json({ error: "Owner access required." }, { status: 403 });
  try {
    const form = await request.formData();
    const sceneNumber = Number(form.get("sceneNumber"));
    const image = form.get("frame");
    if (!Number.isInteger(sceneNumber) || !(image instanceof File) || !image.type.startsWith("image/") || image.size > 10_000_000) {
      return Response.json({ error: "A valid scene frame is required." }, { status: 400 });
    }
    const db = getLiveDb();
    const story = await getStory(db);
    if (story.phase !== "awaiting_frame" || sceneNumber !== story.scene_count) {
      return Response.json({ error: "This is not the frame the story is waiting for." }, { status: 409 });
    }
    const key = `frames/${sceneNumber}.png`;
    await getLiveBucket().put(key, await image.arrayBuffer(), { httpMetadata: { contentType: "image/png" } });
    const updated = await db.prepare("UPDATE live_story SET frame_key = ?, phase = 'idle', error = NULL WHERE id = 1 AND phase = 'awaiting_frame' AND scene_count = ?")
      .bind(key, sceneNumber).run();
    if (!updated.meta.changes) return Response.json({ error: "The scene advanced while its frame was uploading." }, { status: 409 });
    return Response.json({ ready: true });
  } catch (error) {
    return serverError(error);
  }
}
