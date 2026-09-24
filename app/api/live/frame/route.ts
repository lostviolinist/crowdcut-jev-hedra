import { getLiveBucket, getLiveDb, getStory, isOwner, isProducer, serverError } from "@/lib/live-state";

export const runtime = "edge";

export async function POST(request: Request) {
  if (!isOwner(request) && !isProducer(request)) return Response.json({ error: "Producer access required." }, { status: 403 });
  try {
    const form = await request.formData();
    const sceneNumber = Number(form.get("sceneNumber"));
    const generation = Number(form.get("generation"));
    const rawCutMs = form.get("cutMs");
    const cutMs = rawCutMs === null ? 8000 : Number(rawCutMs); // Older owner tabs can finish their current scene.
    const image = form.get("frame");
    if (!Number.isInteger(sceneNumber) || !Number.isInteger(generation) || generation < 0 || !(image instanceof File) || !image.type.startsWith("image/") || image.size > 10_000_000 ||
        (sceneNumber > 0 && (!Number.isInteger(cutMs) || cutMs < 500 || cutMs > 8000))) {
      return Response.json({ error: "A valid scene frame is required." }, { status: 400 });
    }
    const db = getLiveDb();
    const story = await getStory(db);
    if (story.phase !== "awaiting_frame" || sceneNumber !== story.scene_count || generation !== story.generation) {
      return Response.json({ error: "This is not the frame the story is waiting for." }, { status: 409 });
    }
    const key = `frames/${generation}/${sceneNumber}-${crypto.randomUUID()}.png`;
    await getLiveBucket().put(key, await image.arrayBuffer(), { httpMetadata: { contentType: "image/png" } });
    const results = await db.batch([
      db.prepare("UPDATE live_story SET frame_key = ?, phase = 'idle', error = NULL WHERE id = 1 AND phase = 'awaiting_frame' AND scene_count = ? AND generation = ?")
        .bind(key, sceneNumber, generation),
      db.prepare("UPDATE live_scenes SET cut_ms = ? WHERE number = ? AND ? > 0 AND EXISTS (SELECT 1 FROM live_story WHERE id = 1 AND phase = 'idle' AND scene_count = ? AND generation = ? AND frame_key = ?)")
        .bind(cutMs, sceneNumber, sceneNumber, sceneNumber, generation, key),
    ]);
    if (!results[0].meta.changes) {
      await getLiveBucket().delete(key);
      return Response.json({ error: "The scene advanced while its frame was uploading." }, { status: 409 });
    }
    return Response.json({ ready: true });
  } catch (error) {
    return serverError(error);
  }
}
