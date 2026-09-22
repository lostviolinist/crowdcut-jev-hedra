import { NextResponse } from "next/server";

import { getHedraJob } from "@/lib/hedra";
import { isOwner } from "@/lib/live-state";

export const runtime = "edge";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!isOwner(request)) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  try {
    const { jobId } = await context.params;
    const job = await getHedraJob(jobId);
    return NextResponse.json(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read this Hedra job.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
