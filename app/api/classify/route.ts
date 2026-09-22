import { NextResponse } from "next/server";

import { classifyAudienceComment } from "@/lib/jev";
import type { ExistingAudienceIdea } from "@/lib/story-ideas";
import { sanitizeSceneContext } from "@/lib/story";
import { isOwner } from "@/lib/live-state";

export const runtime = "edge";

export async function POST(request: Request) {
  if (process.env.CROWDCUT_ALLOW_LEGACY !== "1") return NextResponse.json({ error: "This session has moved to the shared story. Refresh the page." }, { status: 410 });
  if (!isOwner(request)) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  try {
    const body = (await request.json()) as { comment?: unknown; existingIdeas?: unknown; sceneContext?: unknown };
    if (typeof body.comment !== "string" || !body.comment.trim()) {
      return NextResponse.json({ error: "A comment is required." }, { status: 400 });
    }
    if (body.comment.length > 500) {
      return NextResponse.json({ error: "Comments must be 500 characters or shorter." }, { status: 400 });
    }

    const existingIdeas: ExistingAudienceIdea[] = Array.isArray(body.existingIdeas)
      ? body.existingIdeas
          .filter(
            (idea): idea is ExistingAudienceIdea =>
              Boolean(
                idea &&
                  typeof idea === "object" &&
                  "id" in idea &&
                  "action" in idea &&
                  typeof idea.id === "string" &&
                  /^idea_[a-z0-9_]{1,60}$/.test(idea.id) &&
                  typeof idea.action === "string" &&
                  idea.action.trim().length > 0 &&
                  idea.action.length <= 120,
              ),
          )
          .slice(0, 16)
          .map((idea) => ({ id: idea.id, action: idea.action.trim() }))
      : [];

    const decision = await classifyAudienceComment(body.comment.trim(), existingIdeas, sanitizeSceneContext(body.sceneContext));
    return NextResponse.json(decision);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Jev classification failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
