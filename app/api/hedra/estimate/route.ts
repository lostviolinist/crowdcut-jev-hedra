import { NextResponse } from "next/server";

import { estimateStoryGeneration, parseStoryRenderPreset, sanitizeStoryAction } from "@/lib/hedra";
import { isOwner } from "@/lib/live-state";

export const runtime = "edge";

export async function POST(request: Request) {
  if (!isOwner(request)) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  try {
    const body = (await request.json()) as { action?: unknown; preset?: unknown };
    const action = sanitizeStoryAction(body.action);
    const preset = parseStoryRenderPreset(body.preset);
    if (!action || !preset) {
      return NextResponse.json({ error: "A valid audience action and render preset are required." }, { status: 400 });
    }
    const estimate = await estimateStoryGeneration(action, preset);
    return NextResponse.json(estimate);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not estimate this scene.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
