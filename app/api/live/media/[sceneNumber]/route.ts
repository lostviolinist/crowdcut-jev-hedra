import { getLiveBucket, getLiveDb, serverError } from "@/lib/live-state";

export const runtime = "edge";

export async function GET(request: Request, context: { params: Promise<{ sceneNumber: string }> }) {
  try {
    const { sceneNumber } = await context.params;
    const number = Number(sceneNumber);
    if (!Number.isInteger(number) || number < 1) return new Response(null, { status: 404 });
    const scene = await getLiveDb().prepare("SELECT video_key FROM live_scenes WHERE number = ?")
      .bind(number).first<{ video_key: string }>();
    if (!scene) return new Response(null, { status: 404 });
    const bucket = getLiveBucket();
    const head = await bucket.head(scene.video_key);
    if (!head) return new Response(null, { status: 404 });
    const rangeHeader = request.headers.get("range");
    let offset = 0;
    let length = head.size;
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${head.size}` } });
      if (match[1]) {
        offset = Number(match[1]);
        const end = match[2] ? Number(match[2]) : head.size - 1;
        length = Math.min(head.size - 1, end) - offset + 1;
      } else if (match[2]) {
        length = Math.min(head.size, Number(match[2]));
        offset = head.size - length;
      }
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length <= 0 || offset >= head.size) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${head.size}` } });
      }
    }
    const object = await bucket.get(scene.video_key, rangeHeader ? { range: { offset, length } } : undefined);
    if (!object) return new Response(null, { status: 404 });
    const headers = new Headers({ "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600" });
    object.writeHttpMetadata(headers);
    if (rangeHeader) {
      headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${head.size}`);
      headers.set("Content-Length", String(length));
      return new Response(object.body, { status: 206, headers });
    }
    headers.set("Content-Length", String(object.size));
    return new Response(object.body, { headers });
  } catch (error) {
    return serverError(error);
  }
}
