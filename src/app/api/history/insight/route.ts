import { NextResponse } from "next/server";
import { getOrCreateUserId, hasUnlockedAccess } from "@/lib/entitlement";
import { insightForOverall } from "@/lib/history";

export async function GET(request: Request) {
  const userId = await getOrCreateUserId();
  if (!(await hasUnlockedAccess(userId))) {
    return NextResponse.json({ insight: null });
  }
  const overall = Number(new URL(request.url).searchParams.get("overall"));
  if (!Number.isFinite(overall) || overall < 1) {
    return NextResponse.json({ insight: null });
  }
  return NextResponse.json({ insight: insightForOverall(userId, overall) });
}
