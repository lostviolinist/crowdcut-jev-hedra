import { NextResponse } from "next/server";

import { parseStoryRenderPreset, sanitizeStoryAction, submitStoryGeneration } from "@/lib/hedra";
import { sanitizeSceneContext } from "@/lib/story";
import { isOwner } from "@/lib/live-state";

export const runtime = "edge";

export async function POST(request: Request) {
  if (process.env.CROWDCUT_ALLOW_LEGACY !== "1") return NextResponse.json({ error: "This session has moved to the shared story. Refresh the page." }, { status: 410 });
  if (!isOwner(request)) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  try {
    const body = await request.formData();
    const action = sanitizeStoryAction(body.get("action"));
    const preset = parseStoryRenderPreset(body.get("preset"));
    const sceneContext = sanitizeSceneContext(body.get("sceneContext"));
    const openingFrame = body.get("openingFrame");
    if (!action || !preset) {
      return NextResponse.json({ error: "A valid audience action and render preset are required." }, { status: 400 });
    }
    if (!(openingFrame instanceof File) || !openingFrame.type.startsWith("image/") || openingFrame.size > 30_000_000) {
      return NextResponse.json({ error: "A valid opening frame is required." }, { status: 400 });
    }
    const job = await submitStoryGeneration(action, openingFrame, preset, sceneContext);
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start this scene.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
