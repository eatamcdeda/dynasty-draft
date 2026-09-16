import { NextResponse } from "next/server";
import { getOrCreateUserId, hasUnlockedAccess } from "@/lib/entitlement";
import { recordCompletedDraft } from "@/lib/history";

export async function POST(request: Request) {
  const userId = await getOrCreateUserId();
  if (!(await hasUnlockedAccess(userId))) {
    return NextResponse.json({ error: "Members only" }, { status: 401 });
  }
  const payload = await request.json().catch(() => ({}));
  const result = recordCompletedDraft(userId, payload);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
