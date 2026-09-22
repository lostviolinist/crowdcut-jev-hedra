import { NextResponse } from "next/server";

import { getHedraJob } from "@/lib/hedra";
import { isOwner } from "@/lib/live-state";

export const runtime = "edge";

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  if (!isOwner(request)) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  try {
    const { jobId } = await context.params;
    const job = await getHedraJob(jobId) as { status?: string; outputs?: Array<{ url?: string; content_type?: string }> };
    const output = job.status === "COMPLETED"
      ? job.outputs?.find((item) => item.url && item.content_type?.startsWith("video/")) || job.outputs?.find((item) => item.url)
      : null;
    if (!output?.url) return NextResponse.json({ error: "Video is not ready." }, { status: 404 });

    const range = request.headers.get("range");
    const response = await fetch(output.url, { headers: range ? { Range: range } : undefined });
    if (!response.ok || !response.body) return NextResponse.json({ error: "Video is temporarily unavailable." }, { status: 502 });
    const headers = new Headers({ "Content-Type": output.content_type || "video/mp4", "Cache-Control": "private, no-store" });
    for (const name of ["content-length", "content-range", "accept-ranges"]) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load video.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
