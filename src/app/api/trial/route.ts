import { NextResponse } from "next/server";
import { getOrCreateUserId, hasUnlockedAccess, hasUsedTrial, markTrialUsed } from "@/lib/entitlement";

export async function POST() {
  const userId = await getOrCreateUserId();
  if (await hasUnlockedAccess(userId)) {
    return NextResponse.json({ ok: true, unlocked: true });
  }
  if (await hasUsedTrial()) {
    return NextResponse.json({ error: "Free draft already used", trialUsed: true }, { status: 402 });
  }
  await markTrialUsed();
  return NextResponse.json({ ok: true, trialUsed: true });
}
