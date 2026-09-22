import { NextResponse } from "next/server";
import { isOwner } from "@/lib/live-state";

export const runtime = "edge";

export async function GET(request: Request) {
  if (!isOwner(request)) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const hedraKey = process.env.HEDRA_API_KEY?.trim();
  let hedraBalance: number | null = null;
  let hedraStatus: "ready" | "missing" | "invalid" | "unreachable" = hedraKey ? "unreachable" : "missing";
  if (hedraKey) {
    try {
      const response = await fetch("https://api.hedra.com/v3/balance", {
        headers: { Authorization: `Key ${hedraKey}` },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (response.ok) {
        const data = (await response.json()) as { balance?: unknown };
        hedraBalance = typeof data.balance === "number" ? data.balance : null;
        hedraStatus = "ready";
      } else if (response.status === 401 || response.status === 403) {
        hedraStatus = "invalid";
      }
    } catch {
      hedraStatus = "unreachable";
    }
  }
  return NextResponse.json({
    jev: Boolean(process.env.TYPESAFE_API_KEY?.trim()),
    hedra: hedraStatus === "ready",
    hedraStatus,
    hedraBalance,
  });
}
